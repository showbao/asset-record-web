function tableV840_(context, sheetName, requiredHeaders, idHeader) {
  var sheet = context.spreadsheet.getSheetByName(sheetName);
  if (!sheet) throwGatewayV840_('SCHEMA_INVALID', '缺少分頁：' + sheetName);
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(cleanTextV840_);
  var headerMap = {};
  headers.forEach(function (header, index) { if (header && headerMap[header] == null) headerMap[header] = index; });
  var missing = (requiredHeaders || []).filter(function (header) { return headerMap[header] == null; });
  if (missing.length) throwGatewayV840_('SCHEMA_INVALID', sheetName + ' 缺少必要欄位', { missingHeaders: missing });
  var lastRow = Math.max(sheet.getLastRow(), 1);
  var values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues() : [];
  var rows = [];
  values.forEach(function (valuesRow, index) {
    if (idHeader && !cleanTextV840_(valuesRow[headerMap[idHeader]])) return;
    var object = { __rowNumber: index + 2 };
    headers.forEach(function (header, column) { if (header) object[header] = valuesRow[column]; });
    rows.push(object);
  });
  return { sheet: sheet, headers: headers, headerMap: headerMap, rows: rows };
}

function updateTableRowV840_(table, rowNumber, object) {
  var values = table.headers.map(function (header) { return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : ''; });
  table.sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
}

function appendTableRowV840_(table, object) {
  var values = table.headers.map(function (header) { return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : ''; });
  table.sheet.appendRow(values);
  return table.sheet.getLastRow();
}

function containsV840_(values, query) {
  query = cleanTextV840_(query).toLowerCase();
  if (!query) return true;
  return (values || []).some(function (value) { return cleanTextV840_(value).toLowerCase().indexOf(query) >= 0; });
}

function metaV840_(context) {
  var settings = readSettingsV840_(context.spreadsheet);
  return {
    needsRecalc: booleanV840_(settings.NEEDS_RECALC, false),
    lastMarketRefreshAt: isoDateTimeV840_(settings.LAST_MARKET_REFRESH_AT),
    lastRebuildAt: isoDateTimeV840_(settings.LAST_REBUILD_AT),
    lastValidationAt: isoDateTimeV840_(settings.LAST_VALIDATION_AT),
    lastValidationStatus: cleanTextV840_(settings.LAST_VALIDATION_STATUS) || null
  };
}

function assetApiV840_(row) {
  return {
    code: cleanTextV840_(row['標的代號']), name: cleanTextV840_(row['標的名稱']), type: cleanTextV840_(row['標的類型']),
    tradeCurrency: cleanTextV840_(row['交易幣別']), navCurrency: cleanTextV840_(row['淨值幣別']), fundId: cleanTextV840_(row['基金ID']) || null,
    enabled: booleanV840_(row['是否啟用'], false), updatePrice: booleanV840_(row['是否更新淨值'], false), priceSource: cleanTextV840_(row['價格來源']) || null,
    createdAt: isoDateTimeV840_(row['建立時間']), updatedAt: isoDateTimeV840_(row['更新時間']), note: cleanTextV840_(row['備註']) || null,
    fundCategory: cleanTextV840_(row['基金屬性']) || null
  };
}

function transactionApiV840_(row) {
  return {
    id: cleanTextV840_(row['交易ID']), date: isoDateV840_(row['日期']), assetCode: cleanTextV840_(row['標的代號']), assetName: cleanTextV840_(row['標的名稱']),
    assetType: cleanTextV840_(row['標的類型']), tradeCurrency: cleanTextV840_(row['交易幣別']), navCurrency: cleanTextV840_(row['淨值幣別']),
    type: cleanTextV840_(row['交易類型']), bank: cleanTextV840_(row['交易銀行']) || null, quantity: numberOrNullV840_(row['數量']), price: numberOrNullV840_(row['單價']),
    fee: numberOrNullV840_(row['手續費']), actualAmount: numberOrNullV840_(row['實際入出金額']), splitBefore: numberOrNullV840_(row['分割前股數']), splitAfter: numberOrNullV840_(row['分割後股數']),
    note: cleanTextV840_(row['備註']) || null, createdAt: isoDateTimeV840_(row['建立時間']), updatedAt: isoDateTimeV840_(row['更新時間']),
    deletedAt: isoDateTimeV840_(row['刪除時間']), source: cleanTextV840_(row['資料來源']) || null, manualAmount: booleanV840_(row['人工金額標誌'], false)
  };
}

