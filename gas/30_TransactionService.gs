function generateTransactionId_(date, rows, context) {
  var sequence = nextIdSequence_('V81_TX_SEQUENCE', rows, '交易ID', context);
  return 'ITX-' + dateKey_(date).replace(/-/g, '') + '-' + String(sequence).padStart(6, '0');
}

function normalizeTransactionPayload_(payload, existing, asset) {
  existing = existing || {};
  var type = cleanText_(pickValue_(payload, 'type', '交易類型', existing['交易類型']));
  var manualAmount = toBoolean_(pickValue_(payload, 'manualAmount', '人工金額標誌', existing['人工金額標誌']), false);
  var normalized = {
    '交易ID': existing['交易ID'] || '',
    '日期': toDate_(pickValue_(payload, 'date', '日期', existing['日期'])),
    '標的代號': cleanText_(asset['標的代號']),
    '標的名稱': cleanText_(asset['標的名稱']),
    '標的類型': cleanText_(asset['標的類型']),
    '交易幣別': cleanText_(asset['交易幣別']),
    '淨值幣別': cleanText_(asset['淨值幣別']),
    '交易類型': type,
    '交易銀行': cleanText_(pickValue_(payload, 'bank', '交易銀行', existing['交易銀行'])),
    '數量': toNumber_(pickValue_(payload, 'quantity', '數量', existing['數量']), 0),
    '單價': toNumber_(pickValue_(payload, 'price', '單價', existing['單價']), 0),
    '手續費': toNumber_(pickValue_(payload, 'fee', '手續費', existing['手續費']), 0),
    '實際入出金額': toNumber_(pickValue_(payload, 'actualAmount', '實際入出金額', existing['實際入出金額']), 0),
    '分割前股數': toNumber_(pickValue_(payload, 'splitBefore', '分割前股數', existing['分割前股數']), 0),
    '分割後股數': toNumber_(pickValue_(payload, 'splitAfter', '分割後股數', existing['分割後股數']), 0),
    '備註': cleanText_(pickValue_(payload, 'note', '備註', existing['備註'])),
    '建立時間': existing['建立時間'] || nowSheet_(),
    '更新時間': nowSheet_(),
    '刪除時間': existing['刪除時間'] || '',
    '資料來源': cleanText_(existing['資料來源'] || pickValue_(payload, 'source', '資料來源', 'gas_entry')),
    '匯入批次ID': existing['匯入批次ID'] || '',
    '原始入出帳戶': cleanText_(pickValue_(payload, 'legacyAccount', '原始入出帳戶', existing['原始入出帳戶'])),
    '帳戶ID': cleanText_(pickValue_(payload, 'accountId', '帳戶ID', existing['帳戶ID'])),
    '帳戶名稱': cleanText_(pickValue_(payload, 'accountName', '帳戶名稱', existing['帳戶名稱'])),
    '人工金額標誌': manualAmount
  };
  if (!manualAmount && ['buy', 'sell', 'stock_dividend', 'split', 'reverse_split'].indexOf(type) >= 0) {
    normalized['實際入出金額'] = computeActualAmount_(normalized);
  }
  return normalized;
}

function validateTransaction_(transaction) {
  var errors = [];
  var type = cleanText_(transaction['交易類型']);
  var quantity = toNumber_(transaction['數量'], 0);
  var price = toNumber_(transaction['單價'], 0);
  var fee = toNumber_(transaction['手續費'], 0);
  var actual = toNumber_(transaction['實際入出金額'], 0);
  if (!transaction['日期']) errors.push('日期必填');
  if (!transaction['標的代號']) errors.push('標的代號必填');
  if (V81.TRANSACTION_TYPES.indexOf(type) < 0) errors.push('不支援的交易類型');
  if (fee < 0) errors.push('手續費不得為負數');
  if (type === 'buy' || type === 'sell') {
    if (!(quantity > 0)) errors.push('買賣數量必須大於 0');
    if (!(price > 0)) errors.push('買賣單價必須大於 0');
    if (!(actual > 0)) errors.push('買賣實際入出金額必須大於 0');
  }
  if (type === 'dividend') {
    if (!(actual > 0)) errors.push('股息實際入帳金額必須大於 0');
  }
  if (type === 'stock_dividend' && !(quantity > 0)) errors.push('股票股利數量必須大於 0');
  if (type === 'split' || type === 'reverse_split') {
    if (!(toNumber_(transaction['分割前股數'], 0) > 0) || !(toNumber_(transaction['分割後股數'], 0) > 0)) errors.push('分割前後股數必須大於 0');
  }
  if (type === 'adjustment') {
    if (Math.abs(quantity) > V81.EPSILON) errors.push('現金調整的數量必須為 0');
    if (Math.abs(actual) <= V81.EPSILON) errors.push('現金調整金額不可為 0');
    if (!toBoolean_(transaction['人工金額標誌'], false)) errors.push('現金調整必須啟用人工金額標誌');
    if (!cleanText_(transaction['備註'])) errors.push('現金調整備註必填');
  }
  if (errors.length) throw new Error(errors.join('；'));
}

