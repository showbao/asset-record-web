function withUserLockV840_(callback) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(V840_GATEWAY.LOCK_TIMEOUT_MS)) throwGatewayV840_('LOCK_TIMEOUT', '資料正在由另一個請求更新，請稍後再試');
  try { return callback(); } finally { lock.releaseLock(); }
}

function requireFiniteInputV840_(value, label, options) {
  options = options || {};
  var number = inputNumberV840_(value, NaN);
  if (!isFinite(number)) throwGatewayV840_('VALIDATION_ERROR', label + '必須是有限數值');
  if (options.positive && !(number > 0)) throwGatewayV840_('VALIDATION_ERROR', label + '必須大於 0');
  if (options.nonnegative && number < 0) throwGatewayV840_('VALIDATION_ERROR', label + '不得小於 0');
  return number;
}

function markDirtyV840_(context, date, allHistory) {
  var settings = readSettingsV840_(context.spreadsheet);
  var candidate = allHistory ? '2025-01-01' : (isoDateV840_(date) || '2025-01-01');
  var existing = isoDateV840_(settings.TREND_DIRTY_FROM_DATE);
  writeSettingsV840_(context.spreadsheet, { NEEDS_RECALC: 'TRUE', TREND_DIRTY_FROM_DATE: existing && existing < candidate ? existing : candidate });
}

function normalizeAssetV840_(payload, existing) {
  payload = payload || {}; existing = existing || {};
  var type = cleanTextV840_(Object.prototype.hasOwnProperty.call(payload, 'type') ? payload.type : existing['標的類型']);
  var code = cleanTextV840_(Object.prototype.hasOwnProperty.call(payload, 'code') ? payload.code : existing['標的代號']);
  if (type === 'us_stock') code = code.toUpperCase();
  var asset = {
    '標的代號': code, '標的名稱': cleanTextV840_(Object.prototype.hasOwnProperty.call(payload, 'name') ? payload.name : existing['標的名稱']), '標的類型': type,
    '交易幣別': cleanTextV840_(Object.prototype.hasOwnProperty.call(payload, 'tradeCurrency') ? payload.tradeCurrency : existing['交易幣別']).toUpperCase(),
    '淨值幣別': cleanTextV840_(Object.prototype.hasOwnProperty.call(payload, 'navCurrency') ? payload.navCurrency : existing['淨值幣別']).toUpperCase(),
    '基金ID': cleanTextV840_(Object.prototype.hasOwnProperty.call(payload, 'fundId') ? payload.fundId : existing['基金ID']),
    '是否啟用': Object.prototype.hasOwnProperty.call(payload, 'enabled') ? booleanV840_(payload.enabled, true) : (existing['是否啟用'] == null ? true : booleanV840_(existing['是否啟用'], true)),
    '是否更新淨值': Object.prototype.hasOwnProperty.call(payload, 'updatePrice') ? booleanV840_(payload.updatePrice, true) : (existing['是否更新淨值'] == null ? true : booleanV840_(existing['是否更新淨值'], true)),
    '價格來源': cleanTextV840_(Object.prototype.hasOwnProperty.call(payload, 'priceSource') ? payload.priceSource : (existing['價格來源'] || 'auto')).toLowerCase(),
    '建立時間': existing['建立時間'] || nowV840_(), '更新時間': nowV840_(), '備註': cleanTextV840_(Object.prototype.hasOwnProperty.call(payload, 'note') ? payload.note : existing['備註']),
    '基金屬性': cleanTextV840_(Object.prototype.hasOwnProperty.call(payload, 'fundCategory') ? payload.fundCategory : existing['基金屬性'])
  };
  if (!asset['標的代號'] || !asset['標的名稱']) throwGatewayV840_('VALIDATION_ERROR', '標的代號與名稱必填');
  if (V840_GATEWAY.ASSET_TYPES.indexOf(asset['標的類型']) < 0) throwGatewayV840_('VALIDATION_ERROR', '不支援的標的類型');
  if (V840_GATEWAY.CURRENCIES.indexOf(asset['交易幣別']) < 0 || V840_GATEWAY.CURRENCIES.indexOf(asset['淨值幣別']) < 0) throwGatewayV840_('VALIDATION_ERROR', '不支援的幣別');
  if (asset['標的類型'] === 'fund' && !asset['基金ID']) throwGatewayV840_('VALIDATION_ERROR', '基金必須提供基金ID');
  if (asset['標的類型'] === 'tw_stock' && !/^[0-9A-Z]+$/.test(asset['標的代號'])) throwGatewayV840_('VALIDATION_ERROR', '台股代號格式錯誤');
  return asset;
}

