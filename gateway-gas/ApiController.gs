function routeGatewayV840_(request, auth, context) {
  var action = cleanTextV840_(request.action); var params = request.params || {}; var payload = request.payload || {};
  if (action === 'verifySpreadsheet') return { spreadsheet: safeSpreadsheetInfoV840_(context), isolation: validateGatewayIsolationV840_(auth, context) };
  if (action === 'getSystemStatus') return getSystemStatusV840_(context);
  if (action === 'initializeNewSystem') return initializeNewSystemV840_(context);
  if (action === 'validateSetup') return validateSetupV840_(context);
  if (action === 'listAssets') return listAssetsV840_(context, params);
  if (action === 'getAsset') {
    allowedKeysV840_(params, ['code'], 'params'); var asset = listAssetsV840_(context, { query: params.code, page: 1, pageSize: 100 }).items.find(function (item) { return item.code === cleanTextV840_(params.code); });
    if (!asset) throwGatewayV840_('NOT_FOUND', '找不到標的：' + cleanTextV840_(params.code)); return { item: asset, meta: metaV840_(context) };
  }
  if (action === 'listTransactions') return listTransactionsV840_(context, params);
  if (action === 'getTransaction') {
    allowedKeysV840_(params, ['id'], 'params'); var tx = tableV840_(context, V840_GATEWAY.SHEETS.TRANSACTIONS, V840_GATEWAY.HEADERS.TRANSACTIONS, '交易ID').rows.find(function (row) { return cleanTextV840_(row['交易ID']) === cleanTextV840_(params.id); });
    if (!tx) throwGatewayV840_('NOT_FOUND', '找不到交易：' + cleanTextV840_(params.id)); return { item: transactionApiV840_(tx), meta: metaV840_(context) };
  }
  if (action === 'listExternalCashFlows') return listCashFlowsV840_(context, params);
  if (action === 'getExternalCashFlow') {
    allowedKeysV840_(params, ['id'], 'params'); var flow = tableV840_(context, V840_GATEWAY.SHEETS.CASH_FLOWS, V840_GATEWAY.HEADERS.CASH_FLOWS, '流水ID').rows.find(function (row) { return cleanTextV840_(row['流水ID']) === cleanTextV840_(params.id); });
    if (!flow) throwGatewayV840_('NOT_FOUND', '找不到流水：' + cleanTextV840_(params.id)); return { item: cashFlowApiV840_(flow), meta: metaV840_(context) };
  }
  if (action === 'getDashboardSummary') return dashboardSummaryV840_(context);
  if (action === 'getPerformanceList') return getPerformanceV840_(context, params);
  if (action === 'getTrendData') return getTrendV840_(context, params);
  if (action === 'getJobStatus') return jobStatusV840_(context);
  if (action === 'requestRebuild') return requestJobV840_(context, 'rebuild');
  if (action === 'requestMarketRefresh') return requestJobV840_(context, 'market');
  if (['createAsset', 'updateAsset', 'disableAsset', 'createTransaction', 'updateTransaction', 'deleteTransaction', 'restoreTransaction', 'createExternalCashFlow', 'updateExternalCashFlow', 'deleteExternalCashFlow', 'restoreExternalCashFlow'].indexOf(action) >= 0) {
    return mutateV840_(context, action, params, payload);
  }
  if (['validateTransactionImport', 'commitTransactionImport', 'validateCashflowImport', 'commitCashflowImport'].indexOf(action) >= 0) throwGatewayV840_('FEATURE_NOT_AVAILABLE', '匯入精靈將於 v8.4.1 提供');
  if (['createBackup', 'listBackups', 'restoreBackup'].indexOf(action) >= 0) throwGatewayV840_('FEATURE_NOT_AVAILABLE', '備份與還原中心將於 v8.4.2 提供');
  if (['checkLatestVersion', 'prepareUpgrade', 'applyUpgrade', 'getUpgradeStatus', 'rollbackUpgrade'].indexOf(action) >= 0) throwGatewayV840_('FEATURE_NOT_AVAILABLE', '版本升級中心將於 v8.5.0 提供');
  throwGatewayV840_('ACTION_NOT_FOUND', '不支援的 action：' + action);
}

function handleGatewayRequestV840_(request, options) {
  request = request || {}; options = options || {};
  var requestId = cleanTextV840_(request.requestId);
  try {
    allowedKeysV840_(request, ['action', 'idToken', 'spreadsheetId', 'clientVersion', 'requestId', 'params', 'payload'], 'request');
    if (!requestId || requestId.length > 128) throwGatewayV840_('INVALID_REQUEST', 'requestId 必填且不得超過 128 字元');
    if (!cleanTextV840_(request.action)) throwGatewayV840_('INVALID_REQUEST', 'action 必填');
    if (cleanTextV840_(request.clientVersion) && cleanTextV840_(request.clientVersion) !== V840_GATEWAY.VERSION) throwGatewayV840_('CLIENT_VERSION_MISMATCH', '網頁版本與 Gateway 不相容', { clientVersion: request.clientVersion, gatewayVersion: V840_GATEWAY.VERSION });
    var auth = options.auth || authContextV840_(request, options.authOptions);
    var allowTemplate = ['getSystemStatus', 'initializeNewSystem', 'validateSetup'].indexOf(cleanTextV840_(request.action)) >= 0;
    var context = options.context || guardSpreadsheetV840_(request.spreadsheetId, auth, { allowTemplate: allowTemplate, allowBackup: false });
    var data = routeGatewayV840_(request, auth, context);
    return gatewayResponseV840_(true, null, '', data, requestId, []);
  } catch (error) {
    var code = error.gatewayCode || 'INTERNAL_ERROR';
    var message = error.gatewayCode ? error.message : '伺服器處理失敗';
    return gatewayResponseV840_(false, code, message, error.details || {}, requestId, []);
  }
}

function doGet() {
  return jsonOutputV840_(gatewayResponseV840_(true, null, '', {
    service: 'asset-record-gateway', version: V840_GATEWAY.VERSION, executeAs: 'USER_ACCESSING', serverTime: new Date().toISOString()
  }, '', []));
}

function doPost(e) {
  var requestId = '';
  try {
    var body = e && e.postData ? String(e.postData.contents || '') : '';
    if (Utilities.newBlob(body).getBytes().length > V840_GATEWAY.MAX_PAYLOAD_BYTES) throwGatewayV840_('PAYLOAD_TOO_LARGE', '請求本文超過 100 KB');
    if (!body) throwGatewayV840_('INVALID_JSON', '請求本文必須是 JSON');
    var request; try { request = JSON.parse(body); } catch (error) { throwGatewayV840_('INVALID_JSON', 'JSON 格式錯誤'); }
    requestId = cleanTextV840_(request && request.requestId);
    return jsonOutputV840_(handleGatewayRequestV840_(request, {}));
  } catch (error) {
    return jsonOutputV840_(gatewayResponseV840_(false, error.gatewayCode || 'INTERNAL_ERROR', error.gatewayCode ? error.message : '伺服器處理失敗', error.details || {}, requestId, []));
  }
}
