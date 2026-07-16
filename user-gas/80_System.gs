function initializeIdSequences_() {
  var properties = PropertiesService.getScriptProperties();
  var transactions = loadTransactions_(true);
  var cashFlows = loadCashFlows_(true);
  function maxSequence(rows, header) {
    return rows.reduce(function (max, row) {
      var match = cleanText_(row[header]).match(/(\d{6})$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
  }
  var txMax = maxSequence(transactions, '交易ID');
  var cashMax = maxSequence(cashFlows, '流水ID');
  properties.setProperty('V81_TX_SEQUENCE', String(Math.max(txMax, Number(properties.getProperty('V81_TX_SEQUENCE')) || 0)));
  properties.setProperty('V81_CFX_SEQUENCE', String(Math.max(cashMax, Number(properties.getProperty('V81_CFX_SEQUENCE')) || 0)));
  return { transactionSequence: Number(properties.getProperty('V81_TX_SEQUENCE')), cashFlowSequence: Number(properties.getProperty('V81_CFX_SEQUENCE')) };
}

function removeScheduledDailyTriggers_() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'scheduledDailyJob') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  return removed;
}

function installV81() {
  if (V81.VERSION !== '8.1.0' && typeof installV82 === 'function') return installV82();
  try {
    return withDocumentLock_(function () {
      var schema = ensureV81Schema_();
      var sequences = initializeIdSequences_();
      var removedTriggers = removeScheduledDailyTriggers_();
      setSettingValues_({
        SYSTEM_VERSION: V81.VERSION,
        SCHEMA_VERSION: V81.SCHEMA_VERSION,
        TIMEZONE: V81.TIMEZONE,
        BASE_CURRENCY: V81.BASE_CURRENCY,
        NEEDS_RECALC: 'TRUE',
        DAILY_JOB_ENABLED: 'FALSE',
        LAST_VALIDATION_STATUS: 'PENDING'
      });
      onOpen();
      return apiResult_(true, 'OK', 'V8.1 安裝完成；尚未執行市場更新與集中重算', {
        schema: schema,
        sequences: sequences,
        removedTriggers: removedTriggers,
        next: ['refreshExchangeRatesOnly()', 'refreshPricesOnly()', 'rebuildAllPerformance()', 'validatePhase1()']
      });
    });
  } catch (error) {
    return apiResult_(false, 'INSTALL_FAILED', error.message, {});
  }
}

function repairSchemaV81() {
  try {
    return withDocumentLock_(function () {
      var schema = ensureV81Schema_();
      return apiResult_(true, 'OK', 'V8.1 欄位與驗證已修復', { schema: schema });
    });
  } catch (error) {
    return apiResult_(false, 'SCHEMA_REPAIR_FAILED', error.message, {});
  }
}

function refreshExchangeRatesOnly() {
  try {
    return withDocumentLock_(function () {
      var summary = refreshExchangeRatesInternal_();
      return apiResult_(summary.failed === 0, summary.failed === 0 ? 'OK' : 'FX_REFRESH_WITH_ERRORS', summary.failed === 0 ? '匯率更新完成' : '匯率更新完成但有失敗', summary);
    });
  } catch (error) {
    return apiResult_(false, 'FX_REFRESH_FAILED', error.message, {});
  }
}

function refreshPricesOnly() {
  try {
    return withDocumentLock_(function () {
      var summary = refreshPricesInternal_();
      return apiResult_(summary.failed === 0, summary.failed === 0 ? 'OK' : 'PRICE_REFRESH_WITH_ERRORS', summary.failed === 0 ? '價格與淨值更新完成' : '價格與淨值更新完成但有失敗', summary);
    });
  } catch (error) {
    return apiResult_(false, 'PRICE_REFRESH_FAILED', error.message, {});
  }
}

function rebuildAllPerformance() {
  return rebuildInvestmentState({});
}

function refreshAllCurrentData() {
  try {
    var result = withDocumentLock_(function () {
      ensureV81Schema_();
      var fx = refreshExchangeRatesInternal_();
      var prices = refreshPricesInternal_();
      var rebuild = rebuildInvestmentStateInternal_({});
      var dashboard = typeof refreshDashboardInternalV82_ === 'function' ? refreshDashboardInternalV82_() : null;
      var validation = validatePhase1Internal_();
      var success = fx.failed === 0 && prices.failed === 0 && rebuild.errorCount === 0 && validation.success;
      setSettingValues_({
        LAST_MARKET_REFRESH_AT: nowSheet_(),
        LAST_VALIDATION_AT: nowSheet_(),
        LAST_VALIDATION_STATUS: success ? 'PASS' : 'FAIL',
        NEEDS_RECALC: success ? 'FALSE' : 'TRUE'
      });
      return apiResult_(success, success ? 'OK' : 'FULL_REFRESH_WITH_ERRORS', success ? '第一階段完整更新與驗證完成' : '完整更新完成但驗證未通過', {
        fx: fx,
        prices: prices,
        rebuild: rebuild,
        dashboard: dashboard,
        validation: validation
      });
    });
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    setSettingValues_({ LAST_VALIDATION_AT: nowSheet_(), LAST_VALIDATION_STATUS: 'ERROR', NEEDS_RECALC: 'TRUE' });
    var failure = apiResult_(false, 'FULL_REFRESH_FAILED', error.message, {});
    console.log(JSON.stringify(failure));
    return failure;
  }
}

function validationCheck_(checks, name, ok, details, severity) {
  checks.push({ name: name, ok: Boolean(ok), severity: severity || 'error', details: details == null ? '' : details });
}

function runPhase1SelfTests_() {
  var checks = [];
  var sample = [
    { '交易ID': 'T1', '日期': '2025-01-01', '標的代號': 'TEST', '交易類型': 'buy', '數量': 10, '單價': 10, '手續費': 0, '實際入出金額': 100 },
    { '交易ID': 'T2', '日期': '2025-02-01', '標的代號': 'TEST', '交易類型': 'buy', '數量': 10, '單價': 20, '手續費': 0, '實際入出金額': 200 },
    { '交易ID': 'T3', '日期': '2025-03-01', '標的代號': 'TEST', '交易類型': 'sell', '數量': 5, '單價': 30, '手續費': 0, '實際入出金額': 150 },
    { '交易ID': 'T4', '日期': '2025-04-01', '標的代號': 'TEST', '交易類型': 'dividend', '數量': 0, '單價': 0, '手續費': 0, '實際入出金額': 10 },
    { '交易ID': 'T5', '日期': '2025-05-01', '標的代號': 'TEST', '交易類型': 'stock_dividend', '數量': 1, '單價': 0, '手續費': 0, '實際入出金額': 0 },
    { '交易ID': 'T6', '日期': '2025-06-01', '標的代號': 'TEST', '交易類型': 'split', '分割前股數': 1, '分割後股數': 2, '數量': 0, '實際入出金額': 0 }
  ];
  var asset = { '標的代號': 'TEST', '標的名稱': '測試', '標的類型': 'fund', '交易幣別': 'TWD', '淨值幣別': 'USD', '是否啟用': true };
  var price = { '標的代號': 'TEST', '最新價格': 20, '淨值幣別': 'USD', '價格日期': '2025-06-30', '最後成功時間': '2025-06-30 18:00:00', '狀態': 'SUCCESS' };
  var fx = [{ '幣別組合': 'TWD/TWD', '匯率': 1 }, { '幣別組合': 'USD/TWD', '匯率': 30 }];
  var state = computeInvestmentStateCore_([asset], sample, [price], fx, '2025-06-30')[0];
  validationCheck_(checks, '移動加權平均與部分賣出', Math.abs(state.soldCostTrade - 75) < 1e-6 && Math.abs(state.realizedTrade - 75) < 1e-6, { soldCost: state.soldCostTrade, realized: state.realizedTrade });
  validationCheck_(checks, '股票股利與分割數量', Math.abs(state.quantity - 32) < 1e-6, { quantity: state.quantity });
  validationCheck_(checks, '股息不列入已實現損益', Math.abs(state.dividendTrade - 10) < 1e-6 && Math.abs(state.realizedTrade - 75) < 1e-6, { dividend: state.dividendTrade, realized: state.realizedTrade });
  validationCheck_(checks, '交易幣別與淨值幣別分離', Math.abs(state.marketTwd - 19200) < 1e-6, { marketTwd: state.marketTwd });
  validationCheck_(checks, '買賣金額公式', computeActualAmount_({ type: 'buy', quantity: 2, price: 10, fee: 1 }) === 21 && computeActualAmount_({ type: 'sell', quantity: 2, price: 10, fee: 1 }) === 19, 'buy=21, sell=19');
  var oversell = validateNoOversell_([
    { '交易ID': 'O1', '日期': '2025-01-01', '標的代號': 'X', '交易類型': 'sell', '數量': 1 },
    { '交易ID': 'O2', '日期': '2025-02-01', '標的代號': 'X', '交易類型': 'buy', '數量': 1 }
  ]);
  validationCheck_(checks, '歷史時點超賣拒絕', !oversell.valid && oversell.errors.length === 1, oversell.errors);
  var deletedOversell = validateNoOversell_([{ '交易ID': 'D1', '日期': '2025-01-01', '標的代號': 'X', '交易類型': 'sell', '數量': 1, '刪除時間': '2025-02-01' }]);
  validationCheck_(checks, '軟刪除資料不納入計算', deletedOversell.valid, deletedOversell.errors);
  validationCheck_(checks, 'XIRR 可解與失敗可降級', xirr_([{ date: '2025-01-01', amount: -100 }, { date: '2026-01-01', amount: 110 }]) != null && xirr_([{ date: '2025-01-01', amount: 100 }]) == null, '正常現金流可解；單向現金流回空白');
  return { success: checks.every(function (check) { return check.ok; }), checks: checks };
}

function validatePhase1Internal_() {
  var checks = [];
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var requiredSheets = Object.keys(V81.SHEETS).map(function (key) { return V81.SHEETS[key]; });
  var missingSheets = requiredSheets.filter(function (name) { return !spreadsheet.getSheetByName(name); });
  validationCheck_(checks, '必要分頁', missingSheets.length === 0, { missing: missingSheets });
  var assets = loadAssets_();
  var allTransactions = loadTransactions_(true);
  var activeTransactions = allTransactions.filter(function (row) { return !cleanText_(row['刪除時間']); });
  var cashFlows = loadCashFlows_(true);
  var assetCodes = assets.map(function (row) { return cleanText_(row['標的代號']); });
  var transactionIds = allTransactions.map(function (row) { return cleanText_(row['交易ID']); });
  var cashFlowIds = cashFlows.map(function (row) { return cleanText_(row['流水ID']); });
  function duplicates(values) { return values.filter(function (value, index) { return value && values.indexOf(value) !== index; }).filter(function (value, index, array) { return array.indexOf(value) === index; }); }
  validationCheck_(checks, '標的代號唯一', duplicates(assetCodes).length === 0, duplicates(assetCodes));
  validationCheck_(checks, '交易ID完整且唯一', transactionIds.every(Boolean) && duplicates(transactionIds).length === 0, { count: transactionIds.length, duplicates: duplicates(transactionIds) });
  validationCheck_(checks, '流水ID完整且唯一', cashFlowIds.every(Boolean) && duplicates(cashFlowIds).length === 0, { count: cashFlowIds.length, duplicates: duplicates(cashFlowIds) });
  var missingAssets = activeTransactions.filter(function (row) { return assetCodes.indexOf(cleanText_(row['標的代號'])) < 0; }).map(function (row) { return row['交易ID']; });
  validationCheck_(checks, '交易標的主檔完整', missingAssets.length === 0, missingAssets);
  var invalidTypes = activeTransactions.filter(function (row) { return V81.TRANSACTION_TYPES.indexOf(cleanText_(row['交易類型'])) < 0; }).map(function (row) { return row['交易ID']; });
  validationCheck_(checks, '交易類型有效', invalidTypes.length === 0, invalidTypes);
  var leadingZeroIssues = assets.filter(function (row) { return row['標的類型'] === 'tw_stock' && /^0/.test(cleanText_(row['標的代號'])) && typeof row['標的代號'] !== 'string'; }).map(function (row) { return row['標的代號']; });
  validationCheck_(checks, '台股前導0以文字保存', leadingZeroIssues.length === 0, leadingZeroIssues);
  var amountErrors = [];
  var legacyAmountWarnings = [];
  activeTransactions.forEach(function (row) {
    if (toBoolean_(row['人工金額標誌'], false)) return;
    if (['buy', 'sell'].indexOf(cleanText_(row['交易類型'])) < 0) return;
    var expected = computeActualAmount_(row);
    var actual = toNumber_(row['實際入出金額'], 0);
    var tolerance = cleanText_(row['交易幣別']) === 'USD' ? 0.01 : 1;
    if (Math.abs(expected - actual) > tolerance + V81.EPSILON) {
      var detail = { id: row['交易ID'], expected: expected, actual: actual, difference: round_(expected - actual, 8) };
      if (cleanText_(row['資料來源']) === 'legacy_import' && cleanText_(row['標的類型']) === 'fund') legacyAmountWarnings.push(detail);
      else amountErrors.push(detail);
    }
  });
  validationCheck_(checks, '買賣金額公式', amountErrors.length === 0, amountErrors.slice(0, 20));
  validationCheck_(checks, '舊基金實扣金額差異保留', legacyAmountWarnings.length === 0, legacyAmountWarnings.slice(0, 20), 'warning');
  var oversell = validateNoOversell_(allTransactions);
  validationCheck_(checks, '歷史時點無超賣', oversell.valid, oversell.errors.slice(0, 20));
  var invalidCashFlows = cashFlows.filter(function (row) { return V81.CASH_FLOW_TYPES.indexOf(cleanText_(row['類型'])) < 0 || !(toNumber_(row['金額'], 0) > 0) || !(toNumber_(row['換算匯率'], 0) > 0); });
  validationCheck_(checks, '外部出入金方向與匯率', invalidCashFlows.length === 0, invalidCashFlows.map(function (row) { return row['流水ID']; }));
  var quantities = replayQuantities_(activeTransactions);
  var priceMap = buildPriceMap_(loadPriceCache_());
  var missingPrices = assetCodes.filter(function (code) { return toNumber_(quantities[code], 0) > V81.EPSILON && !finitePositive_(priceMap[code] && priceMap[code].price); });
  validationCheck_(checks, '持有中標的具最後成功價格', missingPrices.length === 0, missingPrices);
  var fxMap = buildFxMap_(loadFxCache_());
  var requiredCurrencies = [];
  assets.forEach(function (asset) {
    if (!(toNumber_(quantities[asset['標的代號']], 0) > V81.EPSILON)) return;
    [cleanText_(asset['交易幣別']), cleanText_(asset['淨值幣別'])].forEach(function (currency) { if (currency && requiredCurrencies.indexOf(currency) < 0) requiredCurrencies.push(currency); });
  });
  var missingFx = requiredCurrencies.filter(function (currency) { return currency !== 'TWD' && !finitePositive_(fxMap[currency + '/TWD']); });
  validationCheck_(checks, '持有中標的匯率完整', missingFx.length === 0, missingFx);
  var calcRows = readTable_(V81.SHEETS.CALCULATION, { idHeader: '計算鍵' }).rows;
  validationCheck_(checks, '集中計算為標的層且列數一致', calcRows.length === assets.length && calcRows.every(function (row) { return cleanText_(row['計算鍵']) === cleanText_(row['標的代號']); }), { assets: assets.length, calculationRows: calcRows.length });
  var selfTests = runPhase1SelfTests_();
  selfTests.checks.forEach(function (check) { checks.push(Object.assign({ group: 'self_test' }, check)); });
  var dailyHandler = V81.VERSION === '8.4.0' ? 'dailyAssetMaintenance' : 'scheduledDailyJob';
  var scheduledTriggers = ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === dailyHandler; });
  var expectedTriggerCount = V81.VERSION === '8.1.0' ? 0 : 1;
  validationCheck_(checks, V81.VERSION === '8.1.0' ? '第一階段無每日觸發器' : '第二階段每日觸發器唯一', scheduledTriggers.length === expectedTriggerCount, { count: scheduledTriggers.length, expected: expectedTriggerCount });
  var errors = checks.filter(function (check) { return !check.ok && check.severity !== 'warning'; });
  var warnings = checks.filter(function (check) { return !check.ok && check.severity === 'warning'; });
  return { success: errors.length === 0, checkCount: checks.length, errorCount: errors.length, warningCount: warnings.length, checks: checks };
}

