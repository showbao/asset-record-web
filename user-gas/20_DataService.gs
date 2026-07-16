function ensureV81Schema_() {
  var results = [];
  results.push(migratePerformanceXirrHeaderV831_());
  results.push(ensureHeaders_(V81.SHEETS.ASSETS, V81.HEADERS.ASSETS));
  results.push(ensureHeaders_(V81.SHEETS.TRANSACTIONS, V81.HEADERS.TRANSACTIONS));
  results.push(ensureHeaders_(V81.SHEETS.CASH_FLOWS, V81.HEADERS.CASH_FLOWS));
  results.push(ensureHeaders_(V81.SHEETS.PRICE_CACHE, V81.HEADERS.PRICE_CACHE_REQUIRED));
  results.push(ensureHeaders_(V81.SHEETS.FX_CACHE, V81.HEADERS.FX_CACHE_REQUIRED));
  results.push(ensureHeaders_(V81.SHEETS.CALCULATION, V81.HEADERS.CALCULATION_REQUIRED));
  results.push(ensureHeaders_(V81.SHEETS.PERFORMANCE, V81.HEADERS.PERFORMANCE_REQUIRED));
  results.push(applyNumberFormatsByHeaderV831_(V81.SHEETS.PERFORMANCE, performanceNumberFormatsV831_()));
  results.push(ensureHeaders_(V81.SHEETS.CATEGORY_PERFORMANCE, V81.HEADERS.CATEGORY_REQUIRED));
  results.push(ensureHeaders_(V81.SHEETS.TREND, V81.HEADERS.TREND));
  results.push(ensureHeaders_(V81.SHEETS.TREND_DETAIL, V81.HEADERS.TREND_DETAIL));
  results.push(ensureTrendCacheHeaders_());
  ensureV81Settings_(V81.SETTINGS);
  applyV81Validations_();
  return results;
}

function ensureTrendCacheHeaders_() {
  var sheet = getSheet_(V81.SHEETS.TEMP);
  var startColumn = V81.TREND_CACHE_START_COLUMN;
  var requiredColumns = startColumn + V81.HEADERS.TREND_CACHE.length - 1;
  if (sheet.getMaxColumns() < requiredColumns) sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredColumns - sheet.getMaxColumns());
  var range = sheet.getRange(1, startColumn, 1, V81.HEADERS.TREND_CACHE.length);
  var current = range.getValues()[0].map(cleanText_);
  var occupied = current.some(Boolean);
  if (occupied && current.join('|') !== V81.HEADERS.TREND_CACHE.join('|')) throw new Error('系統暫存 AA:AJ 已有其他資料，無法建立 V8.2 歷史快取');
  if (!occupied) range.setValues([V81.HEADERS.TREND_CACHE]);
  return { sheet: V81.SHEETS.TEMP, startColumn: startColumn, headers: V81.HEADERS.TREND_CACHE };
}

function applyV81Validations_() {
  var transactionTable = readTable_(V81.SHEETS.TRANSACTIONS);
  var transactionTypeColumn = transactionTable.headerMap['交易類型'];
  if (transactionTypeColumn != null) {
    var transactionRule = SpreadsheetApp.newDataValidation().requireValueInList(V81.TRANSACTION_TYPES, true).setAllowInvalid(false).build();
    transactionTable.sheet.getRange(2, transactionTypeColumn + 1, transactionTable.sheet.getMaxRows() - 1, 1).setDataValidation(transactionRule);
  }
  var cashFlowTable = readTable_(V81.SHEETS.CASH_FLOWS);
  var cashTypeColumn = cashFlowTable.headerMap['類型'];
  if (cashTypeColumn != null) {
    var cashRule = SpreadsheetApp.newDataValidation().requireValueInList(V81.CASH_FLOW_TYPES, true).setAllowInvalid(false).build();
    cashFlowTable.sheet.getRange(2, cashTypeColumn + 1, cashFlowTable.sheet.getMaxRows() - 1, 1).setDataValidation(cashRule);
  }
  var assetTable = readTable_(V81.SHEETS.ASSETS);
  var typeColumn = assetTable.headerMap['標的類型'];
  var currencyRule = SpreadsheetApp.newDataValidation().requireValueInList(V81.CURRENCIES, true).setAllowInvalid(false).build();
  if (typeColumn != null) {
    var typeRule = SpreadsheetApp.newDataValidation().requireValueInList(V81.ASSET_TYPES, true).setAllowInvalid(false).build();
    assetTable.sheet.getRange(2, typeColumn + 1, assetTable.sheet.getMaxRows() - 1, 1).setDataValidation(typeRule);
  }
  ['交易幣別', '淨值幣別'].forEach(function (header) {
    var column = assetTable.headerMap[header];
    if (column != null) assetTable.sheet.getRange(2, column + 1, assetTable.sheet.getMaxRows() - 1, 1).setDataValidation(currencyRule);
  });
}

