var V83_PROPERTIES = Object.freeze({
  BACKUP_ID: 'V83_PREDEPLOY_BACKUP_ID',
  MARKET_STATUS: 'V83_MARKET_REFRESH_STATUS',
  MARKET_REQUESTED_AT: 'V83_MARKET_REFRESH_REQUESTED_AT',
  MARKET_STARTED_AT: 'V83_MARKET_REFRESH_STARTED_AT',
  MARKET_FINISHED_AT: 'V83_MARKET_REFRESH_FINISHED_AT',
  MARKET_ERROR: 'V83_MARKET_REFRESH_ERROR',
  REBUILD_STATUS: 'V83_REBUILD_STATUS',
  REBUILD_REQUESTED_AT: 'V83_REBUILD_REQUESTED_AT',
  REBUILD_STARTED_AT: 'V83_REBUILD_STARTED_AT',
  REBUILD_FINISHED_AT: 'V83_REBUILD_FINISHED_AT',
  REBUILD_ERROR: 'V83_REBUILD_ERROR'
});

function validatePhase3Preflight() {
  assertMutationAllowedV84_();
  var result = runPhase3ValidationV83_(false);
  console.log(JSON.stringify({ success: result.success, code: result.code, message: result.message, checkCount: result.data.phase3.checkCount, errorCount: result.data.phase3.errorCount, warningCount: result.data.phase3.warningCount, failedChecks: result.data.phase3.checks.filter(function (check) { return !check.ok; }).map(function (check) { return { name: check.name, severity: check.severity }; }) }));
  return result;
}

function validatePhase3() {
  assertMutationAllowedV84_();
  var result = runPhase3ValidationV83_(true);
  console.log(JSON.stringify({ success: result.success, code: result.code, message: result.message, checkCount: result.data.phase3.checkCount, errorCount: result.data.phase3.errorCount, warningCount: result.data.phase3.warningCount, failedChecks: result.data.phase3.checks.filter(function (check) { return !check.ok; }).map(function (check) { return { name: check.name, severity: check.severity }; }) }));
  return result;
}

function apiErrorV83_(code, message, details) {
  var error = new Error(message || code);
  error.apiCode = code;
  error.details = details || {};
  return error;
}

function throwApiErrorV83_(code, message, details) {
  throw apiErrorV83_(code, message, details);
}

function apiResultV83_(success, code, message, data, requestId) {
  var result = apiResult_(success, code, message, data);
  result.requestId = cleanText_(requestId);
  result.warnings = [];
  result.error = success ? null : { code: result.code, message: result.message };
  return result;
}

