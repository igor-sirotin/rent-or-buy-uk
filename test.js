// Sanity checks for model.js — run with `node test.js`.
'use strict';
var assert = require('assert');
var m = require('./model.js');

function near(actual, expected, tolerance, label) {
  assert(Math.abs(actual - expected) <= tolerance, label + ': got ' + actual + ', expected ' + expected);
}

var base = {
  rent: 1800, rentUtilities: 190, rentCouncilTax: 170, rentInsurance: 15,
  price: 400000, deposit: 60000, years: 7,
  term: 30, fixRate: 4.75, fixYears: 5, margin: 1, overpayment: 0, earlyRepayment: 2,
  stampDutyOverride: null, lenderFee: 999, brokerFee: 0, solicitor: 2000, survey: 600, moving: 2000,
  buyUtilities: 190, buyCouncilTax: 170, buyInsurance: 35, maintenance: 1, serviceCharge: 0,
  agentFee: 1.5, saleLegal: 1800,
  baseRate: 4, priceGrowth: 3, rentGrowth: 3.5, savingsRate: 4, inflation: 3,
  buyer: 'mover', nonResident: false, mainResidence: true,
  taxBand: 'higher', savingsTax: 44, savingsAllowance: 500, isaNow: 20000, isaPerYear: 12000
};
function with_(changes) { return Object.assign({}, base, changes); }

// Stamp duty, against HMRC's published examples and bands.
assert.strictEqual(m.stampDuty(400000, 'mover', false), 10000);
assert.strictEqual(m.stampDuty(295000, 'mover', false), 4750);      // gov.uk worked example
assert.strictEqual(m.stampDuty(400000, 'first', false), 5000);
assert.strictEqual(m.stampDuty(300000, 'first', false), 0);
assert.strictEqual(m.stampDuty(600000, 'first', false), 20000);     // relief lost above £500k
assert.strictEqual(m.stampDuty(400000, 'additional', false), 30000);
assert.strictEqual(m.stampDuty(400000, 'mover', true), 18000);
assert.strictEqual(m.stampDuty(2000000, 'mover', false), 153750);
assert.strictEqual(m.stampDuty(125000, 'mover', false), 0);

// Mortgage payment: £340,000 over 30 years at 4.75%.
near(m.payment(340000, 0.0475, 360), 1773.60, 0.05, 'payment');
near(m.payment(120000, 0, 120), 1000, 1e-9, 'zero-rate payment');

// A full-term mortgage is cleared exactly.
var full = m.simulate(with_({ years: 30, fixYears: 30 }));
near(full.mortgageLeft, 0, 0.01, 'balance at end of term');
near(full.totals.capitalRepaid, 340000, 0.01, 'capital repaid');

// With no growth, no interest, no inflation and no costs, the two worlds are
// the same cash moved around: buying differs only by interest saved vs rent paid.
var flat = with_({
  years: 5, fixRate: 0, fixYears: 40, priceGrowth: 0, rentGrowth: 0, savingsRate: 0, inflation: 0,
  maintenance: 0, agentFee: 0, saleLegal: 0, lenderFee: 0, solicitor: 0, survey: 0, moving: 0,
  stampDutyOverride: 0, earlyRepayment: 0, buyInsurance: 15, rent: 0
});
var f = m.simulate(flat);
// Buyer ends with the house free of the remaining loan = deposit + capital repaid; the renter
// (paying no rent) banks every mortgage payment on top of the deposit. Identical.
near(f.advantage, 0, 0.01, 'cash-neutral world');
// Now charge rent: buying is ahead by exactly the rent paid.
var f2 = m.simulate(Object.assign({}, flat, { rent: 1000 }));
near(f2.advantage, 60000, 0.01, 'rent is the only difference');

// Money is conserved in each world: paid-in + interest - tax = balance.
var r = m.simulate(base);
[r.renterPot, r.buyerPot].forEach(function (pot) {
  near(pot.paidIn + pot.interest - pot.tax, pot.balance, 0.01, 'pot conservation');
});
assert(r.renterPot.tax > 0, 'higher-rate saver pays some tax');
assert.strictEqual(m.simulate(with_({ isaNow: 1e9 })).renterPot.tax, 0, 'fully sheltered pays none');

// Selling inside the fix triggers the early repayment charge; after it, not.
assert(m.simulate(base, 3).earlyRepayment > 0);
assert.strictEqual(m.simulate(base, 5).earlyRepayment, 0);

// After the fix the rate is base + margin and the payment is re-struck.
near(r.laterRate, 5, 1e-9, 'rate after fix');
assert(r.laterPayment > r.firstPayment);

// No fixed period: the mortgage is on base + margin from the first month, and
// the first payment is struck at that rate, not the unused fixed rate.
var tracker = m.simulate(with_({ fixYears: 0, fixRate: 9 }));
near(tracker.firstRate, 5, 1e-9, 'first rate with no fix');
near(tracker.firstPayment, m.payment(340000, 0.05, 360), 0.01, 'first payment with no fix');
assert.strictEqual(tracker.laterPayment, null, 'no second payment with no fix');
near(tracker.advantage, m.simulate(with_({ fixYears: 0, fixRate: 5 })).advantage, 1e-6, 'unused fixed rate has no effect');
near(r.firstRate, 4.75, 1e-9, 'first rate with a fix');

// Savings tax presets: Budget of 28 October 2026, from 6 April 2027.
assert.deepStrictEqual([m.SAVINGS_TAX.basic.rate, m.SAVINGS_TAX.higher.rate, m.SAVINGS_TAX.additional.rate], [24, 44, 49]);

// CGT only when it is not the main residence, and it lowers the outcome.
assert.strictEqual(r.cgt, 0);
var taxed = m.simulate(with_({ mainResidence: false }));
assert(taxed.cgt > 0 && taxed.buyWealth < r.buyWealth);
near(taxed.cgt, (taxed.salePrice - 400000 - 10000 - 2600 - taxed.agentFee - 1800 - 3000) * 0.24, 0.01, 'cgt');

// Direction checks.
assert(m.simulate(with_({ priceGrowth: 6 })).advantage > r.advantage, 'faster house prices favour buying');
assert(m.simulate(with_({ savingsRate: 7 })).advantage < r.advantage, 'better savings favour renting');
assert(m.simulate(with_({ rent: 2500 })).advantage > r.advantage, 'dearer rent favours buying');
assert(m.simulate(with_({ buyer: 'additional' })).advantage < r.advantage, 'surcharge hurts buying');

// Break-even: first year from which buying stays ahead.
assert.strictEqual(m.breakEven([{ year: 1, advantage: -1 }, { year: 2, advantage: 2 }, { year: 3, advantage: 3 }]), 2);
assert.strictEqual(m.breakEven([{ year: 1, advantage: 1 }, { year: 2, advantage: -2 }]), null);

console.log('all checks pass');
console.log('defaults, year 7: buy', Math.round(r.buyWealth), 'rent', Math.round(r.rentWealth),
  'advantage', Math.round(r.advantage), 'break-even year', m.breakEven(m.curve(base, 15)));
console.log(m.curve(base, 15).map(function (p) { return Math.round(p.advantage); }).join(' '));