function upsertV81Settings_(updates) {
  var sheet = getSheet_(V81.SHEETS.SETTINGS);
  var lastRow = Math.max(sheet.getLastRow(), 1);
  var values = sheet.getRange(1, 1, lastRow, 3).getValues();
  if (!values.length) values = [['設定項目', '設定值', '說明']];
  var map = {};
  for (var row = 1; row < values.length; row++) {
    var key = cleanText_(values[row][0]);
    if (key && map[key] == null) map[key] = row;
  }
  Object.keys(updates).forEach(function (key) {
    var value = updates[key];
    if (map[key] == null) {
      map[key] = values.length;
      values.push([key, value, V81.SETTING_DESCRIPTIONS[key] || 'V8 系統設定']);
    } else {
      values[map[key]][1] = value;
      if (!cleanText_(values[map[key]][2])) values[map[key]][2] = V81.SETTING_DESCRIPTIONS[key] || 'V8 系統設定';
    }
  });
  if (sheet.getMaxRows() < values.length) sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
  sheet.getRange(1, 1, values.length, 3).setValues(values);
  return values.length - 1;
}

function ensureV81Settings_(defaults) {
  var settings = getSettingsMap_();
  var missing = {};
  Object.keys(defaults).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(settings, key)) missing[key] = defaults[key];
  });
  if (Object.keys(missing).length) upsertV81Settings_(missing);
}

function getSettingsMap_() {
  var table = readTable_(V81.SHEETS.SETTINGS);
  var settings = {};
  table.rows.forEach(function (row) {
    var key = cleanText_(row['設定項目']);
    if (key) settings[key] = row['設定值'];
  });
  return settings;
}

function setSettingValues_(updates) {
  upsertV81Settings_(updates);
}

function setNeedsRecalc_(needsRecalc) {
  setSettingValues_({ NEEDS_RECALC: needsRecalc ? 'TRUE' : 'FALSE' });
}

function markTrendDirtyFrom_(date) {
  var candidate = dateKey_(date) || V81.TREND_START_DATE;
  if (candidate < V81.TREND_START_DATE) candidate = V81.TREND_START_DATE;
  var settings = getSettingsMap_();
  var existing = dateKey_(settings.TREND_DIRTY_FROM_DATE);
  var dirty = existing && existing < candidate ? existing : candidate;
  setSettingValues_({ NEEDS_RECALC: 'TRUE', TREND_DIRTY_FROM_DATE: dirty });
  return dirty;
}

function markAllTrendDirty_() {
  return markTrendDirtyFrom_(V81.TREND_START_DATE);
}

function loadAssets_(context) {
  return readTable_(serviceSheetName_(context, 'ASSETS'), { requiredHeaders: V81.HEADERS.ASSETS, idHeader: '標的代號' }).rows;
}

function loadTransactions_(includeDeleted, context) {
  var rows = readTable_(serviceSheetName_(context, 'TRANSACTIONS'), { requiredHeaders: V81.HEADERS.TRANSACTIONS, idHeader: '交易ID' }).rows;
  return includeDeleted ? rows : rows.filter(function (row) { return !cleanText_(row['刪除時間']); });
}

