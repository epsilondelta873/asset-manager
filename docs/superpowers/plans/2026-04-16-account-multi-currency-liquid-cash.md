# Account Multi-Currency Liquid Cash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each investment account store multiple liquid cash entries with selectable currencies, include them in account totals, and keep the liquid cash section at the bottom of the account card.

**Architecture:** Extract the account/currency math plus legacy-data migration into a small browser-and-Node compatible helper file so we can write Node tests first. Then wire `index.html` to the helper, migrate existing data on load/import, and update both account display and edit flows to use `liquidCashItems`.

**Tech Stack:** Static HTML, React 18 UMD, Babel standalone, Node.js built-in test runner

---

### Task 1: Add tested helper functions for multi-currency cash

**Files:**
- Create: `asset-helpers.js`
- Create: `tests/asset-helpers.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  migrateAccountLiquidCash,
  calcLiquidCashCNY,
  calcAccountDisplayValue,
} = require("../asset-helpers.js");

test("migrates legacy liquidCash into liquidCashItems using account currency", () => {
  const migrated = migrateAccountLiquidCash({ currency: "USD", liquidCash: 88, holdings: [] });
  assert.deepEqual(migrated.liquidCashItems, [{ currency: "USD", balance: 88 }]);
});

test("sums multi-currency liquid cash in CNY", () => {
  const total = calcLiquidCashCNY(
    [
      { currency: "USD", balance: 10 },
      { currency: "HKD", balance: 20 },
      { currency: "CNY", balance: 30 },
    ],
    { USD: 7, HKD: 0.9 },
  );
  assert.equal(total, 118);
});

test("returns account total in the account base currency", () => {
  const total = calcAccountDisplayValue(
    {
      currency: "USD",
      type: "stock",
      holdings: [{ code: "ABC", shares: 2 }],
      liquidCashItems: [{ currency: "HKD", balance: 70 }],
    },
    { stockPrices: { ABC: 50 }, exchangeRates: { USD: 7, HKD: 0.7 } },
  );
  assert.equal(total, 107);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/asset-helpers.test.js`
Expected: FAIL with `Cannot find module '../asset-helpers.js'` or missing export errors

- [ ] **Step 3: Write minimal implementation**

```javascript
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.AssetHelpers = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function getRateToCNY(currency, rates) {
    if (currency === "USD") return rates.USD || 6.91;
    if (currency === "HKD") return rates.HKD || 0.88;
    return 1;
  }

  function toCNY(value, currency, rates) {
    return (value || 0) * getRateToCNY(currency, rates);
  }

  function fromCNY(value, currency, rates) {
    return currency === "CNY" ? (value || 0) : (value || 0) / getRateToCNY(currency, rates);
  }

  function normalizeLiquidCashItems(account) {
    if (Array.isArray(account.liquidCashItems)) {
      return account.liquidCashItems.map((item) => ({
        currency: item.currency || account.currency || "CNY",
        balance: Number(item.balance) || 0,
      }));
    }
    if ((Number(account.liquidCash) || 0) > 0) {
      return [{ currency: account.currency || "CNY", balance: Number(account.liquidCash) || 0 }];
    }
    return [];
  }

  function migrateAccountLiquidCash(account) {
    return { ...account, liquidCashItems: normalizeLiquidCashItems(account) };
  }

  function calcLiquidCashCNY(items, rates) {
    return (items || []).reduce((sum, item) => sum + toCNY(item.balance, item.currency, rates), 0);
  }

  function calcAccountDisplayValue(account, data) {
    const holdingsValueCNY = (account.holdings || []).reduce((sum, holding) => {
      if (account.type === "fund") return sum + toCNY(holding.marketValue || 0, account.currency, data.exchangeRates);
      return sum + toCNY((holding.shares || 0) * (data.stockPrices?.[holding.code] || 0), account.currency, data.exchangeRates);
    }, 0);
    const liquidCashCNY = calcLiquidCashCNY(normalizeLiquidCashItems(account), data.exchangeRates);
    return fromCNY(holdingsValueCNY + liquidCashCNY, account.currency, data.exchangeRates);
  }

  return {
    toCNY,
    fromCNY,
    normalizeLiquidCashItems,
    migrateAccountLiquidCash,
    calcLiquidCashCNY,
    calcAccountDisplayValue,
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/asset-helpers.test.js`
Expected: PASS with 3 passing tests

- [ ] **Step 5: Commit**

