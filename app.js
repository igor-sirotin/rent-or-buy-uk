/**
 * Renders the four groups of parameters, keeps them in the page address, and
 * redraws the verdict, chart and ledgers on every change. All the arithmetic
 * lives in model.js.
 */
(function () {
  'use strict';

  var model = window.RentOrBuy;

  /* The parameters ---------------------------------------------------------
     kind: 'money' | 'percent' | 'years' (number fields), 'choice', 'tick'.
     A number field with `auto` may be left empty; the model then works it out. */

  var GROUPS = [
    {
      id: 'rent', title: 'Renting', fields: [
        { id: 'rent', label: 'Rent', kind: 'money', per: 'mo', def: 1500 },
        { id: 'rentUtilities', label: 'Heating, energy, water', kind: 'money', per: 'mo', def: 150 },
        { id: 'rentCouncilTax', label: 'Council tax', kind: 'money', per: 'mo', def: 150 },
        { id: 'rentInsurance', label: 'Insurance and other', kind: 'money', per: 'mo', def: 0 }
      ]
    },
    {
      id: 'buy', title: 'Buying', fields: [
        { sub: 'The property' },
        { id: 'price', label: 'Price', kind: 'money', def: 200000, wide: true },
        { id: 'deposit', label: 'Deposit', kind: 'money', def: 20000, wide: true },
        { id: 'years', label: 'Sell after', kind: 'years', def: 5, min: 1, max: 40 },

        { sub: 'Mortgage' },
        { id: 'term', label: 'Term', kind: 'years', def: 25, min: 1, max: 40 },
        { id: 'fixRate', label: 'Fixed rate', kind: 'percent', def: 5 },
        { id: 'fixYears', label: 'Fixed for', kind: 'years', def: 5, min: 0, max: 40 },
        { id: 'margin', label: 'Then base rate plus', kind: 'percent', def: 1 },
        { id: 'overpayment', label: 'Overpayment', kind: 'money', per: 'mo', def: 0 },
        { id: 'earlyRepayment', label: 'Early repayment charge', kind: 'percent', def: 2 },

        { sub: 'Cost of the deal' },
        { id: 'stampDutyOverride', label: 'Stamp duty (blank: standard)', kind: 'money', def: null, auto: true, wide: true },
        { id: 'lenderFee', label: 'Lender fee', kind: 'money', def: 1000 },
        { id: 'brokerFee', label: 'Broker fee', kind: 'money', def: 0 },
        { id: 'solicitor', label: 'Solicitor and searches', kind: 'money', def: 2000 },
        { id: 'survey', label: 'Survey', kind: 'money', def: 500 },
        { id: 'moving', label: 'Moving and furnishing', kind: 'money', def: 1000 },

        { sub: 'Cost of owning' },
        { id: 'buyUtilities', label: 'Heating, energy, water', kind: 'money', per: 'mo', def: 150 },
        { id: 'buyCouncilTax', label: 'Council tax', kind: 'money', per: 'mo', def: 150 },
        { id: 'buyInsurance', label: 'Insurance and other', kind: 'money', per: 'mo', def: 25 },
        { id: 'maintenance', label: 'Upkeep, of value a year', kind: 'percent', def: 1 },
        { id: 'serviceCharge', label: 'Service charge, ground rent', kind: 'money', per: 'yr', def: 0 },

        { sub: 'Cost of selling' },
        { id: 'agentFee', label: 'Estate agent, with VAT', kind: 'percent', def: 1.5 },
        { id: 'saleLegal', label: 'Solicitor', kind: 'money', def: 1500 }
      ]
    },
    {
      id: 'economy', title: 'The economy', fields: [
        { id: 'baseRate', label: 'Base rate, expected', kind: 'percent', def: 4 },
        { id: 'priceGrowth', label: 'House prices, a year', kind: 'percent', def: 3 },
        { id: 'rentGrowth', label: 'Rents, a year', kind: 'percent', def: 3 },
        { id: 'savingsRate', label: 'Savings account', kind: 'percent', def: 4 },
        { id: 'inflation', label: 'Inflation, on bills', kind: 'percent', def: 3 }
      ]
    },
    {
      id: 'you', title: 'You', fields: [
        { sub: 'This purchase is your' },
        { id: 'buyer', kind: 'choice', def: 'first', options: [
          ['first', 'first home'], ['mover', 'next home'], ['additional', 'second home']
        ] },
        { id: 'nonResident', label: 'Not UK resident', kind: 'tick', def: false },
        { id: 'mainResidence', label: 'Main residence — no tax on the gain', kind: 'tick', def: true },

        { sub: 'Income tax band' },
        { id: 'taxBand', kind: 'choice', def: 'basic', options: [
          ['basic', 'basic'], ['higher', 'higher'], ['additional', 'additional']
        ] },
        { id: 'savingsTax', label: 'Tax on savings interest', kind: 'percent', def: 22 },
        { id: 'savingsAllowance', label: 'Tax-free interest', kind: 'money', per: 'yr', def: 1000 },

        { sub: 'Savings held in ISAs' },
        { id: 'isaNow', label: 'Sheltered today', kind: 'money', def: 0, wide: true },
        { id: 'isaPerYear', label: 'Added each year', kind: 'money', def: 0, wide: true }
      ]
    }
  ];

  var FIELDS = {};
  GROUPS.forEach(function (group) {
    group.fields.forEach(function (field) { if (field.id) FIELDS[field.id] = field; });
  });

  var state = {};
  var inputs = {};

  function defaults() {
    var values = {};
    Object.keys(FIELDS).forEach(function (id) { values[id] = FIELDS[id].def; });
    return values;
  }

  /* Formatting ------------------------------------------------------------- */

  function money(amount) {
    var rounded = Math.round(amount);
    return (rounded < 0 ? '−£' : '£') + Math.abs(rounded).toLocaleString('en-GB');
  }

  function signed(amount) {
    return (Math.round(amount) > 0 ? '+' : '') + money(amount);
  }

  function shortMoney(amount) {
    var abs = Math.abs(amount);
    var sign = amount < 0 ? '−£' : '£';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1) + 'm';
    if (abs >= 1e3) return sign + Math.round(abs / 1e3) + 'k';
    return sign + Math.round(abs);
  }

  function percent(value) {
    return (Math.round(value * 100) / 100) + '%';
  }

  function years(n) {
    return n + (n === 1 ? ' year' : ' years');
  }

  function display(field, value) {
    if (value === null || value === undefined) return '';
    return field.kind === 'money' ? Math.round(value).toLocaleString('en-GB') : String(value);
  }

  /** Text typed into a number field → a number, or null when it is empty or nonsense. */
  function parse(field, text) {
    var cleaned = String(text).replace(/[,\s£%]/g, '');
    if (cleaned === '') return field.auto ? null : 0;
    var value = Number(cleaned);
    if (!isFinite(value)) return field.auto ? null : 0;
    if (field.kind !== 'percent' || field.id === 'savingsTax') value = Math.max(0, value);
    if (field.kind === 'years') value = Math.round(value);
    if (field.min !== undefined) value = Math.max(field.min, value);
    if (field.max !== undefined) value = Math.min(field.max, value);
    return value;
  }

  /* The page address ------------------------------------------------------- */

  function readAddress() {
    var values = defaults();
    var query = new URLSearchParams(addressText());
    query.forEach(function (raw, id) {
      var field = FIELDS[id];
      if (!field) return;
      if (field.kind === 'tick') values[id] = raw === '1';
      else if (field.kind === 'choice') {
        if (field.options.some(function (option) { return option[0] === raw; })) values[id] = raw;
      } else values[id] = parse(field, raw);
    });
    return values;
  }

  function writeAddress() {
    var query = new URLSearchParams();
    Object.keys(FIELDS).forEach(function (id) {
      var field = FIELDS[id];
      var value = state[id];
      if (value === field.def) return;
      query.set(id, field.kind === 'tick' ? (value ? '1' : '0') : String(value));
    });
    var hash = query.toString();
    history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
  }

  function addressText() {
    return location.hash.replace(/^#/, '');
  }

  /* Saved calculations -----------------------------------------------------
     Named sets of values kept in this browser's storage. `current` is the name
     of the one being worked on; it is "dirty" when the form no longer matches
     what was saved under that name. */

  var STORE_KEY = 'rent-or-buy-uk:saved';   // localStorage: [{ name, values }]
  var LAST_KEY = 'rent-or-buy-uk:last';     // localStorage: name last worked on
  var CURRENT_KEY = 'rent-or-buy-uk:current'; // sessionStorage: selection in this tab

  var saves = [];
  var current = null;
  var naming = false;

  function storage(kind) {
    try { return window[kind]; } catch (error) { return null; }
  }
  function readStore(kind, key) {
    try { return storage(kind).getItem(key); } catch (error) { return null; }
  }
  function writeStore(kind, key, value) {
    try {
      if (value === null) storage(kind).removeItem(key);
      else storage(kind).setItem(key, value);
    } catch (error) { /* private mode or full: carry on in memory */ }
  }

  /** Stored values → a full, valid set, so old or hand-edited saves cannot break the form. */
  function clean(stored) {
    var values = defaults();
    Object.keys(FIELDS).forEach(function (id) {
      var field = FIELDS[id];
      var value = stored ? stored[id] : undefined;
      if (field.kind === 'tick') { if (typeof value === 'boolean') values[id] = value; }
      else if (field.kind === 'choice') {
        if (field.options.some(function (option) { return option[0] === value; })) values[id] = value;
      } else if (typeof value === 'number' && isFinite(value)) values[id] = parse(field, String(value));
      else if (value === null && field.auto) values[id] = null;
    });
    return values;
  }

  function same(a, b) {
    return Object.keys(FIELDS).every(function (id) { return a[id] === b[id]; });
  }

  function find(name) {
    for (var i = 0; i < saves.length; i++) if (saves[i].name === name) return saves[i];
    return null;
  }

  function loadSaves() {
    try {
      var list = JSON.parse(readStore('localStorage', STORE_KEY) || '[]');
      saves = (Array.isArray(list) ? list : []).filter(function (item) {
        return item && typeof item.name === 'string' && item.name;
      }).map(function (item) { return { name: item.name, values: clean(item.values) }; });
    } catch (error) { saves = []; }
  }

  function storeSaves() {
    writeStore('localStorage', STORE_KEY, JSON.stringify(saves));
  }

  function select(name) {
    current = name;
    writeStore('sessionStorage', CURRENT_KEY, name);
    if (name) writeStore('localStorage', LAST_KEY, name);
  }

  function isDirty() {
    var saved = current && find(current);
    return !!saved && !same(saved.values, state);
  }

  function snapshot() {
    return clean(state);
  }

  function saveCurrent() {
    var saved = find(current);
    if (!saved) return;
    saved.values = snapshot();
    storeSaves();
    renderSaves();
  }

  function saveAs(name) {
    name = name.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) return false;
    var existing = find(name);
    if (existing && name !== current &&
        !window.confirm('“' + name + '” already exists. Replace it with this calculation?')) return false;
    if (existing) existing.values = snapshot();
    else saves.push({ name: name, values: snapshot() });
    storeSaves();
    select(name);
    naming = false;
    renderSaves();
    return true;
  }

  function open(name) {
    var saved = find(name);
    if (!saved) return;
    if (name !== current && isDirty() &&
        !window.confirm('Discard the unsaved changes to “' + current + '”?')) return;
    state = clean(saved.values);
    select(name);
    naming = false;
    sync(true);
    update();
  }

  function remove() {
    if (!current || !window.confirm('Delete “' + current + '”? The numbers on the page stay as they are.')) return;
    saves = saves.filter(function (item) { return item.name !== current; });
    storeSaves();
    select(null);
    if (readStore('localStorage', LAST_KEY)) writeStore('localStorage', LAST_KEY, null);
    renderSaves();
  }

  function action(label, handler, primary) {
    var button = el('button', 'pill-btn' + (primary ? ' pill-btn--primary' : ''), label);
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
  }

  function renderSaves() {
    var bar = document.getElementById('saves');
    var dirty = isDirty();
    bar.textContent = '';

    var list = el('div', 'saves__list');
    list.appendChild(el('span', 'eyebrow', 'Saved'));
    if (!saves.length) {
      list.appendChild(el('span', 'saves__empty', 'Nothing yet. Name this calculation to keep it in this browser.'));
    }
    saves.forEach(function (item) {
      var active = item.name === current;
      var chip = el('button', 'chip' + (active ? ' is-active' : ''), item.name);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(active));
      if (active && dirty) {
        chip.appendChild(el('span', 'chip__dot', ' •'));
        chip.title = 'Unsaved changes';
      }
      chip.addEventListener('click', function () { open(item.name); });
      list.appendChild(chip);
    });
    bar.appendChild(list);

    var actions = el('div', 'saves__actions');
    if (naming) {
      var form = el('form', 'saves__name');
      var input = el('input');
      input.type = 'text';
      input.maxLength = 60;
      input.placeholder = 'name, e.g. option A';
      input.setAttribute('aria-label', 'Name for this calculation');
      form.appendChild(input);
      var confirmButton = el('button', 'pill-btn pill-btn--primary', 'save');
      confirmButton.type = 'submit';
      form.appendChild(confirmButton);
      form.appendChild(action('cancel', function () { naming = false; renderSaves(); }));
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!saveAs(input.value)) input.focus();
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') { naming = false; renderSaves(); }
      });
      actions.appendChild(form);
      bar.appendChild(actions);
      input.focus();
      return;
    }

    if (dirty) {
      actions.appendChild(action('save', saveCurrent, true));
      actions.appendChild(action('revert', function () {
        state = clean(find(current).values);
        sync(true);
        update();
      }));
    }
    actions.appendChild(action(current ? 'save as new' : 'save as', function () {
      naming = true;
      renderSaves();
    }, !current && !saves.length));
    if (current) actions.appendChild(action('delete', remove));
    bar.appendChild(actions);
  }

  /* Building the form ------------------------------------------------------ */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function numberField(field) {
    var row = el('label', 'field' + (field.wide ? ' field--wide' : ''));
    row.appendChild(el('span', 'field__label', field.label));

    var box = el('span', 'field__box');
    if (field.kind === 'money') box.appendChild(el('span', null, '£'));
    var input = el('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.id = 'f-' + field.id;
    box.appendChild(input);
    var suffix = field.kind === 'percent' ? '%'
      : field.kind === 'years' ? 'yrs'
      : field.per ? '/' + field.per : '';
    if (suffix) box.appendChild(el('span', null, suffix));
    row.appendChild(box);

    input.addEventListener('input', function () {
      state[field.id] = parse(field, input.value);
      update();
    });
    input.addEventListener('blur', function () {
      input.value = display(field, state[field.id]);
    });
    input.addEventListener('focus', function () { input.select(); });

    inputs[field.id] = { sync: function () { input.value = display(field, state[field.id]); }, input: input };
    return row;
  }

  function choiceField(field) {
    var wrap = el('div', 'choice');
    wrap.setAttribute('role', 'group');
    var buttons = field.options.map(function (option) {
      var button = el('button', 'choice__btn', option[1]);
      button.type = 'button';
      button.addEventListener('click', function () {
        state[field.id] = option[0];
        if (field.id === 'taxBand') applyTaxBand(option[0]);
        sync();
        update();
      });
      wrap.appendChild(button);
      return { value: option[0], node: button };
    });
    inputs[field.id] = {
      sync: function () {
        buttons.forEach(function (button) {
          var active = button.value === state[field.id];
          button.node.classList.toggle('is-active', active);
          button.node.setAttribute('aria-pressed', String(active));
        });
      }
    };
    return wrap;
  }

  function tickField(field) {
    var row = el('label', 'tick');
    var input = el('input');
    input.type = 'checkbox';
    row.appendChild(input);
    row.appendChild(el('span', null, field.label));
    input.addEventListener('change', function () {
      state[field.id] = input.checked;
      update();
    });
    inputs[field.id] = { sync: function () { input.checked = !!state[field.id]; } };
    return row;
  }

  function buildForm() {
    var form = document.getElementById('params');
    GROUPS.forEach(function (group) {
      var set = el('fieldset', 'group group--' + group.id);
      set.appendChild(el('legend', 'group__title', group.title));
      group.fields.forEach(function (field) {
        if (field.sub) { set.appendChild(el('div', 'group__sub', field.sub)); return; }
        set.appendChild(
          field.kind === 'choice' ? choiceField(field)
            : field.kind === 'tick' ? tickField(field)
            : numberField(field)
        );
      });
      if (group.id === 'rent') {
        set.appendChild(el('p', 'field__hint', 'Rent rises each year at the rate set under the economy.'));
      }
      if (group.id === 'economy') {
        set.appendChild(el('p', 'field__hint', 'Averages over the years you would own. The base rate sets the mortgage once the fix ends.'));
      }
      form.appendChild(set);
    });
    form.addEventListener('submit', function (event) { event.preventDefault(); });
  }

  /** A band sets the usual savings tax rate and allowance; both stay editable. */
  function applyTaxBand(band) {
    var preset = model.SAVINGS_TAX[band];
    state.savingsTax = preset.rate;
    state.savingsAllowance = preset.allowance;
  }

  function sync(all) {
    Object.keys(inputs).forEach(function (id) {
      if (!all && inputs[id].input && inputs[id].input === document.activeElement) return;
      inputs[id].sync();
    });
  }

  /* Drawing the answer ----------------------------------------------------- */

  function text(id, value) {
    document.getElementById(id).textContent = value;
  }

  function renderVerdict(result, points, horizon) {
    var buying = result.advantage >= 0;
    var n = result.years;

    document.getElementById('verdict').classList.toggle('is-rent', !buying);
    text('verdict-eyebrow', 'sold after ' + years(n) + ', ' + (buying ? 'buying' : 'renting') + ' is ahead by');
    text('verdict-figure', money(Math.abs(result.advantage)));
    text('verdict-name', buying ? 'Buy' : 'Keep renting');
    text('verdict-meta',
      money(result.buyWealth) + ' in hand buying  ·  ' + money(result.rentWealth) + ' renting');

    var from = model.breakEven(points);
    var note;
    if (from === 1) note = 'Buying is ahead whichever year you sell.';
    else if (from !== null) note = 'Buying only pulls ahead if you stay ' + years(from) + ' or more. Sell sooner and the costs of the deal outweigh the gain.';
    else note = 'On these numbers renting stays ahead for any sale in the next ' + years(horizon) + '.';
    note += ' That gap is ' + money(Math.abs(result.advantageToday)) + ' in today’s money.';
    text('verdict-note', note);
  }

  function renderFacts(result) {
    var up = result.upfront;
    var t = result.totals;
    var facts = [
      ['Cash needed to buy', money(up.total),
        money(up.deposit) + ' deposit, ' + money(up.stampDuty) + ' stamp duty, ' + money(up.fees) + ' fees'],
      ['Mortgage', money(result.firstPayment) + ' a month',
        result.laterPayment === null
          ? money(result.loan) + ' borrowed, ' + percent(result.loan / (state.price || 1) * 100) + ' of the price'
          : 'then ' + money(result.laterPayment) + ' at ' + percent(result.laterRate) + ' once the fix ends'],
      ['First month, buying', money(t.firstMonthBuy), 'mortgage, upkeep and bills'],
      ['First month, renting', money(t.firstMonthRent), 'rent and bills']
    ];
    var list = document.getElementById('facts');
    list.textContent = '';
    facts.forEach(function (fact) {
      var item = el('div');
      item.appendChild(el('dt', null, fact[0]));
      var value = el('dd', null, fact[1]);
      value.appendChild(el('small', null, fact[2]));
      item.appendChild(value);
      list.appendChild(item);
    });
  }

  function ledger(kind, title, rows, total, aside) {
    var box = el('div', 'ledger ledger--' + kind);
    box.appendChild(el('h2', 'ledger__title', title));
    rows.forEach(function (row) {
      if (!row) return;
      var line = el('div', 'ledger__row');
      line.appendChild(el('span', null, row[0]));
      line.appendChild(el('span', null, row[1]));
      box.appendChild(line);
    });
    var sum = el('div', 'ledger__row ledger__row--total');
    sum.appendChild(el('span', null, 'In hand'));
    sum.appendChild(el('span', null, money(total)));
    box.appendChild(sum);
    box.appendChild(el('p', 'ledger__aside', aside));
    return box;
  }

  function renderLedgers(result) {
    var n = years(result.years);
    var t = result.totals;
    var buyerPot = result.buyerPot;
    var renterPot = result.renterPot;
    var costs = result.agentFee + result.saleLegal;

    var buy = ledger('buy', 'If you buy, then sell after ' + n, [
      ['Sale price', money(result.salePrice)],
      ['Mortgage still owed', money(-result.mortgageLeft)],
      ['Estate agent and solicitor', money(-costs)],
      result.earlyRepayment > 0 ? ['Early repayment charge', money(-result.earlyRepayment)] : null,
      result.cgt > 0 ? ['Capital gains tax', money(-result.cgt)] : null,
      buyerPot.balance > 0.5 ? ['Saved in the months owning cost less', money(buyerPot.balance)] : null
    ], result.buyWealth,
      'Along the way: ' + money(t.interestPaid) + ' of mortgage interest, ' +
      money(result.upfront.stampDuty + result.upfront.fees) + ' of stamp duty and fees, ' +
      money(t.upkeep) + ' of upkeep.');

    var contributions = renterPot.paidIn - result.upfront.total;
    var rent = ledger('rent', 'If you keep renting for ' + n, [
      ['Deposit and buying costs, kept in savings', money(result.upfront.total)],
      contributions > 0.5 ? ['Saved in the months renting cost less', money(contributions)] : null,
      ['Interest earned', money(renterPot.interest)],
      renterPot.tax > 0.5 ? ['Tax on that interest', money(-renterPot.tax)] : null
    ], result.rentWealth,
      'Along the way: ' + money(t.rentPaid) + ' of rent, reaching ' +
      money(state.rent * Math.pow(1 + state.rentGrowth / 100, Math.max(0, Math.ceil(result.years) - 1))) +
      ' a month in the final year.');

    var container = document.getElementById('ledgers');
    container.textContent = '';
    container.appendChild(buy);
    container.appendChild(rent);
  }

  var SVG = 'http://www.w3.org/2000/svg';

  function svg(tag, attrs, content) {
    var node = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function renderChart(points, sellYear) {
    var chart = document.getElementById('chart');
    chart.textContent = '';

    var W = 640, H = 230;
    var left = 46, right = 12, top = 22, bottom = 24;
    var plotW = W - left - right, plotH = H - top - bottom;

    var values = points.map(function (point) { return point.advantage; });
    var hi = Math.max.apply(null, values.concat(0));
    var lo = Math.min.apply(null, values.concat(0));
    if (hi === lo) { hi = 1; lo = -1; }

    var last = points.length;
    function x(year) { return left + (last === 1 ? plotW / 2 : (year - 1) / (last - 1) * plotW); }
    function y(value) { return top + (hi - value) / (hi - lo) * plotH; }
    var zero = y(0);

    var path = points.map(function (point, i) {
      return (i ? 'L' : 'M') + x(point.year).toFixed(1) + ' ' + y(point.advantage).toFixed(1);
    }).join(' ');
    var area = path + ' L' + x(last).toFixed(1) + ' ' + zero.toFixed(1) +
      ' L' + x(1).toFixed(1) + ' ' + zero.toFixed(1) + ' Z';

    // The same area drawn twice, clipped to either side of the zero line.
    var defs = svg('defs');
    var above = svg('clipPath', { id: 'clip-above' });
    above.appendChild(svg('rect', { x: 0, y: 0, width: W, height: zero }));
    var below = svg('clipPath', { id: 'clip-below' });
    below.appendChild(svg('rect', { x: 0, y: zero, width: W, height: H - zero }));
    defs.appendChild(above);
    defs.appendChild(below);
    chart.appendChild(defs);

    chart.appendChild(svg('path', { d: area, class: 'area-buy', 'clip-path': 'url(#clip-above)' }));
    chart.appendChild(svg('path', { d: area, class: 'area-rent', 'clip-path': 'url(#clip-below)' }));
    chart.appendChild(svg('line', { x1: left, x2: W - right, y1: zero, y2: zero, class: 'axis' }));
    chart.appendChild(svg('path', { d: path, class: 'line' }));

    // Value axis: the extremes and zero.
    [[hi, y(hi)], [0, zero], [lo, y(lo)]].forEach(function (tick, i, ticks) {
      var clash = ticks.some(function (other, j) { return j < i && Math.abs(other[1] - tick[1]) < 13; });
      if (clash) return;
      chart.appendChild(svg('text', { x: left - 8, y: tick[1] + 4, 'text-anchor': 'end' }, shortMoney(tick[0])));
    });

    // Year axis.
    var step = last <= 12 ? 1 : last <= 24 ? 2 : 5;
    points.forEach(function (point) {
      if (point.year !== 1 && point.year % step !== 0) return;
      chart.appendChild(svg('text', { x: x(point.year), y: H - 4, 'text-anchor': 'middle' },
        point.year === 1 ? 'yr 1' : String(point.year)));
    });

    // The chosen year of sale.
    var chosen = points[sellYear - 1];
    if (chosen) {
      var cx = x(chosen.year), cy = y(chosen.advantage);
      var ahead = chosen.advantage >= 0;
      chart.appendChild(svg('line', { x1: cx, x2: cx, y1: top, y2: H - bottom, class: 'mark-line' }));
      chart.appendChild(svg('circle', {
        cx: cx, cy: cy, r: 5, class: 'mark-dot', fill: ahead ? 'var(--buy)' : 'var(--rent)'
      }));
      var anchor = cx > W - 90 ? 'end' : cx < left + 50 ? 'start' : 'middle';
      chart.appendChild(svg('text', { x: cx, y: top - 8, 'text-anchor': anchor, class: 'mark-text' },
        'year ' + chosen.year + '  ' + signed(chosen.advantage)));
    }

    // Click a year to sell then.
    var band = last === 1 ? plotW : plotW / (last - 1);
    points.forEach(function (point) {
      var hit = svg('rect', {
        x: x(point.year) - band / 2, y: top, width: band, height: plotH, class: 'hit'
      });
      hit.appendChild(svg('title', {},
        'Sell after ' + years(point.year) + ': ' +
        (point.advantage >= 0 ? 'buying' : 'renting') + ' ahead by ' + money(Math.abs(point.advantage))));
      hit.addEventListener('click', function () {
        state.years = point.year;
        sync();
        update();
      });
      chart.appendChild(hit);
    });
  }

  /* Wiring ----------------------------------------------------------------- */

  function update() {
    var horizon = Math.min(40, Math.max(15, state.years + 5));
    var result = model.simulate(state);
    var points = model.curve(state, horizon);

    var auto = model.stampDuty(state.price, state.buyer, state.nonResident);
    inputs.stampDutyOverride.input.placeholder = Math.round(auto).toLocaleString('en-GB');

    renderVerdict(result, points, horizon);
    renderFacts(result);
    renderChart(points, state.years);
    renderLedgers(result);
    writeAddress();
    if (!naming) renderSaves();
  }

  buildForm();
  loadSaves();

  // A page address with numbers in it wins (a shared link, or a reload mid-edit);
  // a bare address reopens whatever was last worked on.
  current = readStore('sessionStorage', CURRENT_KEY);
  if (!find(current)) current = null;
  if (addressText()) {
    state = readAddress();
  } else {
    if (!current) current = find(readStore('localStorage', LAST_KEY)) ? readStore('localStorage', LAST_KEY) : null;
    state = current ? clean(find(current).values) : defaults();
    if (current) select(current);
  }
  sync();
  update();

  document.getElementById('reset').addEventListener('click', function () {
    if (isDirty() && !window.confirm('Discard the unsaved changes to “' + current + '”?')) return;
    state = defaults();
    select(null);
    naming = false;
    sync(true);
    update();
  });

  // Saves made in another tab show up here too.
  window.addEventListener('storage', function (event) {
    if (event.key !== STORE_KEY) return;
    loadSaves();
    if (!find(current)) select(null);
    if (!naming) renderSaves();
  });

  window.addEventListener('hashchange', function () {
    state = readAddress();
    sync();
    update();
  });
})();