function loadCashFlows_(includeDeleted, context) {
  var rows = readTable_(serviceSheetName_(context, 'CASH_FLOWS'), { requiredHeaders: V81.HEADERS.CASH_FLOWS, idHeader: '流水ID' }).rows;
  // 「外部出入金」第 2 列保留給使用者閱讀的操作說明，不是資金流水。
  rows = rows.filter(function (row) {
    return cleanText_(row['流水ID']) !== '只記錄真正從投資系統外部進入或提出的資金；股息、賣出款及再投入不在此重複登錄。';
  });
  return includeDeleted ? rows : rows.filter(function (row) { return !cleanText_(row['刪除時間']); });
}

function loadPriceCache_() {
  return readTable_(V81.SHEETS.PRICE_CACHE, { idHeader: '標的代號' }).rows;
}

function loadFxCache_() {
  return readTable_(V81.SHEETS.FX_CACHE, { idHeader: '幣別組合' }).rows;
}

function pickValue_(payload, englishKey, chineseKey, fallback) {
  if (payload && Object.prototype.hasOwnProperty.call(payload, englishKey)) return payload[englishKey];
  if (payload && chineseKey && Object.prototype.hasOwnProperty.call(payload, chineseKey)) return payload[chineseKey];
  return fallback;
}

function normalizeAssetPayload_(payload, existing) {
  existing = existing || {};
  var type = cleanText_(pickValue_(payload, 'type', '標的類型', existing['標的類型']));
  var code = cleanText_(pickValue_(payload, 'code', '標的代號', existing['標的代號']));
  if (type === 'us_stock') code = code.toUpperCase();
  return {
    '標的代號': code,
    '標的名稱': cleanText_(pickValue_(payload, 'name', '標的名稱', existing['標的名稱'])),
    '標的類型': type,
    '交易幣別': cleanText_(pickValue_(payload, 'tradeCurrency', '交易幣別', existing['交易幣別'])).toUpperCase(),
    '淨值幣別': cleanText_(pickValue_(payload, 'navCurrency', '淨值幣別', existing['淨值幣別'])).toUpperCase(),
    '基金ID': cleanText_(pickValue_(payload, 'fundId', '基金ID', existing['基金ID'])),
    '是否啟用': toBoolean_(pickValue_(payload, 'enabled', '是否啟用', existing['是否啟用']), true),
    '是否更新淨值': toBoolean_(pickValue_(payload, 'updatePrice', '是否更新淨值', existing['是否更新淨值']), true),
    '價格來源': cleanText_(pickValue_(payload, 'priceSource', '價格來源', existing['價格來源'] || 'auto')).toLowerCase(),
    '建立時間': existing['建立時間'] || nowSheet_(),
    '更新時間': nowSheet_(),
    '備註': cleanText_(pickValue_(payload, 'note', '備註', existing['備註'])),
    '基金屬性': cleanText_(pickValue_(payload, 'fundCategory', '基金屬性', existing['基金屬性']))
  };
}

function validateAsset_(asset) {
  var errors = [];
  if (!asset['標的代號']) errors.push('標的代號必填');
  if (!asset['標的名稱']) errors.push('標的名稱必填');
  if (V81.ASSET_TYPES.indexOf(asset['標的類型']) < 0) errors.push('不支援的標的類型');
  if (V81.CURRENCIES.indexOf(asset['交易幣別']) < 0) errors.push('不支援的交易幣別');
  if (V81.CURRENCIES.indexOf(asset['淨值幣別']) < 0) errors.push('不支援的淨值幣別');
  if (asset['標的類型'] === 'fund' && !asset['基金ID']) errors.push('基金必須提供基金ID');
  if (asset['標的類型'] === 'tw_stock' && !/^[0-9A-Z]+$/.test(asset['標的代號'])) errors.push('台股代號格式錯誤');
  if (errors.length) throw new Error(errors.join('；'));
}