function jsonOutputV83_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function bytesToHexV83_(bytes) {
  return bytes.map(function (value) {
    var unsigned = value < 0 ? value + 256 : value;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}

function propertyStoreV83_(options) {
  return options && options.properties ? options.properties : PropertiesService.getScriptProperties();
}

function ensureAllowedKeysV83_(object, allowed, label) {
  object = object || {};
  Object.keys(object).forEach(function (key) {
    if (allowed.indexOf(key) < 0) throwApiErrorV83_('INVALID_REQUEST', (label || '欄位') + '不支援：' + key);
  });
  return object;
}

function isDateValueV831_(value) {
  return value instanceof Date || Object.prototype.toString.call(value) === '[object Date]';
}

function cleanNullableNumberV831_(value) {
  if (value == null || value === '' || isDateValueV831_(value)) return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  var text = value.trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  var number = Number(text);
  return isFinite(number) ? number : null;
}

function cleanNullableNumberV83_(value) {
  return cleanNullableNumberV831_(value);
}

function isoDateV83_(value) {
  return dateKey_(value) || null;
}

function isoDateTimeV83_(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, V81.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
  var text = cleanText_(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return text.replace(' ', 'T') + '+08:00';
  var parsed = toDate_(text);
  return parsed ? Utilities.formatDate(parsed, V81.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX") : text;
}

function apiMetaV83_() {
  var settings = getSettingsMap_();
  return {
    needsRecalc: toBoolean_(settings.NEEDS_RECALC, false),
    lastMarketRefreshAt: isoDateTimeV83_(settings.LAST_MARKET_REFRESH_AT),
    lastRebuildAt: isoDateTimeV83_(settings.LAST_REBUILD_AT),
    lastValidationAt: isoDateTimeV83_(settings.LAST_VALIDATION_AT),
    lastValidationStatus: cleanText_(settings.LAST_VALIDATION_STATUS) || null
  };
}

function parsePaginationV83_(params) {
  params = params || {};
  var page = params.page == null || params.page === '' ? 1 : Number(params.page);
  var pageSize = params.pageSize == null || params.pageSize === '' ? V81.API_DEFAULT_PAGE_SIZE : Number(params.pageSize);
  if (!Number.isInteger(page) || page < 1) throwApiErrorV83_('VALIDATION_ERROR', 'page 必須是大於 0 的整數');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > V81.API_MAX_PAGE_SIZE) throwApiErrorV83_('VALIDATION_ERROR', 'pageSize 必須介於 1 到 ' + V81.API_MAX_PAGE_SIZE);
  return { page: page, pageSize: pageSize };
}

function paginateV83_(items, params, meta) {
  var pagination = parsePaginationV83_(params);
  var total = items.length;
  var totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  var start = (pagination.page - 1) * pagination.pageSize;
  return {
    items: items.slice(start, start + pagination.pageSize),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: total,
    totalPages: totalPages,
    hasNext: pagination.page < totalPages,
    meta: meta || apiMetaV83_()
  };
}

function containsV83_(values, query) {
  query = cleanText_(query).toLowerCase();
  if (!query) return true;
  return values.some(function (value) { return cleanText_(value).toLowerCase().indexOf(query) >= 0; });
}

function assetToApiV83_(row) {
  return {
    code: cleanText_(row['標的代號']),
    name: cleanText_(row['標的名稱']),
    type: cleanText_(row['標的類型']),
    tradeCurrency: cleanText_(row['交易幣別']),
    navCurrency: cleanText_(row['淨值幣別']),
    fundId: cleanText_(row['基金ID']) || null,
    enabled: toBoolean_(row['是否啟用'], false),
    updatePrice: toBoolean_(row['是否更新淨值'], false),
    priceSource: cleanText_(row['價格來源']) || null,
    createdAt: isoDateTimeV83_(row['建立時間']),
    updatedAt: isoDateTimeV83_(row['更新時間']),
    note: cleanText_(row['備註']) || null,
    fundCategory: cleanText_(row['基金屬性']) || null
  };
}

function transactionToApiV83_(row) {
  return {
    id: cleanText_(row['交易ID']),
    date: isoDateV83_(row['日期']),
    assetCode: cleanText_(row['標的代號']),
    assetName: cleanText_(row['標的名稱']),
    assetType: cleanText_(row['標的類型']),
    tradeCurrency: cleanText_(row['交易幣別']),
    navCurrency: cleanText_(row['淨值幣別']),
    type: cleanText_(row['交易類型']),
    bank: cleanText_(row['交易銀行']) || null,
    quantity: cleanNullableNumberV83_(row['數量']),
    price: cleanNullableNumberV83_(row['單價']),
    fee: cleanNullableNumberV83_(row['手續費']),
    actualAmount: cleanNullableNumberV83_(row['實際入出金額']),
    splitBefore: cleanNullableNumberV83_(row['分割前股數']),
    splitAfter: cleanNullableNumberV83_(row['分割後股數']),
    note: cleanText_(row['備註']) || null,
    createdAt: isoDateTimeV83_(row['建立時間']),
    updatedAt: isoDateTimeV83_(row['更新時間']),
    deletedAt: isoDateTimeV83_(row['刪除時間']),
    source: cleanText_(row['資料來源']) || null,
    manualAmount: toBoolean_(row['人工金額標誌'], false)
  };
}

function cashFlowToApiV83_(row) {
  return {
    id: cleanText_(row['流水ID']),
    date: isoDateV83_(row['日期']),
    type: cleanText_(row['類型']),
    amount: cleanNullableNumberV83_(row['金額']),
    currency: cleanText_(row['幣別']),
    fxRate: cleanNullableNumberV83_(row['換算匯率']),
    amountTwd: cleanNullableNumberV83_(row['金額_TWD']),
    note: cleanText_(row['備註']) || null,
    createdAt: isoDateTimeV83_(row['建立時間']),
    updatedAt: isoDateTimeV83_(row['更新時間']),
    deletedAt: isoDateTimeV83_(row['刪除時間'])
  };
}

function listAssetsApiV83_(params, options) {
  params = ensureAllowedKeysV83_(params || {}, ['page', 'pageSize', 'query', 'type', 'enabled'], 'params');
  var rows = loadAssets_(options && options.serviceContext).filter(function (row) {
    var enabled = params.enabled == null || params.enabled === '' || cleanText_(params.enabled) === 'all' ? null : toBoolean_(params.enabled, false);
    return containsV83_([row['標的代號'], row['標的名稱'], row['備註']], params.query) &&
      (!cleanText_(params.type) || cleanText_(row['標的類型']) === cleanText_(params.type)) &&
      (enabled == null || toBoolean_(row['是否啟用'], false) === enabled);
  });
  rows.sort(function (a, b) { return cleanText_(a['標的代號']).localeCompare(cleanText_(b['標的代號'])); });
  return paginateV83_(rows.map(assetToApiV83_), params);
}

function getAssetApiV83_(params, options) {
  params = ensureAllowedKeysV83_(params || {}, ['code'], 'params');
  var code = cleanText_(params.code);
  var row = loadAssets_(options && options.serviceContext).find(function (candidate) { return cleanText_(candidate['標的代號']) === code; });
  if (!row) throwApiErrorV83_('NOT_FOUND', '找不到標的：' + code);
  return { item: assetToApiV83_(row), meta: apiMetaV83_() };
}

function listTransactionsApiV83_(params, options) {
  params = ensureAllowedKeysV83_(params || {}, ['page', 'pageSize', 'query', 'assetCode', 'type', 'dateFrom', 'dateTo', 'deleted'], 'params');
  var deleted = cleanText_(params.deleted) || 'active';
  if (['active', 'deleted', 'all'].indexOf(deleted) < 0) throwApiErrorV83_('VALIDATION_ERROR', 'deleted 只允許 active、deleted 或 all');
  var rows = loadTransactions_(true, options && options.serviceContext).filter(function (row) {
    var rowDeleted = Boolean(cleanText_(row['刪除時間']));
    var date = dateKey_(row['日期']);
    return containsV83_([row['交易ID'], row['標的代號'], row['標的名稱'], row['備註'], row['交易銀行']], params.query) &&
      (!cleanText_(params.assetCode) || cleanText_(row['標的代號']) === cleanText_(params.assetCode)) &&
      (!cleanText_(params.type) || cleanText_(row['交易類型']) === cleanText_(params.type)) &&
      (!dateKey_(params.dateFrom) || date >= dateKey_(params.dateFrom)) &&
      (!dateKey_(params.dateTo) || date <= dateKey_(params.dateTo)) &&
      (deleted === 'all' || (deleted === 'deleted' ? rowDeleted : !rowDeleted));
  });
  rows.sort(function (a, b) { var dateOrder = dateKey_(b['日期']).localeCompare(dateKey_(a['日期'])); return dateOrder || cleanText_(b['交易ID']).localeCompare(cleanText_(a['交易ID'])); });
  return paginateV83_(rows.map(transactionToApiV83_), params);
}

function getTransactionApiV83_(params, options) {
  params = ensureAllowedKeysV83_(params || {}, ['id'], 'params');
  var id = cleanText_(params.id);
  var row = loadTransactions_(true, options && options.serviceContext).find(function (candidate) { return cleanText_(candidate['交易ID']) === id; });
  if (!row) throwApiErrorV83_('NOT_FOUND', '找不到交易：' + id);
  return { item: transactionToApiV83_(row), meta: apiMetaV83_() };
}

function listCashFlowsApiV83_(params, options) {
  params = ensureAllowedKeysV83_(params || {}, ['page', 'pageSize', 'query', 'type', 'currency', 'dateFrom', 'dateTo', 'deleted'], 'params');
  var deleted = cleanText_(params.deleted) || 'active';
  if (['active', 'deleted', 'all'].indexOf(deleted) < 0) throwApiErrorV83_('VALIDATION_ERROR', 'deleted 只允許 active、deleted 或 all');
  var rows = loadCashFlows_(true, options && options.serviceContext).filter(function (row) {
    var rowDeleted = Boolean(cleanText_(row['刪除時間']));
    var date = dateKey_(row['日期']);
    return containsV83_([row['流水ID'], row['備註']], params.query) &&
      (!cleanText_(params.type) || cleanText_(row['類型']) === cleanText_(params.type)) &&
      (!cleanText_(params.currency) || cleanText_(row['幣別']) === cleanText_(params.currency)) &&
      (!dateKey_(params.dateFrom) || date >= dateKey_(params.dateFrom)) &&
      (!dateKey_(params.dateTo) || date <= dateKey_(params.dateTo)) &&
      (deleted === 'all' || (deleted === 'deleted' ? rowDeleted : !rowDeleted));
  });
  rows.sort(function (a, b) { var dateOrder = dateKey_(b['日期']).localeCompare(dateKey_(a['日期'])); return dateOrder || cleanText_(b['流水ID']).localeCompare(cleanText_(a['流水ID'])); });
  return paginateV83_(rows.map(cashFlowToApiV83_), params);
}

function getCashFlowApiV83_(params, options) {
  params = ensureAllowedKeysV83_(params || {}, ['id'], 'params');
  var id = cleanText_(params.id);
  var row = loadCashFlows_(true, options && options.serviceContext).find(function (candidate) { return cleanText_(candidate['流水ID']) === id; });
  if (!row) throwApiErrorV83_('NOT_FOUND', '找不到流水：' + id);
  return { item: cashFlowToApiV83_(row), meta: apiMetaV83_() };
}

function normalizeServiceResultV83_(result) {
  if (result && result.success) return result;
  var message = result && result.message ? result.message : '操作失敗';
  var code = result && result.code ? result.code : 'INTERNAL_ERROR';
  if (/找不到/.test(message)) code = 'NOT_FOUND';
  else if (/已存在/.test(message)) code = 'CONFLICT';
  else if (/超賣/.test(message)) code = 'OVERSELL';
  else if (/lock|鎖定|逾時/i.test(message)) code = 'LOCK_TIMEOUT';
  else if (/_FAILED$/.test(code)) code = 'VALIDATION_ERROR';
  return apiResult_(false, code, message, result && result.data ? result.data : {});
}

function serviceMutationApiV83_(action, params, payload, options) {
  params = params || {};
  payload = payload || {};
  var context = options && options.serviceContext;
  var result;
  if (action === 'createAsset') {
    ensureAllowedKeysV83_(payload, ['code', 'name', 'type', 'tradeCurrency', 'navCurrency', 'fundId', 'enabled', 'updatePrice', 'priceSource', 'note', 'fundCategory'], 'payload');
    result = createAsset(payload, context);
  } else if (action === 'updateAsset') {
    ensureAllowedKeysV83_(params, ['code'], 'params');
    ensureAllowedKeysV83_(payload, ['name', 'type', 'tradeCurrency', 'navCurrency', 'fundId', 'enabled', 'updatePrice', 'priceSource', 'note', 'fundCategory'], 'payload');
    result = updateAsset(params.code, payload, context);
  } else if (action === 'disableAsset') {
    ensureAllowedKeysV83_(params, ['code'], 'params');
    result = disableAsset(params.code, context);
  } else if (action === 'createTransaction') {
    ensureAllowedKeysV83_(payload, ['date', 'assetCode', 'type', 'bank', 'quantity', 'price', 'fee', 'actualAmount', 'splitBefore', 'splitAfter', 'note', 'source', 'manualAmount'], 'payload');
    result = createTransaction(payload, context);
  } else if (action === 'updateTransaction') {
    ensureAllowedKeysV83_(params, ['id'], 'params');
    ensureAllowedKeysV83_(payload, ['date', 'assetCode', 'type', 'bank', 'quantity', 'price', 'fee', 'actualAmount', 'splitBefore', 'splitAfter', 'note', 'manualAmount'], 'payload');
    result = updateTransaction(params.id, payload, context);
  } else if (action === 'deleteTransaction' || action === 'restoreTransaction') {
    ensureAllowedKeysV83_(params, ['id'], 'params');
    result = action === 'deleteTransaction' ? deleteTransaction(params.id, context) : restoreTransaction(params.id, context);
  } else if (action === 'createExternalCashFlow') {
    ensureAllowedKeysV83_(payload, ['date', 'type', 'amount', 'currency', 'fxRate', 'note'], 'payload');
    result = createExternalCashFlow(payload, context);
  } else if (action === 'updateExternalCashFlow') {
    ensureAllowedKeysV83_(params, ['id'], 'params');
    ensureAllowedKeysV83_(payload, ['date', 'type', 'amount', 'currency', 'fxRate', 'note'], 'payload');
    result = updateExternalCashFlow(params.id, payload, context);
  } else if (action === 'deleteExternalCashFlow' || action === 'restoreExternalCashFlow') {
    ensureAllowedKeysV83_(params, ['id'], 'params');
    result = action === 'deleteExternalCashFlow' ? deleteExternalCashFlow(params.id, context) : restoreExternalCashFlow(params.id, context);
  }
  return normalizeServiceResultV83_(result);
}

function performanceToApiV83_(row) {
  return {
    category: cleanText_(row['類別']),
    code: cleanText_(row['標的代號']),
    name: cleanText_(row['標的名稱']),
    status: cleanText_(row['狀態']),
    holdingQuantity: cleanNullableNumberV83_(row['持有數量']),
    marketValueTwd: cleanNullableNumberV83_(row['目前市值_TWD']),
    remainingCostTwd: cleanNullableNumberV83_(row['剩餘成本_TWD']),
    realizedPnlTwd: cleanNullableNumberV83_(row['已實現損益_TWD']),
    unrealizedPnlTwd: cleanNullableNumberV83_(row['未實現損益_TWD']),
    dividendsTwd: cleanNullableNumberV83_(row['累積股息_TWD']),
    totalPnlTwd: cleanNullableNumberV83_(row['累積總損益_TWD']),
    transactionReturn: cleanNullableNumberV83_(row['累積交易報酬率']),
    assetWeight: cleanNullableNumberV83_(row['目前資產占比']),
    pnlContribution: cleanNullableNumberV83_(row['損益貢獻度']),
    firstTradeDate: isoDateV83_(row['首次交易日']),
    lastTradeDate: isoDateV83_(row['最後交易日']),
    updatedAt: isoDateTimeV83_(row['更新時間']),
    averageCost: cleanNullableNumberV83_(row['平均成本']),
    currentPrice: cleanNullableNumberV83_(row['目前價格']),
    priceDate: isoDateV83_(row['價格日期']),
    xirr: cleanNullableNumberV83_(row['XIRR（年化）'] != null ? row['XIRR（年化）'] : row['XIRR'])
  };
}

function getDashboardSummaryApiV83_() {
  var sheet = getSheet_(V81.SHEETS.DASHBOARD);
  var values = sheet.getRange(1, 1, Math.min(21, sheet.getMaxRows()), Math.min(9, sheet.getMaxColumns())).getValues();
  var labels = {};
  values.forEach(function (row) {
    for (var index = 0; index < row.length - 1; index++) {
      var label = cleanText_(row[index]);
      if (label) labels[label] = row[index + 1];
    }
  });
  var composition = {};
  values.forEach(function (row) {
    var category = cleanText_(row[0]);
    if (['台股', '美股', '基金', '投資池現金'].indexOf(category) >= 0) composition[category] = cleanNullableNumberV83_(row[1]);
  });
  return {
    summary: {
      netAssetTwd: cleanNullableNumberV83_(labels['投資淨資產_TWD']),
      marketValueTwd: cleanNullableNumberV83_(labels['投資部位市值_TWD']),
      cashTwd: cleanNullableNumberV83_(labels['投資池現金_TWD']),
      externalNetContributionTwd: cleanNullableNumberV83_(labels['累積外部淨投入_TWD']),
      investmentResultTwd: cleanNullableNumberV83_(labels['累積投資成果_TWD']),
      totalPnlTwd: cleanNullableNumberV83_(labels['累積總損益_TWD']),
      totalReturn: cleanNullableNumberV83_(labels['整體投資報酬率']),
      xirr: cleanNullableNumberV83_(labels['投資組合 XIRR']),
      realizedPnlTwd: cleanNullableNumberV83_(labels['已實現損益_TWD']),
      unrealizedPnlTwd: cleanNullableNumberV83_(labels['未實現損益_TWD']),
      dividendsTwd: cleanNullableNumberV83_(labels['累積股息_TWD']),
      oldestPriceDate: isoDateV83_(labels['持倉價格最舊日期']),
      updatedAt: isoDateTimeV83_(labels['最後更新時間']),
      latestSnapshotDate: isoDateV83_(labels['最後趨勢快照']),
      warning: cleanText_(labels['資料警告']) || null,
      allocation: {
        twStockTwd: composition['台股'] == null ? null : composition['台股'],
        usStockTwd: composition['美股'] == null ? null : composition['美股'],
        fundTwd: composition['基金'] == null ? null : composition['基金'],
        cashTwd: composition['投資池現金'] == null ? null : composition['投資池現金']
      }
    },
    meta: apiMetaV83_()
  };
}

function getPerformanceListApiV83_(params) {
  params = ensureAllowedKeysV83_(params || {}, ['page', 'pageSize', 'query', 'category', 'status'], 'params');
  var status = cleanText_(params.status) || 'all';
  if (['held', 'closed', 'price_error', 'all'].indexOf(status) < 0) throwApiErrorV83_('VALIDATION_ERROR', 'status 只允許 held、closed、price_error 或 all');
  var baseHeaders = V81.HEADERS.PERFORMANCE_REQUIRED.filter(function (header) { return header !== 'XIRR（年化）'; });
  var performanceTable = readTable_(V81.SHEETS.PERFORMANCE, { requiredHeaders: baseHeaders, idHeader: '標的代號' });
  if (performanceTable.headerMap['XIRR（年化）'] == null && performanceTable.headerMap['XIRR'] == null) throw new Error('標的績效缺少 XIRR（年化）欄位');
  var rows = performanceTable.rows.filter(function (row) {
    var held = cleanText_(row['狀態']) !== '已出清';
    return containsV83_([row['標的代號'], row['標的名稱']], params.query) &&
      (!cleanText_(params.category) || cleanText_(row['類別']) === cleanText_(params.category)) &&
      (status === 'all' || (status === 'held' ? held : (status === 'closed' ? !held : (held && (cleanNullableNumberV83_(row['目前價格']) == null || !dateKey_(row['價格日期']))))));
  });
  rows.sort(function (a, b) {
    var categoryOrder = cleanText_(a['類別']).localeCompare(cleanText_(b['類別']));
    return categoryOrder || cleanText_(a['標的代號']).localeCompare(cleanText_(b['標的代號']));
  });
  return paginateV83_(rows.map(performanceToApiV83_), params);
}

function trendToApiV83_(row) {
  return {
    date: isoDateV83_(row['取樣日期']),
    bucket: cleanText_(row['取樣級距']),
    twStockTwd: cleanNullableNumberV83_(row['台股市值_TWD']),
    usStockTwd: cleanNullableNumberV83_(row['美股市值_TWD']),
    fundTwd: cleanNullableNumberV83_(row['基金市值_TWD']),
    marketValueTwd: cleanNullableNumberV83_(row['投資部位市值_TWD']),
    cashTwd: cleanNullableNumberV83_(row['投資池現金_TWD']),
    netAssetTwd: cleanNullableNumberV83_(row['投資淨資產_TWD']),
    externalNetContributionTwd: cleanNullableNumberV83_(row['累積外部淨投入_TWD']),
    investmentResultTwd: cleanNullableNumberV83_(row['累積投資成果_TWD']),
    estimatedAssetCount: cleanNullableNumberV83_(row['估算標的數']),
    hasEstimates: toBoolean_(row['是否含估算'], false),
    updatedAt: isoDateTimeV83_(row['更新時間']),
    status: cleanText_(row['資料狀態']),
    missingAssetCount: cleanNullableNumberV83_(row['缺漏標的數']),
    error: cleanText_(row['錯誤訊息']) || null
  };
}

function getTrendDataApiV83_(params) {
  params = ensureAllowedKeysV83_(params || {}, ['page', 'pageSize', 'dateFrom', 'dateTo', 'range'], 'params');
  var rows = readTable_(V81.SHEETS.TREND, { requiredHeaders: V81.HEADERS.TREND, idHeader: '取樣日期' }).rows;
  rows.sort(function (a, b) { return dateKey_(a['取樣日期']).localeCompare(dateKey_(b['取樣日期'])); });
  var maximumDate = rows.length ? dateKey_(rows[rows.length - 1]['取樣日期']) : '';
  var defaultFrom = maximumDate && cleanText_(params.range) !== 'all' && !dateKey_(params.dateFrom) ? rollingSixMonthCutoffV82_(maximumDate) : '';
  rows = rows.filter(function (row) {
    var date = dateKey_(row['取樣日期']);
    var from = dateKey_(params.dateFrom) || defaultFrom;
    var to = dateKey_(params.dateTo);
    return (!from || date >= from) && (!to || date <= to);
  });
  return paginateV83_(rows.map(trendToApiV83_), params);
}

function setJobStateV83_(job, status, fields, options) {
  var properties = propertyStoreV83_(options);
  var prefix = job === 'market' ? 'MARKET' : 'REBUILD';
  properties.setProperty(V83_PROPERTIES[prefix + '_STATUS'], status);
  fields = fields || {};
  if (Object.prototype.hasOwnProperty.call(fields, 'requestedAt')) properties.setProperty(V83_PROPERTIES[prefix + '_REQUESTED_AT'], fields.requestedAt || '');
  if (Object.prototype.hasOwnProperty.call(fields, 'startedAt')) properties.setProperty(V83_PROPERTIES[prefix + '_STARTED_AT'], fields.startedAt || '');
  if (Object.prototype.hasOwnProperty.call(fields, 'finishedAt')) properties.setProperty(V83_PROPERTIES[prefix + '_FINISHED_AT'], fields.finishedAt || '');
  if (Object.prototype.hasOwnProperty.call(fields, 'error')) properties.setProperty(V83_PROPERTIES[prefix + '_ERROR'], cleanText_(fields.error));
}

function requestJobApiV83_(job, options) {
  var properties = propertyStoreV83_(options);
  var statusKey = job === 'market' ? V83_PROPERTIES.MARKET_STATUS : V83_PROPERTIES.REBUILD_STATUS;
  var current = cleanText_(properties.getProperty(statusKey));
  if (current === 'pending' || current === 'running') return apiResult_(true, 'ALREADY_PENDING', '工作已在排隊或執行中', getJobStatusApiV83_(options));
  setJobStateV83_(job, 'pending', { requestedAt: nowSheet_(), startedAt: '', finishedAt: '', error: '' }, options);
  if (job === 'rebuild' && !(options && options.properties)) setSettingValues_({ NEEDS_RECALC: 'TRUE' });
  return apiResult_(true, 'OK', '工作已排入每日 07:30 排程', getJobStatusApiV83_(options));
}

function jobObjectV83_(job, options) {
  var properties = propertyStoreV83_(options);
  var prefix = job === 'market' ? 'MARKET' : 'REBUILD';
  return {
    status: cleanText_(properties.getProperty(V83_PROPERTIES[prefix + '_STATUS'])) || 'idle',
    requestedAt: isoDateTimeV83_(properties.getProperty(V83_PROPERTIES[prefix + '_REQUESTED_AT'])),
    startedAt: isoDateTimeV83_(properties.getProperty(V83_PROPERTIES[prefix + '_STARTED_AT'])),
    finishedAt: isoDateTimeV83_(properties.getProperty(V83_PROPERTIES[prefix + '_FINISHED_AT'])),
    error: cleanText_(properties.getProperty(V83_PROPERTIES[prefix + '_ERROR'])) || null
  };
}

function getJobStatusApiV83_(options) {
  var settings = options && options.settings ? options.settings : getSettingsMap_();
  var cursor = null;
  try { cursor = cleanText_(settings.TREND_REBUILD_CURSOR) ? JSON.parse(settings.TREND_REBUILD_CURSOR) : null; } catch (ignore) {}
  var result = {
    needsRecalc: toBoolean_(settings.NEEDS_RECALC, false),
    daily: {
      enabled: toBoolean_(settings.DAILY_JOB_ENABLED, false),
      time: cleanText_(settings.DAILY_JOB_TIME) || '07:30',
      lastRunAt: isoDateTimeV83_(settings.LAST_DAILY_JOB_AT),
      status: cleanText_(settings.LAST_DAILY_JOB_STATUS) || null
    },
    marketRefresh: jobObjectV83_('market', options),
    rebuild: jobObjectV83_('rebuild', options),
    trendCursor: cursor,
    lastTrendSnapshotDate: isoDateV83_(settings.LAST_TREND_SNAPSHOT_DATE)
  };
  if (!(options && options.properties) && typeof readRestoreOperationV84_ === 'function') {
    var properties = scriptPropertiesV84_();
    result.systemMode = cleanText_(properties.getProperty(V84_BACKUP.PROPERTIES.SYSTEM_MODE)) || V84_BACKUP.MODES.NORMAL;
    result.restore = restoreOperationToApiV84_(readRestoreOperationV84_());
  }
  return result;
}

function routeApiActionV83_(action, params, payload, options, requestId) {
  if (action.indexOf('backup.') === 0) return routeBackupApiActionV84_(action, params, payload, requestId);
  if (action.indexOf('restore.') === 0) return routeRestoreApiActionV84_(action, params, payload, requestId);
  if (action !== 'getJobStatus' && !(options && ((options.serviceContext && options.serviceContext.sheets) || options.properties))) assertNormalApiModeV84_();
  if (action === 'listAssets') return apiResult_(true, 'OK', '', listAssetsApiV83_(params, options));
  if (action === 'getAsset') return apiResult_(true, 'OK', '', getAssetApiV83_(params, options));
  if (action === 'listTransactions') return apiResult_(true, 'OK', '', listTransactionsApiV83_(params, options));
  if (action === 'getTransaction') return apiResult_(true, 'OK', '', getTransactionApiV83_(params, options));
  if (action === 'listExternalCashFlows') return apiResult_(true, 'OK', '', listCashFlowsApiV83_(params, options));
  if (action === 'getExternalCashFlow') return apiResult_(true, 'OK', '', getCashFlowApiV83_(params, options));
  if (['createAsset', 'updateAsset', 'disableAsset', 'createTransaction', 'updateTransaction', 'deleteTransaction', 'restoreTransaction', 'createExternalCashFlow', 'updateExternalCashFlow', 'deleteExternalCashFlow', 'restoreExternalCashFlow'].indexOf(action) >= 0) {
    if (!(options && ((options.serviceContext && options.serviceContext.sheets) || options.properties))) {
      assertPrimarySpreadsheet_();
      assertSystemWritableV84_();
    }
    return serviceMutationApiV83_(action, params, payload, options);
  }
  if (action === 'getDashboardSummary') return apiResult_(true, 'OK', '', getDashboardSummaryApiV83_());
  if (action === 'getPerformanceList') return apiResult_(true, 'OK', '', getPerformanceListApiV83_(params));
  if (action === 'getTrendData') return apiResult_(true, 'OK', '', getTrendDataApiV83_(params));
  if (action === 'requestRebuild') {
    if (!(options && ((options.serviceContext && options.serviceContext.sheets) || options.properties))) { assertPrimarySpreadsheet_(); assertSystemWritableV84_(); }
    return requestJobApiV83_('rebuild', options);
  }
  if (action === 'requestMarketRefresh') {
    if (!(options && ((options.serviceContext && options.serviceContext.sheets) || options.properties))) { assertPrimarySpreadsheet_(); assertSystemWritableV84_(); }
    return requestJobApiV83_('market', options);
  }
  if (action === 'getJobStatus') return apiResult_(true, 'OK', '', getJobStatusApiV83_(options));
  throwApiErrorV83_('ACTION_NOT_FOUND', '不支援的 action：' + action);
}

function handleApiRequestV83_(request, options) {
  var requestId = cleanText_(request && request.requestId);
  try {
    ensureAllowedKeysV83_(request || {}, ['action', 'sessionToken', 'elevatedToken', 'requestId', 'params', 'payload'], 'request');
    if (requestId.length > 128) throwApiErrorV83_('INVALID_REQUEST', 'requestId 長度不得超過 128');
    var action = cleanText_(request && request.action);
    if (!action) throwApiErrorV83_('INVALID_REQUEST', 'action 必填');
    if (isPublicAuthActionV85_(action)) {
      var publicResult = routeAuthApiActionV85_(action, request, options);
      return apiResultV83_(publicResult.success, publicResult.code, publicResult.message, publicResult.data, requestId);
    }
    authenticateApiRequestV85_(request, action, options);
    var scope = elevatedScopeForActionV85_(action);
    if (scope) requireElevatedSessionV85_(request.sessionToken, request.elevatedToken, scope, options);
    var result = isAuthActionV85_(action) ? routeAuthApiActionV85_(action, request, options) : routeApiActionV85_(action, request.params || {}, request.payload || {}, options, requestId);
    if (action === 'restore.finalize' && result.success) revokeElevatedSessionV85_(request.sessionToken, request.elevatedToken, options);
    var response = apiResultV83_(result.success, result.code, result.message, result.data, requestId);
    response.warnings = result.warnings || [];
    return response;
  } catch (error) {
    return apiResultV83_(false, error.apiCode || 'INTERNAL_ERROR', error.apiCode ? error.message : '伺服器處理失敗', error.details || {}, requestId);
  }
}

function doGet() {
  return jsonOutputV83_(apiResultV83_(true, 'OK', '資產記錄 API 正常', {
    service: 'asset-record-api',
    version: V81.VERSION,
    serverTime: new Date().toISOString()
  }, ''));
}

function doPost(e) {
  var requestId = '';
  try {
    var body = e && e.postData ? String(e.postData.contents || '') : '';
    var byteLength = Utilities.newBlob(body).getBytes().length;
    if (byteLength > V81.API_MAX_PAYLOAD_BYTES) throwApiErrorV83_('PAYLOAD_TOO_LARGE', '請求本文超過 100 KB');
    if (!body) throwApiErrorV83_('INVALID_JSON', '請求本文必須是 JSON');
    var request;
    try { request = JSON.parse(body); } catch (parseError) { throwApiErrorV83_('INVALID_JSON', 'JSON 格式錯誤'); }
    requestId = cleanText_(request && request.requestId);
    return jsonOutputV83_(handleApiRequestV83_(request, null));
  } catch (error) {
    return jsonOutputV83_(apiResultV83_(false, error.apiCode || 'INTERNAL_ERROR', error.apiCode ? error.message : '伺服器處理失敗', error.details || {}, requestId));
  }
}

function installV831() {
  if (/^8\.5\./.test(V81.VERSION) && typeof installV85 === 'function') return installV85();
  if (/^8\.4\./.test(V81.VERSION) && typeof installV84 === 'function') return installV84();
  try {
    var result = withDocumentLock_(function () {
      var schema = ensureV81Schema_();
      var sequences = initializeIdSequences_();
      var trigger = installDailyTriggerV82_();
      setSettingValues_({
        SYSTEM_VERSION: V81.VERSION,
        SCHEMA_VERSION: V81.SCHEMA_VERSION,
        TIMEZONE: V81.TIMEZONE,
        BASE_CURRENCY: V81.BASE_CURRENCY,
        DAILY_JOB_ENABLED: 'TRUE',
        DAILY_JOB_TIME: '07:30',
        LAST_VALIDATION_STATUS: 'PENDING'
      });
      onOpen();
      return apiResult_(true, 'OK', 'V8.3.1 安裝完成', {
        schema: schema,
        sequences: sequences,
        trigger: trigger,
        next: ['rebuildAllPerformance()', 'validateV831PerformanceAndApi()', 'validatePhase1()', 'validatePhase2()', 'validatePhase3()']
      });
    });
    return result;
  } catch (error) {
    return apiResult_(false, 'INSTALL_V831_FAILED', error.message, {});
  }
}

function installV83() {
  return installV831();
}

function legacyDependenciesV83_() {
  var spreadsheet = SpreadsheetApp.getActive();
  var target = '持倉明細';
  var dependencies = [];
  spreadsheet.getNamedRanges().forEach(function (namedRange) {
    if (namedRange.getRange().getSheet().getName() === target) dependencies.push('namedRange:' + namedRange.getName());
  });
  spreadsheet.getSheets().forEach(function (sheet) {
    if (sheet.getName() === target) return;
    var dataRange = sheet.getDataRange();
    dataRange.getFormulas().forEach(function (row, rowIndex) {
      row.forEach(function (formula, columnIndex) {
        if (cleanText_(formula).indexOf(target) >= 0) dependencies.push('formula:' + sheet.getName() + '!' + dataRange.getCell(rowIndex + 1, columnIndex + 1).getA1Notation());
      });
    });
    sheet.getCharts().forEach(function (chart, chartIndex) {
      chart.getRanges().forEach(function (range) {
        if (range.getSheet().getName() === target) dependencies.push('chart:' + sheet.getName() + '#' + (chartIndex + 1));
      });
    });
  });
  return dependencies;
}

function finalizeV83Cleanup() {
  try {
    assertMutationAllowedV84_();
    return withDocumentLock_(function () {
      var properties = PropertiesService.getScriptProperties();
      var backupId = cleanText_(properties.getProperty(V83_PROPERTIES.BACKUP_ID));
      if (!backupId) throw new Error('缺少 V83_PREDEPLOY_BACKUP_ID，拒絕清理');
      var settings = getSettingsMap_();
      if (cleanText_(settings.LAST_VALIDATION_STATUS) !== 'PASS') throw new Error('最近驗證狀態不是 PASS，拒絕清理');
      var dependencies = legacyDependenciesV83_();
      if (dependencies.length) throw new Error('持倉明細仍有依賴：' + dependencies.join('；'));
      var spreadsheet = SpreadsheetApp.getActive();
      var legacy = spreadsheet.getSheetByName('持倉明細');
      if (legacy) spreadsheet.deleteSheet(legacy);
      var transactions = getSheet_(V81.SHEETS.TRANSACTIONS);
      transactions.hideColumns(21, 4);
      if (transactions.getMaxRows() > 1) transactions.getRange(2, 21, transactions.getMaxRows() - 1, 4).clearDataValidations();
      setSettingValues_({ SYSTEM_VERSION: V81.VERSION, SCHEMA_VERSION: V81.SCHEMA_VERSION, LAST_VALIDATION_STATUS: 'PENDING' });
      return apiResult_(true, 'OK', 'V8.3 正式清理完成', { backupId: backupId, legacySheetDeleted: Boolean(legacy), hiddenCompatibilityColumns: ['匯入批次ID', '原始入出帳戶', '帳戶ID', '帳戶名稱'] });
    });
  } catch (error) {
    return apiResult_(false, 'FINALIZE_V83_FAILED', error.message, {});
  }
}

function memoryPropertiesV83_() {
  var values = {};
  return {
    getProperty: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setProperty: function (key, value) { values[key] = String(value); return this; },
    setProperties: function (input) { Object.keys(input || {}).forEach(function (key) { values[key] = String(input[key]); }); return this; },
    deleteProperty: function (key) { delete values[key]; return this; },
    getProperties: function () { return Object.assign({}, values); }
  };
}

function createValidationSheetsV83_() {
  var spreadsheet = SpreadsheetApp.getActive();
  var suffix = String(new Date().getTime());
  var names = {
    ASSETS: '__V83_TEST_ASSETS_' + suffix,
    TRANSACTIONS: '__V83_TEST_TX_' + suffix,
    CASH_FLOWS: '__V83_TEST_CASH_' + suffix
  };
  [
    { key: 'ASSETS', headers: V81.HEADERS.ASSETS },
    { key: 'TRANSACTIONS', headers: V81.HEADERS.TRANSACTIONS },
    { key: 'CASH_FLOWS', headers: V81.HEADERS.CASH_FLOWS }
  ].forEach(function (item) {
    var sheet = spreadsheet.insertSheet(names[item.key]);
    if (sheet.getMaxColumns() < item.headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), item.headers.length - sheet.getMaxColumns());
    sheet.getRange(1, 1, 1, item.headers.length).setValues([item.headers]);
    sheet.hideSheet();
  });
  return names;
}

function deleteValidationSheetsV83_(names) {
  var spreadsheet = SpreadsheetApp.getActive();
  Object.keys(names || {}).forEach(function (key) {
    var sheet = spreadsheet.getSheetByName(names[key]);
    if (sheet) spreadsheet.deleteSheet(sheet);
  });
}

function cleanupStaleValidationSheetsV83_() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getSheets().forEach(function (sheet) {
    if (/^__V83_TEST_(ASSETS|TX|CASH)_\d+$/.test(sheet.getName())) spreadsheet.deleteSheet(sheet);
  });
}

function sourceRowCountsV83_() {
  return {
    assets: loadAssets_().length,
    transactions: loadTransactions_(true).length,
    cashFlows: loadCashFlows_(true).length
  };
}

function validatePhase3InternalV83_(options) {
  options = options || {};
  cleanupStaleValidationSheetsV83_();
  var checks = [];
  var sourceHashBefore = sourceDataHashV82_();
  var rowCountsBefore = sourceRowCountsV83_();
  var names = {};
  var operations = {};
  var cleanupSucceeded = false;
  try {
    names = createValidationSheetsV83_();
    var serviceContext = { sheets: names, validationMode: true, skipDirty: true, dirtyEvents: [], sequences: { V81_TX_SEQUENCE: 0, V81_CFX_SEQUENCE: 0 } };
    var properties = memoryPropertiesV83_();
    properties.setProperty(V85_AUTH.PROPERTIES.MODE, V85_AUTH.MODE_PASSWORD_SESSION);
    properties.setProperty(V85_AUTH.PROPERTIES.SESSION_SECRET, randomServerSecretV85_());
    properties.setProperty(V85_AUTH.PROPERTIES.PASSWORD_VERSION, '1');
    properties.setProperty(V85_AUTH.PROPERTIES.SESSION_VERSION, '1');
    var validationSession = randomServerSecretV85_();
    var apiOptions = {
      serviceContext: serviceContext,
      properties: properties,
      skipLock: true,
      settings: { NEEDS_RECALC: 'FALSE', DAILY_JOB_ENABLED: 'TRUE', DAILY_JOB_TIME: '07:30' }
    };
    createSessionV85_(validationSession, false, apiOptions);
    function call(action, params, payload, sessionToken) {
      return handleApiRequestV83_({ action: action, sessionToken: sessionToken === undefined ? validationSession : sessionToken, requestId: 'test-' + action, params: params || {}, payload: payload || {} }, apiOptions);
    }
    operations.unauthorized = call('listAssets', {}, {}, '');
    operations.createAsset = call('createAsset', {}, { code: 'V83TEST', name: 'V8.3 測試標的', type: 'tw_stock', tradeCurrency: 'TWD', navCurrency: 'TWD', enabled: true, updatePrice: false, priceSource: 'manual' });
    operations.updateAsset = call('updateAsset', { code: 'V83TEST' }, { note: 'updated' });
    operations.getAsset = call('getAsset', { code: 'V83TEST' });
    operations.createTransaction = call('createTransaction', {}, { date: '2026-01-02', assetCode: 'V83TEST', type: 'buy', quantity: 10, price: 100, fee: 1, manualAmount: false });
    var transactionId = operations.createTransaction.success ? operations.createTransaction.data.transaction['交易ID'] : '';
    operations.updateTransaction = call('updateTransaction', { id: transactionId }, { price: 101, fee: 1 });
    operations.oversell = call('createTransaction', {}, { date: '2026-01-03', assetCode: 'V83TEST', type: 'sell', quantity: 99, price: 110, fee: 1 });
    operations.manualAmount = call('createTransaction', {}, { date: '2026-01-04', assetCode: 'V83TEST', type: 'adjustment', quantity: 0, actualAmount: -50, note: '人工調整測試', manualAmount: true });
    operations.deleteTransaction = call('deleteTransaction', { id: transactionId });
    operations.deleteTransactionAgain = call('deleteTransaction', { id: transactionId });
    operations.restoreTransaction = call('restoreTransaction', { id: transactionId });
    operations.transactionPage = call('listTransactions', { page: 1, pageSize: 1, deleted: 'all', query: 'V83TEST' });
    operations.createCash = call('createExternalCashFlow', {}, { date: '2026-01-01', type: '入金', amount: 1000, currency: 'TWD', note: 'V83 validation' });
    var cashId = operations.createCash.success ? operations.createCash.data.cashFlow['流水ID'] : '';
    operations.updateCash = call('updateExternalCashFlow', { id: cashId }, { amount: 1200 });
    operations.deleteCash = call('deleteExternalCashFlow', { id: cashId });
    operations.restoreCash = call('restoreExternalCashFlow', { id: cashId });
    operations.cashSearch = call('listExternalCashFlows', { query: 'validation', deleted: 'all' });
    operations.disableAsset = call('disableAsset', { code: 'V83TEST' });
    operations.disableAssetAgain = call('disableAsset', { code: 'V83TEST' });
    operations.requestRebuild = requestJobApiV83_('rebuild', apiOptions);
    operations.requestRebuildAgain = requestJobApiV83_('rebuild', apiOptions);

    validationCheck_(checks, '未授權 API 請求被拒絕', !operations.unauthorized.success && operations.unauthorized.code === 'AUTH_REQUIRED', operations.unauthorized);
    validationCheck_(checks, '標的 CRUD 與停用', operations.createAsset.success && operations.updateAsset.success && operations.getAsset.success && operations.disableAsset.success && operations.disableAssetAgain.code === 'ALREADY_DISABLED', operations);
    validationCheck_(checks, '交易 CRUD、軟刪除與還原', operations.createTransaction.success && operations.updateTransaction.success && operations.deleteTransaction.success && operations.deleteTransactionAgain.code === 'ALREADY_DELETED' && operations.restoreTransaction.success, operations);
    validationCheck_(checks, 'API 超賣阻擋', !operations.oversell.success && operations.oversell.code === 'OVERSELL', operations.oversell);
    validationCheck_(checks, '人工金額調整通過', operations.manualAmount.success, operations.manualAmount);
    validationCheck_(checks, '外部出入金 CRUD', operations.createCash.success && operations.updateCash.success && operations.deleteCash.success && operations.restoreCash.success, operations);
    validationCheck_(checks, '分頁、搜尋與篩選', operations.transactionPage.success && operations.transactionPage.data.pageSize === 1 && operations.transactionPage.data.total >= 1 && operations.cashSearch.success && operations.cashSearch.data.total === 1, { transactionPage: operations.transactionPage.data, cashSearch: operations.cashSearch.data });
    validationCheck_(checks, '測試寫入記錄待重算事件', serviceContext.dirtyEvents.length >= 8, serviceContext.dirtyEvents);
    validationCheck_(checks, '工作要求採排隊且冪等', operations.requestRebuild.success && operations.requestRebuild.data.rebuild.status === 'pending' && operations.requestRebuildAgain.code === 'ALREADY_PENDING', operations.requestRebuildAgain);
    var transactionIds = loadTransactions_(true, serviceContext).map(function (row) { return cleanText_(row['交易ID']); });
    validationCheck_(checks, '快速連續 ID 不重複', duplicatesV82_(transactionIds).length === 0, transactionIds);
  } catch (error) {
    validationCheck_(checks, '暫存 CRUD 驗證可執行', false, { message: error.message, stack: error.stack });
  } finally {
    try {
      deleteValidationSheetsV83_(names);
      cleanupSucceeded = Object.keys(names).every(function (key) { return !SpreadsheetApp.getActive().getSheetByName(names[key]); });
    } catch (cleanupError) {
      validationCheck_(checks, '暫存驗證表清理', false, cleanupError.message);
    }
  }
  validationCheck_(checks, '暫存驗證表已清理', cleanupSucceeded, names);
  var sourceHashAfter = sourceDataHashV82_();
  var rowCountsAfter = sourceRowCountsV83_();
  validationCheck_(checks, '正式三張原始表未受測試影響', sourceHashBefore === sourceHashAfter && JSON.stringify(rowCountsBefore) === JSON.stringify(rowCountsAfter), { before: { hash: sourceHashBefore, rows: rowCountsBefore }, after: { hash: sourceHashAfter, rows: rowCountsAfter } });
  var triggers = ScriptApp.getProjectTriggers();
  var daily = triggers.filter(function (trigger) { return trigger.getHandlerFunction() === 'scheduledDailyJob'; });
  validationCheck_(checks, '最終只有一個每日排程', triggers.length === 1 && daily.length === 1, { total: triggers.length, daily: daily.length });
    validationCheck_(checks, 'V8.3.1 以上版本與欄位版本', ['8.3.1', '8.4.0', '8.5.0'].indexOf(V81.VERSION) >= 0 && ['8.3.1', '8.4.0', '8.5.0'].indexOf(V81.SCHEMA_VERSION) >= 0, { version: V81.VERSION, schema: V81.SCHEMA_VERSION });
  if (options.requireCleanup) {
    var legacyExists = Boolean(SpreadsheetApp.getActive().getSheetByName('持倉明細'));
    var transactionsSheet = getSheet_(V81.SHEETS.TRANSACTIONS);
    var hiddenColumns = [21, 22, 23, 24].every(function (column) { return transactionsSheet.isColumnHiddenByUser(column); });
    validationCheck_(checks, '舊輸出已刪除且相容欄位隱藏', !legacyExists && hiddenColumns, { legacyExists: legacyExists, hiddenColumns: hiddenColumns });
  }
  var errors = checks.filter(function (check) { return !check.ok && check.severity !== 'warning'; });
  var warnings = checks.filter(function (check) { return !check.ok && check.severity === 'warning'; });
  return { success: errors.length === 0, checkCount: checks.length, errorCount: errors.length, warningCount: warnings.length, checks: checks };
}

function columnLetterV831_(column) {
  var value = Number(column);
  var letter = '';
  while (value > 0) {
    value--;
    letter = String.fromCharCode(65 + value % 26) + letter;
    value = Math.floor(value / 26);
  }
  return letter;
}

function validateV831PerformanceAndApi() {
  assertMutationAllowedV84_();
  try {
    var checks = [];
    var sheet = getSheet_(V81.SHEETS.PERFORMANCE);
    var lastColumn = Math.max(sheet.getLastColumn(), 1);
    var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(cleanText_);
    var map = headerMap_(headers);
    var oldCount = headers.filter(function (header) { return header === 'XIRR'; }).length;
    var newCount = headers.filter(function (header) { return header === 'XIRR（年化）'; }).length;
    validationCheck_(checks, 'XIRR（年化）恰好一欄', oldCount === 0 && newCount === 1, { oldCount: oldCount, newCount: newCount });
    validationCheck_(checks, 'V8.3.1 以上版本與欄位版本', ['8.3.1', '8.4.0', '8.5.0'].indexOf(V81.VERSION) >= 0 && ['8.3.1', '8.4.0', '8.5.0'].indexOf(V81.SCHEMA_VERSION) >= 0, { version: V81.VERSION, schema: V81.SCHEMA_VERSION });

    var formats = performanceNumberFormatsV831_();
    var columns = [];
    var invalidValueDetails = [];
    Object.keys(formats).forEach(function (header) {
      var columnIndex = map[header];
      if (columnIndex == null) {
        validationCheck_(checks, header + ' 欄位存在', false, 'missing');
        return;
      }
      var column = columnIndex + 1;
      var formatRange = sheet.getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1);
      var uniqueFormats = {};
      formatRange.getNumberFormats().forEach(function (row) { uniqueFormats[row[0]] = true; });
      var actualFormats = Object.keys(uniqueFormats);
      var valueRange = sheet.getLastRow() > 1 ? sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues() : [];
      var invalid = [];
      valueRange.forEach(function (row, index) {
        var value = row[0];
        if (value == null || value === '') return;
        if (header === '價格日期') {
          if (!dateKey_(value)) invalid.push(index + 2);
        } else if (isDateValueV831_(value) || typeof value !== 'number' || !isFinite(value)) {
          invalid.push(index + 2);
        }
      });
      columns.push({ header: header, column: columnLetterV831_(column), expectedFormat: formats[header], actualFormats: actualFormats, invalidRows: invalid });
      if (invalid.length) invalidValueDetails.push({ header: header, rows: invalid });
      validationCheck_(checks, header + ' 格式正確', actualFormats.length === 1 && actualFormats[0] === formats[header], { column: columnLetterV831_(column), formats: actualFormats });
      validationCheck_(checks, header + ' 型態正確', invalid.length === 0, invalid);
    });

    var injectedDate = new Date(2026, 6, 15, 12, 0, 0);
    var injectedRow = {
      '類別': '台股', '標的代號': 'V831DATE', '標的名稱': 'Date injection', '狀態': '持有中',
      '持有數量': injectedDate, '目前市值_TWD': injectedDate, '剩餘成本_TWD': injectedDate,
      '已實現損益_TWD': injectedDate, '未實現損益_TWD': injectedDate, '累積股息_TWD': injectedDate,
      '累積總損益_TWD': injectedDate, '累積交易報酬率': injectedDate, '目前資產占比': injectedDate,
      '損益貢獻度': injectedDate, '首次交易日': injectedDate, '最後交易日': injectedDate,
      '更新時間': injectedDate, '平均成本': injectedDate, '目前價格': injectedDate, '價格日期': injectedDate,
      'XIRR（年化）': injectedDate
    };
    var injectedApi = performanceToApiV83_(injectedRow);
    var numericKeys = ['holdingQuantity', 'marketValueTwd', 'remainingCostTwd', 'realizedPnlTwd', 'unrealizedPnlTwd', 'dividendsTwd', 'totalPnlTwd', 'transactionReturn', 'assetWeight', 'pnlContribution', 'averageCost', 'currentPrice', 'xirr'];
    validationCheck_(checks, 'Date 不可轉為績效數值', numericKeys.every(function (key) { return injectedApi[key] === null; }), injectedApi);
    validationCheck_(checks, 'Date 僅由日期正規化器輸出', injectedApi.priceDate === '2026-07-15' && /^2026-07-15T/.test(injectedApi.updatedAt || ''), { priceDate: injectedApi.priceDate, updatedAt: injectedApi.updatedAt });

    var table = readTable_(V81.SHEETS.PERFORMANCE, { requiredHeaders: V81.HEADERS.PERFORMANCE_REQUIRED, idHeader: '標的代號' });
    var apiRows = table.rows.map(performanceToApiV83_);
    var invalidApiRows = [];
    apiRows.forEach(function (row) {
      var invalidNumeric = numericKeys.filter(function (key) { return row[key] != null && (typeof row[key] !== 'number' || !isFinite(row[key])); });
      var invalidDate = ['firstTradeDate', 'lastTradeDate', 'priceDate'].filter(function (key) { return row[key] != null && !/^\d{4}-\d{2}-\d{2}$/.test(row[key]); });
      var xirrKeys = Object.keys(row).filter(function (key) { return /xirr/i.test(key); });
      if (invalidNumeric.length || invalidDate.length || xirrKeys.length !== 1 || xirrKeys[0] !== 'xirr') invalidApiRows.push({ code: row.code, invalidNumeric: invalidNumeric, invalidDate: invalidDate, xirrKeys: xirrKeys });
    });
    validationCheck_(checks, '正式績效 API 型態正確', invalidApiRows.length === 0, invalidApiRows);

    var errors = checks.filter(function (check) { return !check.ok && check.severity !== 'warning'; });
    var warnings = checks.filter(function (check) { return !check.ok && check.severity === 'warning'; });
    var result = apiResult_(errors.length === 0, errors.length === 0 ? 'OK' : 'VALIDATION_FAILED', errors.length === 0 ? 'V8.3.1 績效與 API 驗證通過' : 'V8.3.1 績效與 API 驗證失敗', {
      checkCount: checks.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      rowCount: apiRows.length,
      columns: columns,
      invalidValueDetails: invalidValueDetails,
      checks: checks
    });
    setSettingValues_({
      LAST_VALIDATION_AT: nowSheet_(),
      LAST_VALIDATION_STATUS: result.success ? 'PASS' : 'FAIL'
    });
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    setSettingValues_({ LAST_VALIDATION_AT: nowSheet_(), LAST_VALIDATION_STATUS: 'ERROR' });
    var failure = apiResult_(false, 'VALIDATION_V831_ERROR', error.message, { stack: error.stack || '' });
    console.log(JSON.stringify(failure));
    return failure;
  }
}

function runPhase3ValidationV83_(requireCleanup) {
  try {
    var phase3 = validatePhase3InternalV83_({ requireCleanup: Boolean(requireCleanup) });
    // Phase 1 and Phase 2 run through their own public validators during
    // deployment. Repeating both here exceeds Apps Script's six-minute limit
    // because Phase 2 includes historical idempotence rebuilds.
    var success = phase3.success;
    setSettingValues_({ LAST_VALIDATION_AT: nowSheet_(), LAST_VALIDATION_STATUS: success ? 'PASS' : 'FAIL' });
    return apiResult_(success, success ? 'OK' : 'VALIDATION_FAILED', success ? (requireCleanup ? 'V8.3 正式驗證通過' : 'V8.3 清理前驗證通過') : 'V8.3 驗證未通過', { phase3: phase3 });
  } catch (error) {
    setSettingValues_({ LAST_VALIDATION_AT: nowSheet_(), LAST_VALIDATION_STATUS: 'ERROR' });
    return apiResult_(false, 'VALIDATION_V83_ERROR', error.message, {});
  }
}