function resolveAssetForTransaction_(payload, existing, assets) {
  var code = cleanText_(pickValue_(payload, 'assetCode', '標的代號', existing ? existing['標的代號'] : ''));
  if (!code) throw new Error('標的代號必填');
  var asset = assets.find(function (candidate) { return cleanText_(candidate['標的代號']) === code; });
  if (!asset) throw new Error('標的主檔不存在：' + code);
  if (!existing && !toBoolean_(asset['是否啟用'], false)) throw new Error('標的已停用：' + code);
  return asset;
}

function validateCandidateHistory_(allRows, candidate, replacedId) {
  var candidates = allRows.map(function (row) {
    return cleanText_(row['交易ID']) === cleanText_(replacedId) ? candidate : row;
  });
  if (!replacedId) candidates.push(candidate);
  var result = validateNoOversell_(candidates);
  if (!result.valid) {
    var first = result.errors[0];
    throw new Error('歷史時點超賣：' + first.assetCode + '／' + first.date + '／' + first.transactionId);
  }
}

function createTransaction(payload, context) {
  try {
    assertMutationAllowedV84_(context);
    return withDocumentLock_(function () {
      var table = readTable_(serviceSheetName_(context, 'TRANSACTIONS'), { requiredHeaders: V81.HEADERS.TRANSACTIONS, idHeader: '交易ID' });
      var assets = loadAssets_(context);
      var asset = resolveAssetForTransaction_(payload || {}, null, assets);
      var transaction = normalizeTransactionPayload_(payload || {}, null, asset);
      validateTransaction_(transaction);
      transaction['交易ID'] = generateTransactionId_(transaction['日期'], table.rows, context);
      validateCandidateHistory_(table.rows, transaction, null);
      appendObjectRow_(table, transaction);
      markServiceDirty_(context, transaction['日期'], false);
      return apiResult_(true, 'OK', '已新增投資交易', { transaction: transaction });
    });
  } catch (error) {
    return apiResult_(false, 'TRANSACTION_CREATE_FAILED', error.message, {});
  }
}

function updateTransaction(id, patch, context) {
  try {
    assertMutationAllowedV84_(context);
    return withDocumentLock_(function () {
      var table = readTable_(serviceSheetName_(context, 'TRANSACTIONS'), { requiredHeaders: V81.HEADERS.TRANSACTIONS, idHeader: '交易ID' });
      var existing = table.rows.find(function (row) { return cleanText_(row['交易ID']) === cleanText_(id); });
      if (!existing) throw new Error('找不到交易：' + id);
      var asset = resolveAssetForTransaction_(patch || {}, existing, loadAssets_(context));
      var merged = normalizeTransactionPayload_(patch || {}, existing, asset);
      merged['交易ID'] = cleanText_(id);
      validateTransaction_(merged);
      validateCandidateHistory_(table.rows, merged, id);
      updateObjectRow_(table, existing.__rowNumber, Object.assign({}, existing, merged));
      var dirtyDate = dateKey_(existing['日期']) < dateKey_(merged['日期']) ? existing['日期'] : merged['日期'];
      markServiceDirty_(context, dirtyDate, false);
      return apiResult_(true, 'OK', '已更新投資交易', { transaction: merged });
    });
  } catch (error) {
    return apiResult_(false, 'TRANSACTION_UPDATE_FAILED', error.message, {});
  }
}

function setTransactionDeleted_(id, deleted, context) {
  try {
    assertMutationAllowedV84_(context);
    return withDocumentLock_(function () {
      var table = readTable_(serviceSheetName_(context, 'TRANSACTIONS'), { requiredHeaders: V81.HEADERS.TRANSACTIONS, idHeader: '交易ID' });
      var existing = table.rows.find(function (row) { return cleanText_(row['交易ID']) === cleanText_(id); });
      if (!existing) throw new Error('找不到交易：' + id);
      var isDeleted = Boolean(cleanText_(existing['刪除時間']));
      if (deleted === isDeleted) return apiResult_(true, deleted ? 'ALREADY_DELETED' : 'ALREADY_ACTIVE', deleted ? '交易已刪除' : '交易已是有效狀態', { id: id });
      var candidate = Object.assign({}, existing, { '刪除時間': deleted ? nowSheet_() : '', '更新時間': nowSheet_() });
      if (!deleted) validateCandidateHistory_(table.rows, candidate, id);
      updateObjectRow_(table, existing.__rowNumber, candidate);
      markServiceDirty_(context, existing['日期'], false);
      return apiResult_(true, 'OK', deleted ? '已軟刪除投資交易' : '已還原投資交易', { id: id });
    });
  } catch (error) {
    return apiResult_(false, deleted ? 'TRANSACTION_DELETE_FAILED' : 'TRANSACTION_RESTORE_FAILED', error.message, {});
  }
}

function deleteTransaction(id, context) {
  return setTransactionDeleted_(id, true, context);
}

function restoreTransaction(id, context) {
  return setTransactionDeleted_(id, false, context);
}