function createAsset(payload, context) {
  try {
    return withDocumentLock_(function () {
      var table = readTable_(serviceSheetName_(context, 'ASSETS'), { requiredHeaders: V81.HEADERS.ASSETS, idHeader: '標的代號' });
      var asset = normalizeAssetPayload_(payload, null);
      validateAsset_(asset);
      if (table.rows.some(function (row) { return cleanText_(row['標的代號']) === asset['標的代號']; })) throw new Error('標的代號已存在：' + asset['標的代號']);
      appendObjectRow_(table, asset);
      markServiceDirty_(context, V81.TREND_START_DATE, true);
      return apiResult_(true, 'OK', '已新增投資標的', { asset: asset });
    });
  } catch (error) {
    return apiResult_(false, 'ASSET_CREATE_FAILED', error.message, {});
  }
}

function updateAsset(code, patch, context) {
  try {
    return withDocumentLock_(function () {
      var table = readTable_(serviceSheetName_(context, 'ASSETS'), { requiredHeaders: V81.HEADERS.ASSETS, idHeader: '標的代號' });
      var normalizedCode = cleanText_(code);
      var existing = table.rows.find(function (row) { return cleanText_(row['標的代號']) === normalizedCode; });
      if (!existing) throw new Error('找不到標的：' + normalizedCode);
      var merged = normalizeAssetPayload_(patch || {}, existing);
      merged['標的代號'] = normalizedCode;
      validateAsset_(merged);
      updateObjectRow_(table, existing.__rowNumber, Object.assign({}, existing, merged));
      markServiceDirty_(context, V81.TREND_START_DATE, true);
      return apiResult_(true, 'OK', '已更新投資標的', { asset: merged });
    });
  } catch (error) {
    return apiResult_(false, 'ASSET_UPDATE_FAILED', error.message, {});
  }
}

function disableAsset(code, context) {
  var existing = loadAssets_(context).find(function (row) { return cleanText_(row['標的代號']) === cleanText_(code); });
  if (existing && !toBoolean_(existing['是否啟用'], false)) return apiResult_(true, 'ALREADY_DISABLED', '標的已停用', { asset: existing });
  return updateAsset(code, { enabled: false }, context);
}