function nextRowIdV840_(prefix, date, rows, header) {
  var maximum = (rows || []).reduce(function (max, row) { var match = cleanTextV840_(row[header]).match(/(\d{6})$/); return match ? Math.max(max, Number(match[1])) : max; }, 0);
  return prefix + '-' + cleanTextV840_(date).replace(/-/g, '') + '-' + String(maximum + 1).padStart(6, '0');
}

function assetForTransactionV840_(context, code, creating) {
  var row = tableV840_(context, V840_GATEWAY.SHEETS.ASSETS, V840_GATEWAY.HEADERS.ASSETS, '標的代號').rows.find(function (candidate) { return cleanTextV840_(candidate['標的代號']) === cleanTextV840_(code); });
  if (!row) throwGatewayV840_('VALIDATION_ERROR', '標的主檔不存在：' + cleanTextV840_(code));
  if (creating && !booleanV840_(row['是否啟用'], false)) throwGatewayV840_('VALIDATION_ERROR', '標的已停用：' + cleanTextV840_(code));
  return row;
}

function computedActualAmountV840_(transaction) {
  var type = cleanTextV840_(transaction['交易類型']); var quantity = inputNumberV840_(transaction['數量'], 0); var price = inputNumberV840_(transaction['單價'], 0); var fee = inputNumberV840_(transaction['手續費'], 0);
  if (type === 'buy') return roundV840_(quantity * price + fee, 8);
  if (type === 'sell') return roundV840_(quantity * price - fee, 8);
  if (['stock_dividend', 'split', 'reverse_split'].indexOf(type) >= 0) return 0;
  return roundV840_(inputNumberV840_(transaction['實際入出金額'], 0), 8);
}

function normalizeTransactionV840_(payload, existing, asset) {
  payload = payload || {}; existing = existing || {};
  function pick(key, header, fallback) { return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : (Object.prototype.hasOwnProperty.call(existing, header) ? existing[header] : fallback); }
  var type = cleanTextV840_(pick('type', '交易類型', ''));
  var manual = booleanV840_(pick('manualAmount', '人工金額標誌', false), false);
  var date = isoDateV840_(pick('date', '日期', ''));
  if (!date) throwGatewayV840_('VALIDATION_ERROR', '日期必填');
  var transaction = {
    '交易ID': cleanTextV840_(existing['交易ID']), '日期': dateValueV840_(date), '標的代號': cleanTextV840_(asset['標的代號']), '標的名稱': cleanTextV840_(asset['標的名稱']),
    '標的類型': cleanTextV840_(asset['標的類型']), '交易幣別': cleanTextV840_(asset['交易幣別']), '淨值幣別': cleanTextV840_(asset['淨值幣別']), '交易類型': type,
    '交易銀行': cleanTextV840_(pick('bank', '交易銀行', '')), '數量': inputNumberV840_(pick('quantity', '數量', 0), 0), '單價': inputNumberV840_(pick('price', '單價', 0), 0),
    '手續費': inputNumberV840_(pick('fee', '手續費', 0), 0), '實際入出金額': inputNumberV840_(pick('actualAmount', '實際入出金額', 0), 0),
    '分割前股數': inputNumberV840_(pick('splitBefore', '分割前股數', 0), 0), '分割後股數': inputNumberV840_(pick('splitAfter', '分割後股數', 0), 0),
    '備註': cleanTextV840_(pick('note', '備註', '')), '建立時間': existing['建立時間'] || nowV840_(), '更新時間': nowV840_(), '刪除時間': existing['刪除時間'] || '',
    '資料來源': cleanTextV840_(existing['資料來源'] || pick('source', '資料來源', 'github_gateway')), '匯入批次ID': existing['匯入批次ID'] || '', '原始入出帳戶': existing['原始入出帳戶'] || '',
    '帳戶ID': existing['帳戶ID'] || '', '帳戶名稱': existing['帳戶名稱'] || '', '人工金額標誌': manual
  };
  if (!manual && ['buy', 'sell', 'stock_dividend', 'split', 'reverse_split'].indexOf(type) >= 0) transaction['實際入出金額'] = computedActualAmountV840_(transaction);
  validateTransactionV840_(transaction);
  return transaction;
}

