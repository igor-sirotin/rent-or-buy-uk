/**
 * Rent-or-buy arithmetic. Pure functions, no DOM — runs in the browser and in Node.
 *
 * Two parallel worlds are walked month by month, and both spend exactly the
 * same cash, so whatever is left at the end is directly comparable:
 *
 *   Buy   pay the deposit, stamp duty and fees up front, then the mortgage
 *         and the cost of owning; sell after N years.
 *   Rent  keep that up-front cash in savings and pay rent instead.
 *
 * In any month where one world costs less than the other, the cheaper world
 * banks the difference in savings. The verdict is the gap between what each
 * world has in hand on the day the property would be sold.
 */
(function (root) {
  'use strict';

  /** Standard residential SDLT bands, England and Northern Ireland, from 1 April 2025. */
  var SDLT_BANDS = [
    { upTo: 125000, rate: 0 },
    { upTo: 250000, rate: 0.02 },
    { upTo: 925000, rate: 0.05 },
    { upTo: 1500000, rate: 0.10 },
    { upTo: Infinity, rate: 0.12 }
  ];

  /** First-time buyer relief: only for purchases up to £500,000. */
  var SDLT_FIRST_TIME_BANDS = [
    { upTo: 300000, rate: 0 },
    { upTo: 500000, rate: 0.05 }
  ];
  var SDLT_FIRST_TIME_CEILING = 500000;

  var SDLT_ADDITIONAL_SURCHARGE = 0.05;   // second homes, on the whole price
  var SDLT_ADDITIONAL_FLOOR = 40000;      // no surcharge below this price
  var SDLT_NON_RESIDENT_SURCHARGE = 0.02; // on the whole price

  var CGT_ALLOWANCE = 3000;
  var CGT_RATE = { basic: 0.18, higher: 0.24, additional: 0.24 };

  /** Savings tax and Personal Savings Allowance by band (rates from 6 April 2027). */
  var SAVINGS_TAX = {
    basic:      { rate: 24, allowance: 1000 },
    higher:     { rate: 44, allowance: 500 },
    additional: { rate: 49, allowance: 0 }
  };

  function banded(price, bands) {
    var tax = 0;
    var from = 0;
    bands.forEach(function (band) {
      if (price > from) tax += (Math.min(price, band.upTo) - from) * band.rate;
      from = band.upTo;
    });
    return tax;
  }

  /**
   * Stamp Duty Land Tax.
   * @param {number} price
   * @param {'first'|'mover'|'additional'} buyer
   * @param {boolean} nonResident
   */
  function stampDuty(price, buyer, nonResident) {
    if (!(price > 0)) return 0;
    var tax = buyer === 'first' && price <= SDLT_FIRST_TIME_CEILING
      ? banded(price, SDLT_FIRST_TIME_BANDS)
      : banded(price, SDLT_BANDS);
    if (buyer === 'additional' && price >= SDLT_ADDITIONAL_FLOOR) {
      tax += price * SDLT_ADDITIONAL_SURCHARGE;
    }
    if (nonResident) tax += price * SDLT_NON_RESIDENT_SURCHARGE;
    return tax;
  }

  /** Level monthly payment that clears `balance` in `months` at a yearly rate (as a fraction). */
  function payment(balance, yearlyRate, months) {
    if (balance <= 0 || months <= 0) return 0;
    var r = yearlyRate / 12;
    if (r === 0) return balance / months;
    return balance * r / (1 - Math.pow(1 + r, -months));
  }

  /** A savings pot that pays tax on its interest once a year. */
  function Pot(start, p) {
    this.balance = start;
    this.paidIn = start;
    this.interest = 0;
    this.tax = 0;
    this.taxableThisYear = 0;
    this.p = p;
    this.monthlyRate = Math.pow(1 + p.savingsRate / 100, 1 / 12) - 1;
  }
  Pot.prototype.month = function (deposit, year) {
    var sheltered = this.p.isaNow + this.p.isaPerYear * year;
    var earned = this.balance * this.monthlyRate;
    this.taxableThisYear += Math.max(0, this.balance - sheltered) * this.monthlyRate;
    this.interest += earned;
    this.balance += earned + deposit;
    this.paidIn += deposit;
  };
  Pot.prototype.settleTax = function () {
    var due = Math.max(0, this.taxableThisYear - this.p.savingsAllowance) * this.p.savingsTax / 100;
    this.tax += due;
    this.balance -= due;
    this.taxableThisYear = 0;
  };

  /** What the buyer hands over on day one. */
  function upfront(p) {
    var duty = p.stampDutyOverride === null || p.stampDutyOverride === undefined
      ? stampDuty(p.price, p.buyer, p.nonResident)
      : p.stampDutyOverride;
    var deposit = Math.min(p.deposit, p.price);
    var fees = p.lenderFee + p.brokerFee + p.solicitor + p.survey + p.moving;
    return { deposit: deposit, stampDuty: duty, fees: fees, total: deposit + duty + fees };
  }

  /**
   * Run both worlds for `years` (defaults to p.years) and report what each has left.
   */
  function simulate(p, years) {
    if (years === undefined) years = p.years;
    var months = Math.max(1, Math.round(years * 12));
    var up = upfront(p);

    var loan = Math.max(0, p.price - up.deposit);
    var termMonths = Math.round(p.term * 12);
    var fixMonths = Math.round(p.fixYears * 12);
    var laterRate = Math.max(0, p.baseRate + p.margin) / 100;

    var balance = loan;
    // With no fixed period the mortgage tracks the base rate from the first month.
    var rate = fixMonths > 0 ? p.fixRate / 100 : laterRate;
    var firstRate = rate;
    var pay = payment(balance, rate, termMonths);
    var firstPayment = pay;
    var laterPayment = null;

    var renter = new Pot(up.total, p);
    var buyer = new Pot(0, p);

    var t = {
      interestPaid: 0, capitalRepaid: 0, upkeep: 0, ownerBills: 0,
      rentPaid: 0, renterBills: 0,
      firstMonthBuy: 0, firstMonthRent: 0
    };

    var growth = p.priceGrowth / 100;
    var inflation = p.inflation / 100;
    var value = p.price;

    for (var m = 0; m < months; m++) {
      var year = Math.floor(m / 12);
      var costIndex = Math.pow(1 + inflation, year);
      value = p.price * Math.pow(1 + growth, m / 12);

      // Mortgage: the fix ends, the rate follows the base rate.
      if (m > 0 && m === fixMonths && m < termMonths) {
        rate = laterRate;
        pay = payment(balance, rate, termMonths - m);
        laterPayment = pay;
      }
      var interest = balance * rate / 12;
      var due = m < termMonths ? Math.min(pay, balance + interest) : 0;
      var extra = Math.min(p.overpayment, Math.max(0, balance + interest - due));
      var capital = due + extra - interest;
      balance = Math.max(0, balance - capital);
      t.interestPaid += Math.min(interest, due + extra);
      t.capitalRepaid += capital;

      var upkeep = value * p.maintenance / 100 / 12 + p.serviceCharge / 12 * costIndex;
      var ownerBills = (p.buyUtilities + p.buyCouncilTax + p.buyInsurance) * costIndex;
      var buyOut = due + extra + upkeep + ownerBills;

      var rent = p.rent * Math.pow(1 + p.rentGrowth / 100, year);
      var renterBills = (p.rentUtilities + p.rentCouncilTax + p.rentInsurance) * costIndex;
      var rentOut = rent + renterBills;

      t.upkeep += upkeep;
      t.ownerBills += ownerBills;
      t.rentPaid += rent;
      t.renterBills += renterBills;
      if (m === 0) { t.firstMonthBuy = buyOut; t.firstMonthRent = rentOut; }

      // Whoever pays less this month banks the difference.
      renter.month(Math.max(0, buyOut - rentOut), year);
      buyer.month(Math.max(0, rentOut - buyOut), year);

      if (m % 12 === 11 || m === months - 1) {
        renter.settleTax();
        buyer.settleTax();
      }
    }

    // Sale day.
    var salePrice = p.price * Math.pow(1 + growth, months / 12);
    var agentFee = salePrice * p.agentFee / 100;
    var earlyRepayment = months < fixMonths ? balance * p.earlyRepayment / 100 : 0;
    var sellingCosts = agentFee + p.saleLegal + earlyRepayment;

    var cgt = 0;
    if (!p.mainResidence) {
      var gain = salePrice - p.price - up.stampDuty - p.solicitor - p.survey - agentFee - p.saleLegal;
      cgt = Math.max(0, gain - CGT_ALLOWANCE) * (CGT_RATE[p.taxBand] || CGT_RATE.higher);
    }

    var equity = salePrice - balance - sellingCosts - cgt;
    var buyWealth = equity + buyer.balance;
    var rentWealth = renter.balance;

    return {
      years: months / 12,
      upfront: up,
      loan: loan,
      firstPayment: firstPayment,
      firstRate: firstRate * 100,
      laterPayment: laterPayment,
      laterRate: laterRate * 100,
      salePrice: salePrice,
      mortgageLeft: balance,
      agentFee: agentFee,
      saleLegal: p.saleLegal,
      earlyRepayment: earlyRepayment,
      sellingCosts: sellingCosts,
      cgt: cgt,
      equity: equity,
      buyerPot: buyer,
      renterPot: renter,
      totals: t,
      buyWealth: buyWealth,
      rentWealth: rentWealth,
      advantage: buyWealth - rentWealth,
      advantageToday: (buyWealth - rentWealth) / Math.pow(1 + inflation, months / 12)
    };
  }

  /** Buy-minus-rent for a sale in each whole year from 1 to `horizon`. */
  function curve(p, horizon) {
    var points = [];
    for (var y = 1; y <= horizon; y++) {
      points.push({ year: y, advantage: simulate(p, y).advantage });
    }
    return points;
  }

  /**
   * The first year from which buying is ahead and stays ahead to the horizon.
   * Returns null when renting still leads at the horizon.
   */
  function breakEven(points) {
    var from = null;
    points.forEach(function (point) {
      if (point.advantage > 0) { if (from === null) from = point.year; }
      else from = null;
    });
    return from;
  }

  var api = {
    stampDuty: stampDuty,
    payment: payment,
    upfront: upfront,
    simulate: simulate,
    curve: curve,
    breakEven: breakEven,
    SAVINGS_TAX: SAVINGS_TAX,
    CGT_RATE: CGT_RATE,
    CGT_ALLOWANCE: CGT_ALLOWANCE
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RentOrBuy = api;
})(typeof self !== 'undefined' ? self : this);
