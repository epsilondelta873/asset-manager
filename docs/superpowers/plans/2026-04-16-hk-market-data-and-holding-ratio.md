# HK Market Data And Holding Ratio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-holding `US/HK` market support, fetch Hong Kong stock quotes from iTick, and show each holding's share of the whole account including liquid cash.

**Architecture:** Extend the shared helper module with market inference, Hong Kong code normalization, price-key generation, and allocation-ratio math. Then wire `index.html` to migrate old holdings, route quote requests by market (`Finnhub` for US, `iTick` for HK), and update the edit/detail UI to show market-aware prices and ratios.

**Tech Stack:** Static HTML, React 18 UMD, Babel standalone, Node.js built-in test runner

---

### Task 1: Add market normalization and ratio tests

**Files:**
- Modify: `tests/asset-helpers.test.js`
- Test: `tests/asset-helpers.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
test("normalizes Hong Kong stock codes from multiple input formats", () => {
  assert.equal(normalizeStockCode("2714.HK", "HK"), "2714");
  assert.equal(normalizeStockCode("02714.HK", "HK"), "2714");
  assert.equal(normalizeStockCode("2714", "HK"), "2714");
});

test("migrates stock holdings to include market information", () => {
  const migrated = migrateAccountsData({
    mixed: {
      currency: "USD",
      type: "stock",
      liquidCashItems: [],
      holdings: [{ code: "02714.HK", shares: 100 }, { code: "AAPL", shares: 1 }],
    },
  });

  assert.deepEqual(migrated.mixed.holdings[0].market, "HK");
  assert.deepEqual(migrated.mixed.holdings[0].code, "2714");
  assert.deepEqual(migrated.mixed.holdings[1].market, "US");
});

test("builds unique price keys per market", () => {
  assert.equal(getHoldingPriceKey({ code: "AAPL", market: "US" }), "US:AAPL");
  assert.equal(getHoldingPriceKey({ code: "2714", market: "HK" }), "HK:2714");
});

test("calculates holding ratios against total account value including liquid cash", () => {
  const ratios = getAccountHoldingRatios(
    {
      currency: "USD",
      type: "stock",
      holdings: [
        { code: "AAPL", market: "US", shares: 1 },
        { code: "2714", market: "HK", shares: 100 },
      ],
      liquidCashItems: [{ currency: "USD", balance: 50 }],
    },
    {
      stockPrices: { "US:AAPL": 100, "HK:2714": 10 },
      exchangeRates: { USD: 7, HKD: 0.7 },
    },
  );

  assert.ok(Math.abs(ratios[0] - 0.3589743589) < 0.000001);
  assert.ok(Math.abs(ratios[1] - 0.4615384615) < 0.000001);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/asset-helpers.test.js`
Expected: FAIL with missing export errors for the new market helpers

- [ ] **Step 3: Write minimal implementation**

```javascript
function normalizeStockCode(code, market) { /* ... */ }
function inferStockMarket(code) { /* ... */ }
function getHoldingPriceKey(holding) { /* ... */ }
function getAccountHoldingRatios(account, data) { /* ... */ }
```

Also update account migration so stock holdings are normalized with `market`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/asset-helpers.test.js`
Expected: PASS with the new market tests green

- [ ] **Step 5: Commit**

```bash
git add asset-helpers.js tests/asset-helpers.test.js
git commit -m "feat: add market-aware holding helpers"
```

### Task 2: Route stock price fetching by market

**Files:**
- Modify: `index.html`
- Test: `tests/asset-helpers.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
test("account display value supports mixed US and HK stock holdings", () => {
  const total = calcAccountDisplayValue(
    {
      currency: "USD",
      type: "stock",
      holdings: [
        { code: "AAPL", market: "US", shares: 1 },
        { code: "2714", market: "HK", shares: 100 },
      ],
      liquidCashItems: [{ currency: "HKD", balance: 700 }],
    },
    {
      stockPrices: { "US:AAPL": 100, "HK:2714": 10 },
      exchangeRates: { USD: 7, HKD: 0.7 },
    },
  );

  assert.equal(total, 328.57142857142856);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/asset-helpers.test.js`
Expected: FAIL because account totals still assume all stock holdings use the account currency

- [ ] **Step 3: Write minimal implementation**

```javascript
async function fetchUSStockPrices(holdings) { /* Finnhub */ }
async function fetchHKStockPrices(holdings) { /* iTick */ }
function getStockQuoteTargets(data) { /* split by market */ }
```

In `index.html`, update:

```javascript
const ITICK_API_TOKEN = "";
```

```javascript
const prices = {
  ...await fetchUSStockPrices(usHoldings),
  ...await fetchHKStockPrices(hkHoldings),
};
```

Also make all stock price reads use `getHoldingPriceKey(...)` with legacy fallback for old cached US prices.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/asset-helpers.test.js`
Expected: PASS with mixed-market account totals green

- [ ] **Step 5: Commit**

```bash
git add index.html asset-helpers.js tests/asset-helpers.test.js
git commit -m "feat: fetch Hong Kong stock prices from itick"
```

### Task 3: Update edit and account UI

**Files:**
- Modify: `index.html`
- Test: `tests/asset-helpers.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
test("normalizes newly entered Hong Kong holdings before storage", () => {
  assert.equal(normalizeStockCode("02714.HK", "HK"), "2714");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/asset-helpers.test.js`
Expected: FAIL until the edit flow is wired to the new helper and tests are updated

- [ ] **Step 3: Write minimal implementation**

```javascript
holdings.push({
  code: normalizeStockCode(newHolding.code, newHolding.market),
  market: newHolding.market,
  shares: newHolding.shares || 0,
});
```

Update the edit page to:

```javascript
<select value={holding.market}>US / HK</select>
<input value={holding.code} />
```

Update the account details page to:

```javascript
<span>{holding.code} · {holding.market}</span>
<span style={{ fontSize: 11 }}>{(ratio * 100).toFixed(1)}%</span>
```

And switch stock badges to `$` for `US` and `HK$` for `HK`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/asset-helpers.test.js`
Expected: PASS with all normalization tests green

- [ ] **Step 5: Commit**

```bash
git add index.html asset-helpers.js tests/asset-helpers.test.js
git commit -m "feat: add market-aware holding editing and ratios"
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

- [ ] **Step 2: Run a quick helper sanity check**

```bash
node -e "require('./asset-helpers.js'); console.log('helpers ok')"
```

Expected: prints `helpers ok`

- [ ] **Step 3: Manually verify UI flows in browser**

Check:

```text
1. Old stock holdings load with inferred US/HK market values
2. Adding a Hong Kong holding stores code as plain digits like 2714
3. US holdings still refresh via Finnhub
4. HK holdings show HK$ price tags when iTick token is configured
5. Each holding shows a small percentage, and ratios include liquid cash in the denominator
```

- [ ] **Step 4: Commit**

```bash
git add index.html asset-helpers.js tests/asset-helpers.test.js
git commit -m "feat: support Hong Kong stock quotes and holding ratios"
```
