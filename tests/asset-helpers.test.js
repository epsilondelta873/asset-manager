const test = require("node:test");
const assert = require("node:assert/strict");
const {
  migrateAccountLiquidCash,
  calcLiquidCashCNY,
  calcAccountDisplayValue,
  normalizeLiquidCashItems,
  makeLiquidCashItem,
  migrateAccountsData,
  normalizeStockCode,
  getHoldingPriceKey,
  getAccountHoldingRatios,
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

test("keeps empty legacy liquidCash as an empty liquidCashItems list", () => {
  const migrated = migrateAccountLiquidCash({ currency: "HKD", liquidCash: 0, holdings: [] });
  assert.deepEqual(migrated.liquidCashItems, []);
});

test("keeps existing liquidCashItems and normalizes balances", () => {
  const migrated = migrateAccountLiquidCash({
    currency: "USD",
    liquidCashItems: [{ currency: "HKD", balance: "12.5" }],
    holdings: [],
  });
  assert.deepEqual(migrated.liquidCashItems, [{ currency: "HKD", balance: 12.5 }]);
});

test("defaults blank liquid cash rows to the account currency and zero balance", () => {
  const normalized = normalizeLiquidCashItems({
    currency: "USD",
    liquidCashItems: [{ currency: "", balance: "" }],
  });
  assert.deepEqual(normalized, [{ currency: "USD", balance: 0 }]);
});

test("creates a new liquid cash row using the account currency by default", () => {
  assert.deepEqual(makeLiquidCashItem("HKD"), { currency: "HKD", balance: 0 });
});

test("migrates all accounts in one pass", () => {
  const migrated = migrateAccountsData({
    a: { currency: "USD", liquidCash: 10, holdings: [] },
    b: { currency: "CNY", holdings: [], liquidCashItems: [{ currency: "USD", balance: 5 }] },
  });

  assert.deepEqual(migrated.a.liquidCashItems, [{ currency: "USD", balance: 10 }]);
  assert.deepEqual(migrated.b.liquidCashItems, [{ currency: "USD", balance: 5 }]);
});

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

  assert.equal(migrated.mixed.holdings[0].market, "HK");
  assert.equal(migrated.mixed.holdings[0].code, "2714");
  assert.equal(migrated.mixed.holdings[1].market, "US");
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

  assert.ok(Math.abs(ratios[0] - 0.4) < 0.000001);
  assert.ok(Math.abs(ratios[1] - 0.4) < 0.000001);
});

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

  assert.equal(total, 270);
});
