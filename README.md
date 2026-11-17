# Rent, or buy and sell later

A single-page UK calculator that answers one question: **if you would sell again in
N years, is it worth buying a home now — or are you better off renting and leaving
the money in a savings account?**

No build step, no dependencies, no tracking. Static files only.

## The idea

Two parallel worlds are walked month by month, and both spend exactly the same cash:

- **Buy** — pay the deposit, stamp duty and fees up front, then the mortgage and the
  cost of owning. After N years, sell, repay the lender and pay the selling costs.
- **Rent** — keep that up-front cash in savings and pay rent instead.

In any month where one world costs less than the other, the cheaper one banks the
difference in savings. The verdict is the gap between what each has **in hand on sale
day**. The chart repeats that sum for every possible year of sale, which shows the
break-even point — click a year to sell then.

## The four groups of parameters

| Group | What it holds |
| --- | --- |
| Renting | rent, heating/energy/water, council tax, insurance |
| Buying | price, deposit, year of sale; mortgage term, fixed rate and period, margin over base rate afterwards, overpayments, early repayment charge; stamp duty, lender, broker, solicitor, survey, moving; bills, upkeep, service charge; estate agent and solicitor on sale |
| The economy | expected base rate, house price growth, rent growth, savings rate, inflation |
| You | first home / next home / second home, UK residency, main residence or not, income tax band, tax on savings interest, ISA shelter |

Stamp duty is worked out automatically (England and Northern Ireland bands from
April 2025, first-time buyer relief, the 5% additional-property surcharge, the 2%
non-resident surcharge). Type a figure over it for Scotland or Wales.

## Saving calculations

A calculation can be saved under a name and reopened from the row at the top of the
page. Saves live in this browser's storage — nothing is uploaded or downloaded. Change
the numbers of a saved calculation and a **save** button appears (with **revert**
beside it); **save as new** keeps a variant under another name.

Every value is also kept in the page address, so a scenario can be bookmarked or
shared. Opening a shared link never selects one of your own saves, so it cannot be
overwritten by accident.

## Caveats

It is an estimate resting on your own guesses about rates and prices. It leaves out
Lifetime ISA bonuses, remortgage fees, the cost of moving between rentals, and
everything that is not money. Savings tax uses the rates that apply from April 2027
(22% / 42% / 47%). Capital gains tax, where the home is not a main residence, is a
flat 18% or 24% above the £3,000 allowance. **Not financial, tax or mortgage advice.**

## Running it

```sh
python3 -m http.server 8000   # or just open index.html
node test.js                  # sanity checks for the arithmetic
```

## Layout

```
index.html   markup and the fixed footnotes
model.js     the arithmetic — stamp duty, mortgage, the two worlds; no DOM
app.js       the parameter list, rendering, chart, page address
styles.css   styling
test.js      checks for model.js
```

## License

[MIT](LICENSE)