function cashFlowApiV840_(row) {
  return {
    id: cleanTextV840_(row['流水ID']), date: isoDateV840_(row['日期']), type: cleanTextV840_(row['類型']), amount: numberOrNullV840_(row['金額']),
    currency: cleanTextV840_(row['幣別']), fxRate: numberOrNullV840_(row['換算匯率']), amountTwd: numberOrNullV840_(row['金額_TWD']), note: cleanTextV840_(row['備註']) || null,
    createdAt: isoDateTimeV840_(row['建立時間']), updatedAt: isoDateTimeV840_(row['更新時間']), deletedAt: isoDateTimeV840_(row['刪除時間'])
  };
}

function performanceApiV840_(row) {
  return {
    category: cleanTextV840_(row['類別']), code: cleanTextV840_(row['標的代號']), name: cleanTextV840_(row['標的名稱']), status: cleanTextV840_(row['狀態']),
    holdingQuantity: numberOrNullV840_(row['持有數量']), marketValueTwd: numberOrNullV840_(row['目前市值_TWD']), remainingCostTwd: numberOrNullV840_(row['剩餘成本_TWD']),
    realizedPnlTwd: numberOrNullV840_(row['已實現損益_TWD']), unrealizedPnlTwd: numberOrNullV840_(row['未實現損益_TWD']), dividendsTwd: numberOrNullV840_(row['累積股息_TWD']),
    totalPnlTwd: numberOrNullV840_(row['累積總損益_TWD']), transactionReturn: numberOrNullV840_(row['累積交易報酬率']), assetWeight: numberOrNullV840_(row['目前資產占比']),
    pnlContribution: numberOrNullV840_(row['損益貢獻度']), firstTradeDate: isoDateV840_(row['首次交易日']), lastTradeDate: isoDateV840_(row['最後交易日']),
    updatedAt: isoDateTimeV840_(row['更新時間']), averageCost: numberOrNullV840_(row['平均成本']), currentPrice: numberOrNullV840_(row['目前價格']),
    priceDate: isoDateV840_(row['價格日期']), xirr: numberOrNullV840_(row['XIRR（年化）'])
  };
}

function trendApiV840_(row) {
  return {
    date: isoDateV840_(row['取樣日期']), bucket: cleanTextV840_(row['取樣級距']), twStockTwd: numberOrNullV840_(row['台股市值_TWD']),
    usStockTwd: numberOrNullV840_(row['美股市值_TWD']), fundTwd: numberOrNullV840_(row['基金市值_TWD']), marketValueTwd: numberOrNullV840_(row['投資部位市值_TWD']),
    cashTwd: numberOrNullV840_(row['投資池現金_TWD']), netAssetTwd: numberOrNullV840_(row['投資淨資產_TWD']), externalNetContributionTwd: numberOrNullV840_(row['累積外部淨投入_TWD']),
    investmentResultTwd: numberOrNullV840_(row['累積投資成果_TWD']), estimatedAssetCount: numberOrNullV840_(row['估算標的數']), hasEstimates: booleanV840_(row['是否含估算'], false),
    updatedAt: isoDateTimeV840_(row['更新時間']), status: cleanTextV840_(row['資料狀態']), missingAssetCount: numberOrNullV840_(row['缺漏標的數']), error: cleanTextV840_(row['錯誤訊息']) || null
  };
}

function listAssetsV840_(context, params) {
  allowedKeysV840_(params, ['page', 'pageSize', 'query', 'type', 'enabled'], 'params');
  var enabled = params.enabled == null || params.enabled === '' || cleanTextV840_(params.enabled) === 'all' ? null : booleanV840_(params.enabled, false);
  var rows = tableV840_(context, V840_GATEWAY.SHEETS.ASSETS, V840_GATEWAY.HEADERS.ASSETS, '標的代號').rows.filter(function (row) {
    return containsV840_([row['標的代號'], row['標的名稱'], row['備註']], params.query) && (!cleanTextV840_(params.type) || cleanTextV840_(row['標的類型']) === cleanTextV840_(params.type)) &&
      (enabled == null || booleanV840_(row['是否啟用'], false) === enabled);
  });
  rows.sort(function (a, b) { return cleanTextV840_(a['標的代號']).localeCompare(cleanTextV840_(b['標的代號'])); });
  var result = paginateV840_(rows.map(assetApiV840_), params); result.meta = metaV840_(context); return result;
}