function validatePhase1() {
  try {
    var result = withDocumentLock_(function () {
      var validation = validatePhase1Internal_();
      setSettingValues_({ LAST_VALIDATION_AT: nowSheet_(), LAST_VALIDATION_STATUS: validation.success ? 'PASS' : 'FAIL' });
      return apiResult_(validation.success, validation.success ? 'OK' : 'VALIDATION_FAILED', validation.success ? '第一階段驗證通過' : '第一階段驗證未通過', validation);
    });
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    setSettingValues_({ LAST_VALIDATION_AT: nowSheet_(), LAST_VALIDATION_STATUS: 'ERROR' });
    var failure = apiResult_(false, 'VALIDATION_ERROR', error.message, {});
    console.log(JSON.stringify(failure));
    return failure;
  }
}

function legacyOnOpenV831_() {
  return onOpen();
}

function duplicatesV82_(values) {
  var seen = {};
  var duplicates = {};
  values.forEach(function (value) {
    var key = cleanText_(value);
    if (!key) return;
    if (seen[key]) duplicates[key] = true;
    seen[key] = true;
  });
  return Object.keys(duplicates);
}

function trendOutputStateV82_() {
  function stableRows(sheetName, headers) {
    var stableHeaders = headers.filter(function (header) { return header !== '更新時間'; });
    return readTable_(sheetName, { requiredHeaders: headers }).rows.map(function (row) {
      return stableHeaders.map(function (header) { return canonicalValueV82_(row[header]); });
    });
  }
  var payload = {
    snapshots: stableRows(V81.SHEETS.TREND, V81.HEADERS.TREND),
    details: stableRows(V81.SHEETS.TREND_DETAIL, V81.HEADERS.TREND_DETAIL)
  };
  var text = JSON.stringify(payload);
  var hash = 2166136261;
  for (var index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return {
    snapshotCount: payload.snapshots.length,
    detailCount: payload.details.length,
    hash: ('00000000' + hash.toString(16)).slice(-8)
  };
}

function validatePhase2InternalV82_() {
  var checks = [];
  var expected = expectedTrendDatesV82_(V81.TREND_START_DATE, new Date()).map(dateKey_);
  var snapshots = readTable_(V81.SHEETS.TREND, { requiredHeaders: V81.HEADERS.TREND }).rows;
  var details = readTable_(V81.SHEETS.TREND_DETAIL, { requiredHeaders: V81.HEADERS.TREND_DETAIL }).rows;
  var actualDates = snapshots.map(function (row) { return dateKey_(row['取樣日期']); });
  var missingDates = expected.filter(function (date) { return actualDates.indexOf(date) < 0; });
  var extraDates = actualDates.filter(function (date) { return expected.indexOf(date) < 0; });
  var duplicateDates = duplicatesV82_(actualDates);
  validationCheck_(checks, 'V8.2～V8.4 版本與欄位版本', ['8.2.0', '8.3.0', '8.3.1', '8.4.0'].indexOf(V81.VERSION) >= 0 && ['8.2', '8.3', '8.3.1', '8.4.0'].indexOf(V81.SCHEMA_VERSION) >= 0, { version: V81.VERSION, schema: V81.SCHEMA_VERSION });
  validationCheck_(checks, '預期取樣日期完整', missingDates.length === 0 && extraDates.length === 0, { expected: expected.length, actual: actualDates.length, missing: missingDates, extra: extraDates });
  validationCheck_(checks, '取樣日期唯一', duplicateDates.length === 0, duplicateDates);
  var invalidLevels = snapshots.filter(function (row) { return sampleLevelV82_(row['取樣日期']) !== cleanText_(row['取樣級距']); }).map(function (row) { return dateKey_(row['取樣日期']); });
  validationCheck_(checks, '10日、20日與月底級距正確', invalidLevels.length === 0, invalidLevels);
  var futureUsage = details.filter(function (row) {
    var sample = dateKey_(row['取樣日期']);
    var priceDate = dateKey_(row['價格日期']);
    var fxDate = dateKey_(row['匯率日期']);
    return (priceDate && priceDate > sample) || (fxDate && fxDate > sample);
  }).map(function (row) { return dateKey_(row['取樣日期']) + '|' + cleanText_(row['標的代號']); });
  validationCheck_(checks, '歷史價格與匯率不使用未來資訊', futureUsage.length === 0, futureUsage.slice(0, 20));
  var detailKeys = details.map(function (row) { return dateKey_(row['取樣日期']) + '|' + cleanText_(row['標的代號']); });
  validationCheck_(checks, '趨勢估值明細唯一', duplicatesV82_(detailKeys).length === 0, duplicatesV82_(detailKeys));
  var assets = loadAssets_();
  var transactions = loadTransactions_(false);
  var cashFlows = loadCashFlows_(false);
  var validationContext = { cache: readTrendCacheV82_(), priceCacheMap: {}, fxCacheMap: {}, errors: [] };
  loadPriceCache_().forEach(function (row) { validationContext.priceCacheMap[cleanText_(row['標的代號'])] = row; });
  loadFxCache_().forEach(function (row) { validationContext.fxCacheMap[cleanText_(row['幣別組合'])] = row; });
  var formulaErrors = [];
  var historicalStateErrors = [];
  var cashErrors = [];
  snapshots.forEach(function (row) {
    var sampleDate = dateKey_(row['取樣日期']);
    var positions = toNumber_(row['投資部位市值_TWD'], NaN);
    var cash = toNumber_(row['投資池現金_TWD'], NaN);
    var netAsset = toNumber_(row['投資淨資產_TWD'], NaN);
    var external = toNumber_(row['累積外部淨投入_TWD'], NaN);
    var result = toNumber_(row['累積投資成果_TWD'], NaN);
    if (cleanText_(row['資料狀態']) !== V81.TREND_STATUS.INCOMPLETE) {
      var categorySum = toNumber_(row['台股市值_TWD'], NaN) + toNumber_(row['美股市值_TWD'], NaN) + toNumber_(row['基金市值_TWD'], NaN);
      if (![positions, cash, netAsset, external, result, categorySum].every(isFinite) || Math.abs(positions - categorySum) > 0.02 || Math.abs(netAsset - positions - cash) > 0.02 || Math.abs(result - netAsset + external) > 0.02) formulaErrors.push(sampleDate);
    }
    var dateDetails = details.filter(function (detail) { return dateKey_(detail['取樣日期']) === sampleDate; });
    var expectedStates = computeInvestmentStateCore_(assets, transactions, [], [], sampleDate).filter(function (state) { return state.holding; });
    expectedStates.forEach(function (state) {
      var detail = dateDetails.find(function (candidate) { return cleanText_(candidate['標的代號']) === state.code; });
      if (!detail || Math.abs(toNumber_(detail['持有數量'], NaN) - state.quantity) > V81.EPSILON) historicalStateErrors.push(sampleDate + '|' + state.code);
    });
    dateDetails.forEach(function (detail) {
      if (!expectedStates.some(function (state) { return state.code === cleanText_(detail['標的代號']); })) historicalStateErrors.push(sampleDate + '|EXTRA:' + cleanText_(detail['標的代號']));
    });
    var expectedCash = computeInvestmentCashV82_(transactions, cashFlows, sampleDate, validationContext);
    var storedCash = toNumber_(row['投資池現金_TWD'], NaN);
    var storedExternal = toNumber_(row['累積外部淨投入_TWD'], NaN);
    if (Math.abs(storedExternal - expectedCash.externalNetTwd) > 0.02 || (expectedCash.cashTwd != null && Math.abs(storedCash - expectedCash.cashTwd) > 0.02) || expectedCash.errors.length) cashErrors.push({ date: sampleDate, expected: expectedCash, storedCash: storedCash, storedExternal: storedExternal });
  });
  validationCheck_(checks, '淨資產與累積成果公式', formulaErrors.length === 0, formulaErrors);
  validationCheck_(checks, '歷史持倉數量與截至日核心一致', historicalStateErrors.length === 0, historicalStateErrors.slice(0, 30));
  validationCheck_(checks, '投資池現金與外部淨投入重算一致', cashErrors.length === 0, cashErrors.slice(0, 10));
  var estimatedTraceErrors = details.filter(function (row) {
    return toBoolean_(row['是否估算'], false) && cleanText_(row['資料來源']).indexOf('transaction_price') !== 0 && cleanText_(row['資料來源']).indexOf('yahoo:') !== 0;
  }).map(function (row) { return dateKey_(row['取樣日期']) + '|' + cleanText_(row['標的代號']); });
  validationCheck_(checks, '估算標的來源可追查', estimatedTraceErrors.length === 0, estimatedTraceErrors.slice(0, 20));
  var openingStates = computeInvestmentStateCore_(assets, transactions, [], [], '2024-01-10').filter(function (row) { return row.holding; });
  var openingDetails = details.filter(function (row) { return dateKey_(row['取樣日期']) === '2024-01-10'; });
  var holdingMismatch = openingStates.filter(function (state) {
    var detail = openingDetails.find(function (row) { return cleanText_(row['標的代號']) === state.code; });
    return !detail || Math.abs(toNumber_(detail['持有數量'], 0) - state.quantity) > V81.EPSILON;
  }).map(function (state) { return state.code; });
  validationCheck_(checks, '2024 開帳持倉由歷史交易重建', holdingMismatch.length === 0, { expectedHoldings: openingStates.length, mismatches: holdingMismatch });
  var flows = cashFlows;
  var flowTotals = { inflow: 0, outflow: 0 };
  flows.forEach(function (row) { var amount = toNumber_(row['金額_TWD'], 0); if (cleanText_(row['類型']) === '入金') flowTotals.inflow += amount; else flowTotals.outflow += amount; });
  validationCheck_(checks, '外部流水筆數、方向及總額', flows.length === 41 && Math.abs(flowTotals.inflow - 18157846) < 0.01 && Math.abs(flowTotals.outflow - 3780000) < 0.01, { count: flows.length, inflow: flowTotals.inflow, outflow: flowTotals.outflow, net: flowTotals.inflow - flowTotals.outflow });
  var openingFlow = flows.find(function (row) { return cleanText_(row['流水ID']) === 'CFX-20240101-000041'; });
  validationCheck_(checks, '開帳投入存在且金額正確', openingFlow && cleanText_(openingFlow['類型']) === '入金' && Math.abs(toNumber_(openingFlow['金額_TWD'], 0) - 957846) < 0.01 && cleanText_(openingFlow['備註']) === '依 2024 年前交易推算之開帳投入', openingFlow || 'missing');
  var houseIncome = flows.find(function (row) { return dateKey_(row['日期']) === '2024-03-12' && cleanText_(row['備註']).indexOf('房子收入') >= 0; });
  validationCheck_(checks, '房子收入維持更正金額', houseIncome && cleanText_(houseIncome['類型']) === '入金' && Math.abs(toNumber_(houseIncome['金額_TWD'], 0) - 16060000) < 0.01, houseIncome || 'missing');
  var invalidStatus = snapshots.filter(function (row) { return [V81.TREND_STATUS.COMPLETE, V81.TREND_STATUS.ESTIMATED, V81.TREND_STATUS.INCOMPLETE].indexOf(cleanText_(row['資料狀態'])) < 0; });
  validationCheck_(checks, '快照資料狀態合法', invalidStatus.length === 0, invalidStatus.map(function (row) { return dateKey_(row['取樣日期']); }));
  var charts = getSheet_(V81.SHEETS.DASHBOARD).getCharts();
  validationCheck_(checks, 'Dashboard 只有兩張趨勢圖', charts.length === 2, { count: charts.length });
  var invalidChartRanges = [];
  charts.forEach(function (chart, chartIndex) {
    chart.getRanges().forEach(function (range) {
      if (range.getSheet().getName() !== V81.SHEETS.TREND) invalidChartRanges.push({ chart: chartIndex + 1, sheet: range.getSheet().getName(), range: range.getA1Notation() });
    });
  });
  validationCheck_(checks, 'Dashboard 圖表只引用趨勢快照', invalidChartRanges.length === 0, invalidChartRanges);
  var triggers = ScriptApp.getProjectTriggers();
  var daily = triggers.filter(function (trigger) { return trigger.getHandlerFunction() === (V81.VERSION === '8.4.0' ? 'dailyAssetMaintenance' : 'scheduledDailyJob'); });
  validationCheck_(checks, '只有一個每日排程', daily.length === 1 && triggers.length === 1, { daily: daily.length, total: triggers.length });
  validationCheck_(checks, '歷史輸出具冪等唯一鍵', duplicateDates.length === 0 && duplicatesV82_(detailKeys).length === 0, { snapshotDuplicates: duplicateDates, detailDuplicates: duplicatesV82_(detailKeys) });
  var idempotenceBefore = trendOutputStateV82_();
  var lastExpectedDate = expected.length ? expected[expected.length - 1] : '';
  // The date and month idempotence checks use the same latest-month market
  // context.  Reusing it keeps validatePhase2 below Apps Script's six-minute
  // execution limit without weakening either real upsert check.
  var idempotenceBuildContext = lastExpectedDate ? createTrendBuildContextV82_([toDate_(lastExpectedDate)]) : null;
  if (lastExpectedDate) rebuildTrendDatesInternalV82_([toDate_(lastExpectedDate)], idempotenceBuildContext);
  var idempotenceAfterDate = trendOutputStateV82_();
  if (lastExpectedDate) rebuildTrendDatesInternalV82_(trendDatesForMonthV82_(lastExpectedDate.slice(0, 7), new Date()), idempotenceBuildContext);
  var idempotenceAfterMonth = trendOutputStateV82_();
  var idempotent = idempotenceBefore.snapshotCount === idempotenceAfterDate.snapshotCount && idempotenceBefore.detailCount === idempotenceAfterDate.detailCount && idempotenceBefore.hash === idempotenceAfterDate.hash && idempotenceBefore.snapshotCount === idempotenceAfterMonth.snapshotCount && idempotenceBefore.detailCount === idempotenceAfterMonth.detailCount && idempotenceBefore.hash === idempotenceAfterMonth.hash;
  validationCheck_(checks, '指定日期與月份重跑內容雜湊一致', idempotent, { before: idempotenceBefore, afterDate: idempotenceAfterDate, afterMonth: idempotenceAfterMonth });
  var errors = checks.filter(function (check) { return !check.ok && check.severity !== 'warning'; });
  var warnings = checks.filter(function (check) { return !check.ok && check.severity === 'warning'; });
  return {
    success: errors.length === 0,
    checkCount: checks.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    expectedSnapshotCount: expected.length,
    actualSnapshotCount: snapshots.length,
    detailCount: details.length,
    estimatedSnapshotCount: snapshots.filter(function (row) { return cleanText_(row['資料狀態']) === V81.TREND_STATUS.ESTIMATED; }).length,
    incompleteSnapshotCount: snapshots.filter(function (row) { return cleanText_(row['資料狀態']) === V81.TREND_STATUS.INCOMPLETE; }).length,
    missingDates: missingDates,
    estimatedDetails: details.filter(function (row) { return toBoolean_(row['是否估算'], false); }).map(function (row) { return { date: dateKey_(row['取樣日期']), assetCode: cleanText_(row['標的代號']), source: cleanText_(row['資料來源']), priceDate: dateKey_(row['價格日期']), fxDate: dateKey_(row['匯率日期']) }; }),
    missingDetails: details.filter(function (row) { return cleanText_(row['資料來源']).indexOf('MISSING_') === 0; }).map(function (row) { return { date: dateKey_(row['取樣日期']), assetCode: cleanText_(row['標的代號']), source: cleanText_(row['資料來源']) }; }),
    checks: checks
  };
}

function validatePhase2() {
  try {
    var result = withDocumentLock_(function () {
      var phase1 = validatePhase1Internal_();
      var phase2 = validatePhase2InternalV82_();
      var success = phase1.success && phase2.success;
      setSettingValues_({ LAST_VALIDATION_AT: nowSheet_(), LAST_VALIDATION_STATUS: success ? 'PASS' : 'FAIL' });
      return apiResult_(success, success ? 'OK' : 'VALIDATION_FAILED', success ? 'V8.2 驗證通過' : 'V8.2 驗證未通過', { phase1: phase1, phase2: phase2 });
    });
    console.log(JSON.stringify({
      success: result.success,
      code: result.code,
      message: result.message,
      phase1ErrorCount: result.data.phase1.errorCount,
      phase1WarningCount: result.data.phase1.warningCount,
      phase2CheckCount: result.data.phase2.checkCount,
      phase2ErrorCount: result.data.phase2.errorCount,
      phase2WarningCount: result.data.phase2.warningCount,
      expectedSnapshotCount: result.data.phase2.expectedSnapshotCount,
      actualSnapshotCount: result.data.phase2.actualSnapshotCount,
      detailCount: result.data.phase2.detailCount,
      estimatedSnapshotCount: result.data.phase2.estimatedSnapshotCount,
      incompleteSnapshotCount: result.data.phase2.incompleteSnapshotCount,
      failedChecks: result.data.phase2.checks.filter(function (check) { return !check.ok; }).map(function (check) { return { name: check.name, severity: check.severity }; })
    }));
    return result;
  } catch (error) {
    setSettingValues_({ LAST_VALIDATION_AT: nowSheet_(), LAST_VALIDATION_STATUS: 'ERROR' });
    var failure = apiResult_(false, 'VALIDATION_V82_ERROR', error.message, {});
    console.log(JSON.stringify(failure));
    return failure;
  }
}