function nextIdSequence_(propertyKey, rows, idHeader, context) {
  if (context && context.sequences) {
    var testCurrent = Number(context.sequences[propertyKey]) || 0;
    testCurrent += 1;
    context.sequences[propertyKey] = testCurrent;
    return testCurrent;
  }
  var properties = PropertiesService.getScriptProperties();
  var current = Number(properties.getProperty(propertyKey));
  if (!isFinite(current) || current < 1) {
    current = rows.reduce(function (max, row) {
      var match = cleanText_(row[idHeader]).match(/(\d{6})$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
  }
  current += 1;
  properties.setProperty(propertyKey, String(current));
  return current;
}

function generateCashFlowId_(date, rows, context) {
  var sequence = nextIdSequence_('V81_CFX_SEQUENCE', rows, '流水ID', context);
  return 'CFX-' + dateKey_(date).replace(/-/g, '') + '-' + String(sequence).padStart(6, '0');
}

function normalizeCashFlowPayload_(payload, existing) {
  existing = existing || {};
  var date = toDate_(pickValue_(payload, 'date', '日期', existing['日期']));
  var type = cleanText_(pickValue_(payload, 'type', '類型', existing['類型']));
  var amount = toNumber_(pickValue_(payload, 'amount', '金額', existing['金額']), NaN);
  var currency = cleanText_(pickValue_(payload, 'currency', '幣別', existing['幣別'])).toUpperCase();
  var fxRate = currency === 'TWD' ? 1 : toNumber_(pickValue_(payload, 'fxRate', '換算匯率', existing['換算匯率']), NaN);
  return {
    '流水ID': existing['流水ID'] || '',
    '日期': date,
    '類型': type,
    '金額': amount,
    '幣別': currency,
    '換算匯率': fxRate,
    '金額_TWD': isFinite(amount) && isFinite(fxRate) ? round_(amount * fxRate, 8) : '',
    '備註': cleanText_(pickValue_(payload, 'note', '備註', existing['備註'])),
    '建立時間': existing['建立時間'] || nowSheet_(),
    '更新時間': nowSheet_(),
    '刪除時間': existing['刪除時間'] || ''
  };
}

function validateCashFlow_(flow) {
  if (!flow['日期']) throw new Error('日期必填');
  if (V81.CASH_FLOW_TYPES.indexOf(flow['類型']) < 0) throw new Error('類型只允許入金或出金');
  if (!(flow['金額'] > 0)) throw new Error('金額必須大於 0');
  if (V81.CURRENCIES.indexOf(flow['幣別']) < 0) throw new Error('不支援的幣別');
  if (!(flow['換算匯率'] > 0)) throw new Error('換算匯率必須大於 0');
}

function createExternalCashFlow(payload, context) {
  try {
    return withDocumentLock_(function () {
      var table = readTable_(serviceSheetName_(context, 'CASH_FLOWS'), { requiredHeaders: V81.HEADERS.CASH_FLOWS, idHeader: '流水ID' });
      var flow = normalizeCashFlowPayload_(payload, null);
      validateCashFlow_(flow);
      flow['流水ID'] = generateCashFlowId_(flow['日期'], table.rows, context);
      appendObjectRow_(table, flow);
      markServiceDirty_(context, flow['日期'], false);
      return apiResult_(true, 'OK', '已新增外部出入金', { cashFlow: flow });
    });
  } catch (error) {
    return apiResult_(false, 'CASH_FLOW_CREATE_FAILED', error.message, {});
  }
}

function updateExternalCashFlow(id, patch, context) {
  try {
    return withDocumentLock_(function () {
      var table = readTable_(serviceSheetName_(context, 'CASH_FLOWS'), { requiredHeaders: V81.HEADERS.CASH_FLOWS, idHeader: '流水ID' });
      var existing = table.rows.find(function (row) { return cleanText_(row['流水ID']) === cleanText_(id); });
      if (!existing) throw new Error('找不到流水：' + id);
      var merged = normalizeCashFlowPayload_(patch || {}, existing);
      merged['流水ID'] = cleanText_(id);
      validateCashFlow_(merged);
      updateObjectRow_(table, existing.__rowNumber, Object.assign({}, existing, merged));
      var dirtyDate = dateKey_(existing['日期']) < dateKey_(merged['日期']) ? existing['日期'] : merged['日期'];
      markServiceDirty_(context, dirtyDate, false);
      return apiResult_(true, 'OK', '已更新外部出入金', { cashFlow: merged });
    });
  } catch (error) {
    return apiResult_(false, 'CASH_FLOW_UPDATE_FAILED', error.message, {});
  }
}

function setCashFlowDeleted_(id, deleted, context) {
  try {
    return withDocumentLock_(function () {
      var table = readTable_(serviceSheetName_(context, 'CASH_FLOWS'), { requiredHeaders: V81.HEADERS.CASH_FLOWS, idHeader: '流水ID' });
      var existing = table.rows.find(function (row) { return cleanText_(row['流水ID']) === cleanText_(id); });
      if (!existing) throw new Error('找不到流水：' + id);
      var isDeleted = Boolean(cleanText_(existing['刪除時間']));
      if (deleted === isDeleted) return apiResult_(true, deleted ? 'ALREADY_DELETED' : 'ALREADY_ACTIVE', deleted ? '流水已刪除' : '流水已是有效狀態', { id: id });
      existing['刪除時間'] = deleted ? nowSheet_() : '';
      existing['更新時間'] = nowSheet_();
      updateObjectRow_(table, existing.__rowNumber, existing);
      markServiceDirty_(context, existing['日期'], false);
      return apiResult_(true, 'OK', deleted ? '已軟刪除外部出入金' : '已還原外部出入金', { id: id });
    });
  } catch (error) {
    return apiResult_(false, deleted ? 'CASH_FLOW_DELETE_FAILED' : 'CASH_FLOW_RESTORE_FAILED', error.message, {});
  }
}

function deleteExternalCashFlow(id, context) {
  return setCashFlowDeleted_(id, true, context);
}

function restoreExternalCashFlow(id, context) {
  return setCashFlowDeleted_(id, false, context);
}