```bash
git add asset-helpers.js tests/asset-helpers.test.js
git commit -m "test: add multi-currency liquid cash helpers"
```

### Task 2: Wire app data and totals to the helper

**Files:**
- Modify: `index.html`
- Test: `tests/asset-helpers.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
test("keeps empty legacy liquidCash as an empty liquidCashItems list", () => {
  const migrated = migrateAccountLiquidCash({ currency: "HKD", liquidCash: 0, holdings: [] });
  assert.deepEqual(migrated.liquidCashItems, []);
});

test("keeps existing liquidCashItems untouched except numeric normalization", () => {
  const migrated = migrateAccountLiquidCash({
    currency: "USD",
    liquidCashItems: [{ currency: "HKD", balance: "12.5" }],
    holdings: [],
  });
  assert.deepEqual(migrated.liquidCashItems, [{ currency: "HKD", balance: 12.5 }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/asset-helpers.test.js`
Expected: FAIL because migration logic does not yet normalize both cases correctly

- [ ] **Step 3: Write minimal implementation**

```javascript
function migrateAllAccounts(accounts) {
  const migrated = {};
  Object.entries(accounts || {}).forEach(([key, account]) => {
    migrated[key] = migrateAccountLiquidCash(account || {});
  });
  return migrated;
}

function calcAccountValue(account, data) {
  return calcAccountDisplayValue(account, data);
}
```

In `index.html`:

```html
<script src="./asset-helpers.js"></script>
```

```javascript
const {
  toCNY,
  fromCNY,
  normalizeLiquidCashItems,
  migrateAccountLiquidCash,
  calcLiquidCashCNY,
  calcAccountDisplayValue,
} = window.AssetHelpers;
```

Also update app initialization, import handling, and account creation so all runtime accounts carry `liquidCashItems: []` and no longer rely on `liquidCash`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/asset-helpers.test.js`
Expected: PASS with all migration tests green

- [ ] **Step 5: Commit**

```bash
git add index.html asset-helpers.js tests/asset-helpers.test.js
git commit -m "feat: migrate accounts to liquidCashItems"
```

### Task 3: Update account detail and edit UI

**Files:**
- Modify: `index.html`
- Test: `tests/asset-helpers.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
test("supports editing defaults for a new liquid cash row", () => {
  const normalized = normalizeLiquidCashItems({
    currency: "USD",
    liquidCashItems: [{ currency: "", balance: "" }],
  });
  assert.deepEqual(normalized, [{ currency: "USD", balance: 0 }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/asset-helpers.test.js`
Expected: FAIL because normalization does not yet handle blank row defaults

- [ ] **Step 3: Write minimal implementation**

```javascript
function makeLiquidCashItem(defaultCurrency) {
  return { currency: defaultCurrency || "CNY", balance: 0 };
}
```

In `index.html`, update:

```javascript
account.liquidCashItems.map((item, i) => (
  <div key={i}>
    <select value={item.currency}>...</select>
    <input type="number" value={item.balance} />
  </div>
))
```

And ensure the account card order is:

```javascript
[
  "account meta",
  "holdings list",
  "add holding button/form",
  "liquid cash editor",
]
```

For the account details page, render liquid cash as the final section after holdings, even when the list is empty.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/asset-helpers.test.js`
Expected: PASS with the new normalization test green

- [ ] **Step 5: Commit**

```bash
git add index.html asset-helpers.js tests/asset-helpers.test.js
git commit -m "feat: add multi-currency liquid cash UI"
```

### Task 4: Verify end-to-end behavior

**Files:**
- Modify: `index.html`
- Test: `tests/asset-helpers.test.js`

- [ ] **Step 1: Run focused automated tests**

```bash
node --test tests/asset-helpers.test.js
```

Expected: PASS with all tests green

- [ ] **Step 2: Run a quick static sanity check**

```bash
node -e "require('./asset-helpers.js'); console.log('helpers ok')"
```

Expected: prints `helpers ok`

- [ ] **Step 3: Manually verify UI flows in browser**

Check:

```text
1. Old liquidCash data loads as one row under liquidCashItems
2. One account can hold USD + HKD + CNY liquid cash rows together
3. Account total still shows the account base currency
4. Liquid cash renders at the bottom of the expanded account card
5. In Edit page, liquid cash editor stays below add-holding controls
```

- [ ] **Step 4: Commit**

```bash
git add index.html asset-helpers.js tests/asset-helpers.test.js
git commit -m "feat: support multi-currency liquid cash per account"
```