function listTransactionsV840_(context, params) {
  allowedKeysV840_(params, ['page', 'pageSize', 'query', 'assetCode', 'type', 'dateFrom', 'dateTo', 'deleted'], 'params');
  var deleted = cleanTextV840_(params.deleted) || 'active';
  if (['active', 'deleted', 'all'].indexOf(deleted) < 0) throwGatewayV840_('VALIDATION_ERROR', 'deleted 只允許 active、deleted 或 all');
  var rows = tableV840_(context, V840_GATEWAY.SHEETS.TRANSACTIONS, V840_GATEWAY.HEADERS.TRANSACTIONS, '交易ID').rows.filter(function (row) {
    var isDeleted = Boolean(cleanTextV840_(row['刪除時間'])); var date = isoDateV840_(row['日期']) || '';
    return containsV840_([row['交易ID'], row['標的代號'], row['標的名稱'], row['交易銀行'], row['備註']], params.query) &&
      (!cleanTextV840_(params.assetCode) || cleanTextV840_(row['標的代號']) === cleanTextV840_(params.assetCode)) && (!cleanTextV840_(params.type) || cleanTextV840_(row['交易類型']) === cleanTextV840_(params.type)) &&
      (!isoDateV840_(params.dateFrom) || date >= isoDateV840_(params.dateFrom)) && (!isoDateV840_(params.dateTo) || date <= isoDateV840_(params.dateTo)) &&
      (deleted === 'all' || (deleted === 'deleted' ? isDeleted : !isDeleted));
  });
  rows.sort(function (a, b) { return (isoDateV840_(b['日期']) || '').localeCompare(isoDateV840_(a['日期']) || '') || cleanTextV840_(b['交易ID']).localeCompare(cleanTextV840_(a['交易ID'])); });
  var result = paginateV840_(rows.map(transactionApiV840_), params); result.meta = metaV840_(context); return result;
}

function listCashFlowsV840_(context, params) {
  allowedKeysV840_(params, ['page', 'pageSize', 'query', 'type', 'currency', 'dateFrom', 'dateTo', 'deleted'], 'params');
  var deleted = cleanTextV840_(params.deleted) || 'active';
  if (['active', 'deleted', 'all'].indexOf(deleted) < 0) throwGatewayV840_('VALIDATION_ERROR', 'deleted 只允許 active、deleted 或 all');
  var rows = tableV840_(context, V840_GATEWAY.SHEETS.CASH_FLOWS, V840_GATEWAY.HEADERS.CASH_FLOWS, '流水ID').rows.filter(function (row) {
    if (cleanTextV840_(row['流水ID']).indexOf('只記錄真正') === 0) return false;
    var isDeleted = Boolean(cleanTextV840_(row['刪除時間'])); var date = isoDateV840_(row['日期']) || '';
    return containsV840_([row['流水ID'], row['備註']], params.query) && (!cleanTextV840_(params.type) || cleanTextV840_(row['類型']) === cleanTextV840_(params.type)) &&
      (!cleanTextV840_(params.currency) || cleanTextV840_(row['幣別']) === cleanTextV840_(params.currency)) && (!isoDateV840_(params.dateFrom) || date >= isoDateV840_(params.dateFrom)) &&
      (!isoDateV840_(params.dateTo) || date <= isoDateV840_(params.dateTo)) && (deleted === 'all' || (deleted === 'deleted' ? isDeleted : !isDeleted));
  });
  rows.sort(function (a, b) { return (isoDateV840_(b['日期']) || '').localeCompare(isoDateV840_(a['日期']) || '') || cleanTextV840_(b['流水ID']).localeCompare(cleanTextV840_(a['流水ID'])); });
  var result = paginateV840_(rows.map(cashFlowApiV840_), params); result.meta = metaV840_(context); return result;
}

