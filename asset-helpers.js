(function (root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AssetHelpers = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  function getRateToCNY(currency, rates) {
    if (currency === "USD") return rates?.USD || 6.91;
    if (currency === "HKD") return rates?.HKD || 0.88;
    return 1;
  }

  function toCNY(value, currency, rates) {
    return (Number(value) || 0) * getRateToCNY(currency, rates);
  }

  function fromCNY(value, currency, rates) {
    if (currency === "CNY") return Number(value) || 0;
    return (Number(value) || 0) / getRateToCNY(currency, rates);
  }

  function normalizeLiquidCashItems(account) {
    if (Array.isArray(account?.liquidCashItems)) {
      return account.liquidCashItems.map((item) => ({
        currency: item?.currency || account.currency || "CNY",
        balance: Number(item?.balance) || 0,
      }));
    }

    if ((Number(account?.liquidCash) || 0) > 0) {
      return [{ currency: account?.currency || "CNY", balance: Number(account.liquidCash) || 0 }];
    }

    return [];
  }

  function inferStockMarket(code) {
    const rawCode = String(code || "").trim().toUpperCase();
    if (/\.HK$/.test(rawCode) || /^\d{4,5}$/.test(rawCode)) return "HK";
    return "US";
  }

  function normalizeStockCode(code, market) {
    const rawCode = String(code || "").trim().toUpperCase();

    if ((market || "US") === "HK") {
      const digits = rawCode.replace(/\.HK$/i, "").replace(/\D/g, "");
      const stripped = digits.replace(/^0+/, "");
      return stripped || digits || "";
    }

    return rawCode;
  }

  function getHoldingMarket(holding) {
    return holding?.market || inferStockMarket(holding?.code);
  }

  function getHoldingCurrency(account, holding) {
    if (account?.type === "stock") {
      return getHoldingMarket(holding) === "HK" ? "HKD" : "USD";
    }
    return account?.currency || "CNY";
  }

  function convertCurrency(value, fromCurrency, toCurrency, rates) {
    if (fromCurrency === toCurrency) return Number(value) || 0;
    return fromCNY(toCNY(value, fromCurrency, rates), toCurrency, rates);
  }

  function getHoldingPriceKey(holding) {
    const market = getHoldingMarket(holding);
    return `${market}:${normalizeStockCode(holding?.code, market)}`;
  }

  function getHoldingPrice(data, holding) {
    const normalizedKey = getHoldingPriceKey(holding);
    const rawCode = String(holding?.code || "").trim().toUpperCase();
    const normalizedCode = normalizeStockCode(rawCode, getHoldingMarket(holding));

    return (
      data?.stockPrices?.[normalizedKey] ??
      data?.stockPrices?.[rawCode] ??
      data?.stockPrices?.[normalizedCode] ??
      0
    );
  }

  function normalizeHolding(holding, account) {
    if (account?.type === "stock") {
      const market = getHoldingMarket(holding);
      return {
        ...holding,
        code: normalizeStockCode(holding?.code, market),
        market,
        shares: Number(holding?.shares) || 0,
        cashPosition: Number(holding?.cashPosition) || 0,
      };
    }

    return {
      ...holding,
      marketValue: Number(holding?.marketValue) || 0,
    };
  }

  function migrateAccountLiquidCash(account) {
    return {
      ...account,
      liquidCashItems: normalizeLiquidCashItems(account || {}),
    };
  }

  function migrateAccountsData(accounts) {
    const migrated = {};

    Object.entries(accounts || {}).forEach(([key, account]) => {
      const normalizedAccount = migrateAccountLiquidCash(account || {});
      migrated[key] = {
        ...normalizedAccount,
        holdings: (normalizedAccount.holdings || []).map((holding) => normalizeHolding(holding, normalizedAccount)),
      };
    });

    return migrated;
  }

  function calcLiquidCashCNY(items, rates) {
    return (items || []).reduce((sum, item) => sum + toCNY(item.balance, item.currency, rates), 0);
  }

  function calcHoldingsValueInAccountCurrency(account, data) {
    return (account?.holdings || []).reduce((sum, holding) => {
      const nativeValue = account?.type === "fund"
        ? (Number(holding?.marketValue) || 0)
        : (Number(holding?.shares) || 0) * getHoldingPrice(data, holding);

      return sum + convertCurrency(
        nativeValue,
        getHoldingCurrency(account, holding),
        account?.currency || "CNY",
        data?.exchangeRates,
      );
    }, 0);
  }

  function calcAccountDisplayValue(account, data) {
    const holdingsValueCNY = toCNY(
      calcHoldingsValueInAccountCurrency(account, data),
      account?.currency || "CNY",
      data?.exchangeRates,
    );
    const liquidCashCNY = calcLiquidCashCNY(normalizeLiquidCashItems(account || {}), data?.exchangeRates);
    return fromCNY(holdingsValueCNY + liquidCashCNY, account?.currency || "CNY", data?.exchangeRates);
  }

  function makeLiquidCashItem(defaultCurrency) {
    return {
      currency: defaultCurrency || "CNY",
      balance: 0,
    };
  }

  function getAccountHoldingRatios(account, data) {
    const ratioCurrency = account?.type === "stock" ? "USD" : (account?.currency || "CNY");
    const holdingValues = (account?.holdings || []).map((holding) => {
      const nativeValue = account?.type === "fund"
        ? (Number(holding?.marketValue) || 0)
        : (Number(holding?.shares) || 0) * getHoldingPrice(data, holding);

      return convertCurrency(
        nativeValue,
        getHoldingCurrency(account, holding),
        ratioCurrency,
        data?.exchangeRates,
      );
    });
    const liquidCashValue = (normalizeLiquidCashItems(account || {}) || []).reduce((sum, item) => (
      sum + convertCurrency(item.balance, item.currency, ratioCurrency, data?.exchangeRates)
    ), 0);
    const denominator = holdingValues.reduce((sum, value) => sum + value, 0) + liquidCashValue;

    return holdingValues.map((value) => (denominator > 0 ? value / denominator : 0));
  }

  return {
    toCNY,
    fromCNY,
    inferStockMarket,
    normalizeStockCode,
    getHoldingPriceKey,
    getHoldingPrice,
    normalizeLiquidCashItems,
    migrateAccountLiquidCash,
    migrateAccountsData,
    calcLiquidCashCNY,
    calcAccountDisplayValue,
    getAccountHoldingRatios,
    makeLiquidCashItem,
  };
});