function validateTransactionV840_(transaction) {
  var type = cleanTextV840_(transaction['交易類型']); var quantity = inputNumberV840_(transaction['數量'], 0); var price = inputNumberV840_(transaction['單價'], 0);
  var fee = inputNumberV840_(transaction['手續費'], 0); var actual = inputNumberV840_(transaction['實際入出金額'], 0);
  if (V840_GATEWAY.TRANSACTION_TYPES.indexOf(type) < 0) throwGatewayV840_('VALIDATION_ERROR', '不支援的交易類型');
  if (fee < 0) throwGatewayV840_('VALIDATION_ERROR', '手續費不得為負數');
  if (type === 'buy' || type === 'sell') { if (!(quantity > 0) || !(price > 0) || !(actual > 0)) throwGatewayV840_('VALIDATION_ERROR', '買賣數量、單價及實際入出金額必須大於 0'); }
  if (type === 'dividend' && !(actual > 0)) throwGatewayV840_('VALIDATION_ERROR', '股息實際入帳金額必須大於 0');
  if (type === 'stock_dividend' && !(quantity > 0)) throwGatewayV840_('VALIDATION_ERROR', '股票股利數量必須大於 0');
  if (type === 'split' || type === 'reverse_split') { if (!(inputNumberV840_(transaction['分割前股數'], 0) > 0) || !(inputNumberV840_(transaction['分割後股數'], 0) > 0)) throwGatewayV840_('VALIDATION_ERROR', '分割前後股數必須大於 0'); }
  if (type === 'adjustment' && (Math.abs(quantity) > V840_GATEWAY.EPSILON || Math.abs(actual) <= V840_GATEWAY.EPSILON || !booleanV840_(transaction['人工金額標誌'], false) || !cleanTextV840_(transaction['備註']))) {
    throwGatewayV840_('VALIDATION_ERROR', '現金調整必須為零數量、非零人工金額且備註必填');
  }
}

function sortTransactionsV840_(rows) {
  return rows.slice().sort(function (a, b) { return (isoDateV840_(a['日期']) || '').localeCompare(isoDateV840_(b['日期']) || '') || cleanTextV840_(a['建立時間']).localeCompare(cleanTextV840_(b['建立時間'])) || cleanTextV840_(a['交易ID']).localeCompare(cleanTextV840_(b['交易ID'])); });
}

function validateNoOversellV840_(rows) {
  var quantities = {};
  sortTransactionsV840_(rows).forEach(function (row) {
    if (cleanTextV840_(row['刪除時間'])) return;
    var code = cleanTextV840_(row['標的代號']); var type = cleanTextV840_(row['交易類型']); var quantity = inputNumberV840_(row['數量'], 0);
    if (quantities[code] == null) quantities[code] = 0;
    if (type === 'buy' || type === 'stock_dividend') quantities[code] += quantity;
    if (type === 'sell') quantities[code] -= quantity;
    if (type === 'split' || type === 'reverse_split') { var before = inputNumberV840_(row['分割前股數'], 0); var after = inputNumberV840_(row['分割後股數'], 0); if (before > 0 && after > 0) quantities[code] *= after / before; }
    if (quantities[code] < -V840_GATEWAY.EPSILON) throwGatewayV840_('OVERSELL', '歷史時點超賣：' + code + '／' + (isoDateV840_(row['日期']) || '') + '／' + cleanTextV840_(row['交易ID']));
  });
}