function getPerformanceV840_(context, params) {
  allowedKeysV840_(params, ['page', 'pageSize', 'query', 'category', 'status'], 'params');
  var status = cleanTextV840_(params.status) || 'all';
  if (['held', 'closed', 'all'].indexOf(status) < 0) throwGatewayV840_('VALIDATION_ERROR', 'status 只允許 held、closed 或 all');
  var rows = tableV840_(context, V840_GATEWAY.SHEETS.PERFORMANCE, V840_GATEWAY.HEADERS.PERFORMANCE, '標的代號').rows.filter(function (row) {
    var held = cleanTextV840_(row['狀態']) !== '已出清';
    return containsV840_([row['標的代號'], row['標的名稱']], params.query) && (!cleanTextV840_(params.category) || cleanTextV840_(row['類別']) === cleanTextV840_(params.category)) &&
      (status === 'all' || (status === 'held' ? held : !held));
  });
  rows.sort(function (a, b) { return cleanTextV840_(a['類別']).localeCompare(cleanTextV840_(b['類別'])) || cleanTextV840_(a['標的代號']).localeCompare(cleanTextV840_(b['標的代號'])); });
  var result = paginateV840_(rows.map(performanceApiV840_), params); result.meta = metaV840_(context); return result;
}

function getTrendV840_(context, params) {
  allowedKeysV840_(params, ['page', 'pageSize', 'dateFrom', 'dateTo', 'range'], 'params');
  var rows = tableV840_(context, V840_GATEWAY.SHEETS.TREND, V840_GATEWAY.HEADERS.TREND, '取樣日期').rows;
  rows.sort(function (a, b) { return (isoDateV840_(a['取樣日期']) || '').localeCompare(isoDateV840_(b['取樣日期']) || ''); });
  if (cleanTextV840_(params.range) !== 'all' && !params.dateFrom && rows.length) {
    var end = dateValueV840_(rows[rows.length - 1]['取樣日期']);
    if (end) { end.setMonth(end.getMonth() - 6); params = Object.assign({}, params, { dateFrom: isoDateV840_(end) }); }
  }
  rows = rows.filter(function (row) { var date = isoDateV840_(row['取樣日期']) || ''; return (!isoDateV840_(params.dateFrom) || date >= isoDateV840_(params.dateFrom)) && (!isoDateV840_(params.dateTo) || date <= isoDateV840_(params.dateTo)); });
  var result = paginateV840_(rows.map(trendApiV840_), params); result.meta = metaV840_(context); return result;
}

function dashboardSummaryV840_(context) {
  var sheet = context.spreadsheet.getSheetByName(V840_GATEWAY.SHEETS.DASHBOARD);
  if (!sheet) throwGatewayV840_('SCHEMA_INVALID', '缺少分頁：' + V840_GATEWAY.SHEETS.DASHBOARD);
  var values = sheet.getRange(1, 1, Math.min(30, sheet.getMaxRows()), Math.min(10, sheet.getMaxColumns())).getValues();
  var labels = {}, composition = {};
  values.forEach(function (row) {
    for (var index = 0; index < row.length - 1; index++) { var label = cleanTextV840_(row[index]); if (label) labels[label] = row[index + 1]; }
    var category = cleanTextV840_(row[0]); if (['台股', '美股', '基金', '投資池現金'].indexOf(category) >= 0) composition[category] = numberOrNullV840_(row[1]);
  });
  return { summary: {
    netAssetTwd: numberOrNullV840_(labels['投資淨資產_TWD']), marketValueTwd: numberOrNullV840_(labels['投資部位市值_TWD']), cashTwd: numberOrNullV840_(labels['投資池現金_TWD']),
    externalNetContributionTwd: numberOrNullV840_(labels['累積外部淨投入_TWD']), investmentResultTwd: numberOrNullV840_(labels['累積投資成果_TWD']), totalPnlTwd: numberOrNullV840_(labels['累積總損益_TWD']),
    totalReturn: numberOrNullV840_(labels['整體投資報酬率']), xirr: numberOrNullV840_(labels['投資組合 XIRR']), realizedPnlTwd: numberOrNullV840_(labels['已實現損益_TWD']),
    unrealizedPnlTwd: numberOrNullV840_(labels['未實現損益_TWD']), dividendsTwd: numberOrNullV840_(labels['累積股息_TWD']), oldestPriceDate: isoDateV840_(labels['持倉價格最舊日期']),
    updatedAt: isoDateTimeV840_(labels['最後更新時間']), latestSnapshotDate: isoDateV840_(labels['最後趨勢快照']), warning: cleanTextV840_(labels['資料警告']) || null,
    allocation: { twStockTwd: composition['台股'] == null ? null : composition['台股'], usStockTwd: composition['美股'] == null ? null : composition['美股'], fundTwd: composition['基金'] == null ? null : composition['基金'], cashTwd: composition['投資池現金'] == null ? null : composition['投資池現金'] }
  }, meta: metaV840_(context) };
}