function normalizeCashFlowV840_(payload, existing) {
  payload = payload || {}; existing = existing || {};
  function pick(key, header, fallback) { return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : (Object.prototype.hasOwnProperty.call(existing, header) ? existing[header] : fallback); }
  var date = isoDateV840_(pick('date', '日期', '')); var type = cleanTextV840_(pick('type', '類型', '')); var amount = requireFiniteInputV840_(pick('amount', '金額', NaN), '金額', { positive: true });
  var currency = cleanTextV840_(pick('currency', '幣別', '')).toUpperCase(); var fxRate = currency === 'TWD' ? 1 : requireFiniteInputV840_(pick('fxRate', '換算匯率', NaN), '換算匯率', { positive: true });
  if (!date) throwGatewayV840_('VALIDATION_ERROR', '日期必填');
  if (V840_GATEWAY.CASH_FLOW_TYPES.indexOf(type) < 0) throwGatewayV840_('VALIDATION_ERROR', '類型只允許入金或出金');
  if (V840_GATEWAY.CURRENCIES.indexOf(currency) < 0) throwGatewayV840_('VALIDATION_ERROR', '不支援的幣別');
  return { '流水ID': cleanTextV840_(existing['流水ID']), '日期': dateValueV840_(date), '類型': type, '金額': amount, '幣別': currency, '換算匯率': fxRate, '金額_TWD': roundV840_(amount * fxRate, 8),
    '備註': cleanTextV840_(pick('note', '備註', '')), '建立時間': existing['建立時間'] || nowV840_(), '更新時間': nowV840_(), '刪除時間': existing['刪除時間'] || '' };
}

function mutateV840_(context, action, params, payload) {
  params = params || {}; payload = payload || {};
  return withUserLockV840_(function () {
    if (action === 'createAsset' || action === 'updateAsset' || action === 'disableAsset') {
      var assetTable = tableV840_(context, V840_GATEWAY.SHEETS.ASSETS, V840_GATEWAY.HEADERS.ASSETS, '標的代號');
      if (action === 'createAsset') {
        allowedKeysV840_(payload, ['code', 'name', 'type', 'tradeCurrency', 'navCurrency', 'fundId', 'enabled', 'updatePrice', 'priceSource', 'note', 'fundCategory'], 'payload');
        var createdAsset = normalizeAssetV840_(payload, {}); if (assetTable.rows.some(function (row) { return cleanTextV840_(row['標的代號']) === createdAsset['標的代號']; })) throwGatewayV840_('CONFLICT', '標的代號已存在：' + createdAsset['標的代號']);
        appendTableRowV840_(assetTable, createdAsset); markDirtyV840_(context, null, true); return { item: assetApiV840_(createdAsset), meta: metaV840_(context) };
      }
      allowedKeysV840_(params, ['code'], 'params'); var existingAsset = assetTable.rows.find(function (row) { return cleanTextV840_(row['標的代號']) === cleanTextV840_(params.code); });
      if (!existingAsset) throwGatewayV840_('NOT_FOUND', '找不到標的：' + cleanTextV840_(params.code));
      if (action === 'disableAsset') payload = { enabled: false }; else allowedKeysV840_(payload, ['name', 'type', 'tradeCurrency', 'navCurrency', 'fundId', 'enabled', 'updatePrice', 'priceSource', 'note', 'fundCategory'], 'payload');
      var updatedAsset = normalizeAssetV840_(payload, existingAsset); updatedAsset['標的代號'] = cleanTextV840_(params.code); updateTableRowV840_(assetTable, existingAsset.__rowNumber, Object.assign({}, existingAsset, updatedAsset));
      markDirtyV840_(context, null, true); return { item: assetApiV840_(updatedAsset), meta: metaV840_(context) };
    }

    if (['createTransaction', 'updateTransaction', 'deleteTransaction', 'restoreTransaction'].indexOf(action) >= 0) {
      var txTable = tableV840_(context, V840_GATEWAY.SHEETS.TRANSACTIONS, V840_GATEWAY.HEADERS.TRANSACTIONS, '交易ID');
      if (action === 'createTransaction') {
        allowedKeysV840_(payload, ['date', 'assetCode', 'type', 'bank', 'quantity', 'price', 'fee', 'actualAmount', 'splitBefore', 'splitAfter', 'note', 'source', 'manualAmount'], 'payload');
        var asset = assetForTransactionV840_(context, payload.assetCode, true); var transaction = normalizeTransactionV840_(payload, {}, asset);
        transaction['交易ID'] = nextRowIdV840_('ITX', isoDateV840_(transaction['日期']), txTable.rows, '交易ID'); validateNoOversellV840_(txTable.rows.concat([transaction])); appendTableRowV840_(txTable, transaction);
        markDirtyV840_(context, transaction['日期'], false); return { item: transactionApiV840_(transaction), meta: metaV840_(context) };
      }
      allowedKeysV840_(params, ['id'], 'params'); var existingTx = txTable.rows.find(function (row) { return cleanTextV840_(row['交易ID']) === cleanTextV840_(params.id); });
      if (!existingTx) throwGatewayV840_('NOT_FOUND', '找不到交易：' + cleanTextV840_(params.id));
      var candidate;
      if (action === 'updateTransaction') {
        allowedKeysV840_(payload, ['date', 'assetCode', 'type', 'bank', 'quantity', 'price', 'fee', 'actualAmount', 'splitBefore', 'splitAfter', 'note', 'manualAmount'], 'payload');
        var txAsset = assetForTransactionV840_(context, payload.assetCode || existingTx['標的代號'], false); candidate = normalizeTransactionV840_(payload, existingTx, txAsset); candidate['交易ID'] = cleanTextV840_(params.id);
      } else {
        candidate = Object.assign({}, existingTx, { '刪除時間': action === 'deleteTransaction' ? nowV840_() : '', '更新時間': nowV840_() });
      }
      var history = txTable.rows.map(function (row) { return cleanTextV840_(row['交易ID']) === cleanTextV840_(params.id) ? candidate : row; }); if (action !== 'deleteTransaction') validateNoOversellV840_(history);
      updateTableRowV840_(txTable, existingTx.__rowNumber, candidate); markDirtyV840_(context, isoDateV840_(existingTx['日期']) < isoDateV840_(candidate['日期']) ? existingTx['日期'] : candidate['日期'], false);
      return { item: transactionApiV840_(candidate), meta: metaV840_(context) };
    }

    if (['createExternalCashFlow', 'updateExternalCashFlow', 'deleteExternalCashFlow', 'restoreExternalCashFlow'].indexOf(action) >= 0) {
      var flowTable = tableV840_(context, V840_GATEWAY.SHEETS.CASH_FLOWS, V840_GATEWAY.HEADERS.CASH_FLOWS, '流水ID');
      var actualRows = flowTable.rows.filter(function (row) { return cleanTextV840_(row['流水ID']).indexOf('只記錄真正') !== 0; });
      if (action === 'createExternalCashFlow') {
        allowedKeysV840_(payload, ['date', 'type', 'amount', 'currency', 'fxRate', 'note'], 'payload'); var flow = normalizeCashFlowV840_(payload, {});
        flow['流水ID'] = nextRowIdV840_('CFX', isoDateV840_(flow['日期']), actualRows, '流水ID'); appendTableRowV840_(flowTable, flow); markDirtyV840_(context, flow['日期'], false);
        return { item: cashFlowApiV840_(flow), meta: metaV840_(context) };
      }
      allowedKeysV840_(params, ['id'], 'params'); var existingFlow = actualRows.find(function (row) { return cleanTextV840_(row['流水ID']) === cleanTextV840_(params.id); });
      if (!existingFlow) throwGatewayV840_('NOT_FOUND', '找不到流水：' + cleanTextV840_(params.id));
      var changedFlow;
      if (action === 'updateExternalCashFlow') { allowedKeysV840_(payload, ['date', 'type', 'amount', 'currency', 'fxRate', 'note'], 'payload'); changedFlow = normalizeCashFlowV840_(payload, existingFlow); changedFlow['流水ID'] = cleanTextV840_(params.id); }
      else changedFlow = Object.assign({}, existingFlow, { '刪除時間': action === 'deleteExternalCashFlow' ? nowV840_() : '', '更新時間': nowV840_() });
      updateTableRowV840_(flowTable, existingFlow.__rowNumber, changedFlow); markDirtyV840_(context, isoDateV840_(existingFlow['日期']) < isoDateV840_(changedFlow['日期']) ? existingFlow['日期'] : changedFlow['日期'], false);
      return { item: cashFlowApiV840_(changedFlow), meta: metaV840_(context) };
    }
    throwGatewayV840_('ACTION_NOT_FOUND', '不支援的資料異動 action：' + action);
  });
}
