function apiResult_(success, code, message, data) {
  return {
    success: Boolean(success),
    code: String(code || (success ? 'OK' : 'ERROR')),
    message: String(message || ''),
    data: data == null ? {} : data,
    version: V81.VERSION,
    timestamp: new Date().toISOString()
  };
}

function withDocumentLock_(callback) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(V81.LOCK_TIMEOUT_MS);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function serviceSheetName_(context, key) {
  if (context && context.sheets && cleanText_(context.sheets[key])) return cleanText_(context.sheets[key]);
  return V81.SHEETS[key];
}

function markServiceDirty_(context, date, allDates) {
  if (context && context.skipDirty) {
    context.dirtyEvents = context.dirtyEvents || [];
    context.dirtyEvents.push({ date: dateKey_(date) || '', allDates: Boolean(allDates) });
    return;
  }
  if (allDates) markAllTrendDirty_();
  else markTrendDirtyFrom_(date);
}

function nowSheet_() {
  return Utilities.formatDate(new Date(), V81.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function dateKey_(value) {
  var date = toDate_(value);
  if (!date) return '';
  if (typeof Utilities !== 'undefined') return Utilities.formatDate(date, V81.TIMEZONE, 'yyyy-MM-dd');
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function dateKeyInTimezone_(value, timezone) {
  var date = toDate_(value);
  if (!date) return '';
  if (typeof Utilities !== 'undefined') return Utilities.formatDate(date, cleanText_(timezone) || V81.TIMEZONE, 'yyyy-MM-dd');
  return dateKey_(date);
}

function isDateOnOrBefore_(value, cutoff) {
  var key = dateKey_(value);
  var cutoffKey = dateKey_(cutoff);
  return Boolean(key && cutoffKey && key <= cutoffKey);
}

function toDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return new Date(value.getTime());
  if (typeof value === 'number' && isFinite(value)) {
    var excelEpoch = Date.UTC(1899, 11, 30);
    var serialDate = new Date(excelEpoch + value * 86400000);
    return isNaN(serialDate.getTime()) ? null : serialDate;
  }
  if (value == null || value === '') return null;
  var normalized = String(value).trim().replace(/\//g, '-');
  var parsed = new Date(normalized.length === 10 ? normalized + 'T00:00:00+08:00' : normalized);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber_(value, fallback) {
  if (value == null || value === '') return fallback == null ? 0 : fallback;
  if (typeof value === 'number') return isFinite(value) ? value : (fallback == null ? 0 : fallback);
  var text = String(value).trim().replace(/,/g, '').replace(/^\((.*)\)$/, '-$1').replace(/%$/, '');
  var number = Number(text);
  if (!isFinite(number)) return fallback == null ? 0 : fallback;
  return /%$/.test(String(value).trim()) ? number / 100 : number;
}

function toBoolean_(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value == null || value === '') return Boolean(fallback);
  var text = String(value).trim().toUpperCase();
  if (['TRUE', '1', 'YES', 'Y'].indexOf(text) >= 0) return true;
  if (['FALSE', '0', 'NO', 'N'].indexOf(text) >= 0) return false;
  return Boolean(fallback);
}

function cleanText_(value) {
  return value == null ? '' : String(value).trim();
}

function finitePositive_(value) {
  var number = toNumber_(value, NaN);
  return isFinite(number) && number > 0 ? number : null;
}

function round_(value, digits) {
  if (!isFinite(value)) return null;
  var scale = Math.pow(10, digits == null ? 8 : digits);
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function getSheet_(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('缺少分頁：' + sheetName);
  return sheet;
}

function headerMap_(headers) {
  var map = {};
  headers.forEach(function (header, index) {
    var key = cleanText_(header);
    if (key && map[key] == null) map[key] = index;
  });
  return map;
}

function readTable_(sheetName, options) {
  options = options || {};
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  var headers = values.length ? values[0].map(cleanText_) : [];
  var map = headerMap_(headers);
  if (options.requiredHeaders) {
    var missing = options.requiredHeaders.filter(function (header) { return map[header] == null; });
    if (missing.length) throw new Error(sheetName + ' 缺少欄位：' + missing.join('、'));
  }
  var rows = [];
  for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
    var source = values[rowIndex];
    var object = { __rowNumber: rowIndex + 1 };
    var hasValue = false;
    headers.forEach(function (header, columnIndex) {
      if (!header) return;
      object[header] = source[columnIndex];
      if (source[columnIndex] !== '' && source[columnIndex] != null) hasValue = true;
    });
    if (!hasValue) continue;
    if (options.idHeader && !cleanText_(object[options.idHeader])) continue;
    rows.push(object);
  }
  return { sheet: sheet, headers: headers, headerMap: map, values: values, rows: rows };
}

function ensureHeaders_(sheetName, requiredHeaders) {
  var sheet = getSheet_(sheetName);
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(cleanText_);
  var map = headerMap_(current);
  var missing = requiredHeaders.filter(function (header) { return map[header] == null; });
  if (!missing.length) return { added: [], headers: current };
  sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  return { added: missing, headers: current.concat(missing) };
}

function migratePerformanceXirrHeaderV831_() {
  var sheet = getSheet_(V81.SHEETS.PERFORMANCE);
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(cleanText_);
  var oldColumns = [];
  var newColumns = [];
  headers.forEach(function (header, index) {
    if (header === 'XIRR') oldColumns.push(index + 1);
    if (header === 'XIRR（年化）') newColumns.push(index + 1);
  });
  if (oldColumns.length > 1 || newColumns.length > 1 || (oldColumns.length && newColumns.length)) {
    throw new Error('標的績效 XIRR 欄位衝突：舊欄 ' + oldColumns.length + '、新欄 ' + newColumns.length);
  }
  if (oldColumns.length === 1) {
    sheet.getRange(1, oldColumns[0], 1, 1).setValues([['XIRR（年化）']]);
    return { sheet: V81.SHEETS.PERFORMANCE, renamed: true, column: oldColumns[0] };
  }
  return { sheet: V81.SHEETS.PERFORMANCE, renamed: false, column: newColumns[0] || null };
}

function performanceNumberFormatsV831_() {
  return {
    '平均成本': '#,##0.########',
    '目前價格': '#,##0.########',
    '價格日期': 'yyyy-mm-dd',
    '資產占比': '0.00%',
    '整體投資報酬率': '0.00%',
    'XIRR（年化）': '0.00%'
  };
}

function applyNumberFormatsByHeaderV831_(sheetName, formatMap) {
  var sheet = getSheet_(sheetName);
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(cleanText_);
  var map = headerMap_(headers);
  var missing = Object.keys(formatMap).filter(function (header) { return map[header] == null; });
  if (missing.length) throw new Error(sheetName + ' 缺少格式欄位：' + missing.join('、'));
  var rowCount = Math.max(sheet.getMaxRows() - 1, 1);
  var applied = [];
  Object.keys(formatMap).forEach(function (header) {
    var column = map[header] + 1;
    sheet.getRange(2, column, rowCount, 1).setNumberFormat(formatMap[header]);
    applied.push({ header: header, column: column, format: formatMap[header] });
  });
  return { sheet: sheetName, applied: applied };
}

function preparePerformanceSheetV831_() {
  var migration = migratePerformanceXirrHeaderV831_();
  ensureHeaders_(V81.SHEETS.PERFORMANCE, V81.HEADERS.PERFORMANCE_REQUIRED);
  var formats = applyNumberFormatsByHeaderV831_(V81.SHEETS.PERFORMANCE, performanceNumberFormatsV831_());
  return { migration: migration, formats: formats };
}

function objectToRow_(headers, object) {
  return headers.map(function (header) {
    var value = object[header];
    return value == null ? '' : value;
  });
}

function appendObjectRow_(table, object) {
  var rowNumber = Math.max(table.sheet.getLastRow() + 1, 2);
  table.sheet.getRange(rowNumber, 1, 1, table.headers.length).setValues([objectToRow_(table.headers, object)]);
  return rowNumber;
}

function updateObjectRow_(table, rowNumber, object) {
  table.sheet.getRange(rowNumber, 1, 1, table.headers.length).setValues([objectToRow_(table.headers, object)]);
}

function writeOutputRows_(sheetName, requiredHeaders, objects) {
  if (sheetName === V81.SHEETS.PERFORMANCE) migratePerformanceXirrHeaderV831_();
  ensureHeaders_(sheetName, requiredHeaders);
  var table = readTable_(sheetName);
  if (sheetName === V81.SHEETS.PERFORMANCE) applyNumberFormatsByHeaderV831_(sheetName, performanceNumberFormatsV831_());
  var lastRow = table.sheet.getLastRow();
  if (lastRow > 1) table.sheet.getRange(2, 1, lastRow - 1, table.headers.length).clearContent();
  if (objects.length) {
    var rows = objects.map(function (object) { return objectToRow_(table.headers, object); });
    ['計算鍵', '標的代號', '交易ID', '流水ID', '幣別組合'].forEach(function (header) {
      var columnIndex = table.headerMap[header];
      if (columnIndex != null) table.sheet.getRange(2, columnIndex + 1, rows.length, 1).setNumberFormat('@');
    });
    table.sheet.getRange(2, 1, rows.length, table.headers.length).setValues(rows);
  }
  return { sheet: sheetName, rows: objects.length, columns: table.headers.length };
}

function sortTransactions_(transactions) {
  return transactions.slice().sort(function (left, right) {
    var leftDate = toDate_(left['日期']);
    var rightDate = toDate_(right['日期']);
    var dateDiff = (leftDate ? leftDate.getTime() : 0) - (rightDate ? rightDate.getTime() : 0);
    if (dateDiff) return dateDiff;
    var leftCreated = toDate_(left['建立時間']);
    var rightCreated = toDate_(right['建立時間']);
    var createdDiff = (leftCreated ? leftCreated.getTime() : 0) - (rightCreated ? rightCreated.getTime() : 0);
    if (createdDiff) return createdDiff;
    return cleanText_(left['交易ID']).localeCompare(cleanText_(right['交易ID']));
  });
}

function computeActualAmount_(transaction) {
  var type = cleanText_(transaction['交易類型'] || transaction.type);
  var quantity = toNumber_(transaction['數量'] != null ? transaction['數量'] : transaction.quantity, 0);
  var price = toNumber_(transaction['單價'] != null ? transaction['單價'] : transaction.price, 0);
  var fee = toNumber_(transaction['手續費'] != null ? transaction['手續費'] : transaction.fee, 0);
  var actual = toNumber_(transaction['實際入出金額'] != null ? transaction['實際入出金額'] : transaction.actualAmount, 0);
  if (type === 'buy') return round_(quantity * price + fee, 8);
  if (type === 'sell') return round_(quantity * price - fee, 8);
  if (type === 'stock_dividend' || type === 'split' || type === 'reverse_split') return 0;
  return round_(actual, 8);
}

function replayQuantities_(transactions, asOfDate) {
  var quantities = {};
  var cutoff = asOfDate ? dateKey_(asOfDate) : '';
  sortTransactions_(transactions).forEach(function (transaction) {
    if (cleanText_(transaction['刪除時間'])) return;
    if (cutoff && dateKey_(transaction['日期']) > cutoff) return;
    var code = cleanText_(transaction['標的代號']);
    var type = cleanText_(transaction['交易類型']);
    var quantity = toNumber_(transaction['數量'], 0);
    if (!code) return;
    if (quantities[code] == null) quantities[code] = 0;
    if (type === 'buy' || type === 'stock_dividend') quantities[code] += quantity;
    if (type === 'sell') quantities[code] -= quantity;
    if (type === 'split' || type === 'reverse_split') {
      var before = finitePositive_(transaction['分割前股數']);
      var after = finitePositive_(transaction['分割後股數']);
      if (before && after) quantities[code] *= after / before;
    }
  });
  Object.keys(quantities).forEach(function (code) {
    if (Math.abs(quantities[code]) < V81.EPSILON) quantities[code] = 0;
  });
  return quantities;
}

function validateNoOversell_(transactions) {
  var quantities = {};
  var errors = [];
  sortTransactions_(transactions).forEach(function (transaction) {
    if (cleanText_(transaction['刪除時間'])) return;
    var code = cleanText_(transaction['標的代號']);
    var type = cleanText_(transaction['交易類型']);
    var quantity = toNumber_(transaction['數量'], 0);
    if (!code) return;
    if (quantities[code] == null) quantities[code] = 0;
    if (type === 'buy' || type === 'stock_dividend') quantities[code] += quantity;
    if (type === 'sell') quantities[code] -= quantity;
    if (type === 'split' || type === 'reverse_split') {
      var before = finitePositive_(transaction['分割前股數']);
      var after = finitePositive_(transaction['分割後股數']);
      if (before && after) quantities[code] *= after / before;
    }
    if (quantities[code] < -V81.EPSILON) {
      errors.push({
        code: 'HISTORICAL_OVERSELL',
        transactionId: cleanText_(transaction['交易ID']),
        assetCode: code,
        date: dateKey_(transaction['日期']),
        quantityAfter: quantities[code]
      });
    }
  });
  return { valid: errors.length === 0, errors: errors, quantities: quantities };
}

function xirr_(cashFlows) {
  var flows = (cashFlows || []).filter(function (flow) {
    return toDate_(flow.date) && isFinite(toNumber_(flow.amount, NaN)) && Math.abs(toNumber_(flow.amount, 0)) > V81.EPSILON;
  });
  if (flows.length < 2) return null;
  var hasPositive = flows.some(function (flow) { return toNumber_(flow.amount, 0) > 0; });
  var hasNegative = flows.some(function (flow) { return toNumber_(flow.amount, 0) < 0; });
  if (!hasPositive || !hasNegative) return null;
  flows.sort(function (a, b) { return toDate_(a.date) - toDate_(b.date); });
  var origin = toDate_(flows[0].date).getTime();
  function npv(rate) {
    if (rate <= -1) return NaN;
    return flows.reduce(function (sum, flow) {
      var years = (toDate_(flow.date).getTime() - origin) / 31557600000;
      return sum + toNumber_(flow.amount, 0) / Math.pow(1 + rate, years);
    }, 0);
  }
  var guess = 0.1;
  for (var iteration = 0; iteration < 50; iteration++) {
    var value = npv(guess);
    if (!isFinite(value)) break;
    if (Math.abs(value) < 1e-7) return guess;
    var step = 1e-6;
    var derivative = (npv(guess + step) - value) / step;
    if (!isFinite(derivative) || Math.abs(derivative) < 1e-12) break;
    var next = guess - value / derivative;
    if (!isFinite(next) || next <= -0.999999 || next > 1000) break;
    guess = next;
  }
  var low = -0.9999;
  var high = 10;
  var lowValue = npv(low);
  var highValue = npv(high);
  while (isFinite(highValue) && lowValue * highValue > 0 && high < 1000) {
    high *= 2;
    highValue = npv(high);
  }
  if (!isFinite(lowValue) || !isFinite(highValue) || lowValue * highValue > 0) return null;
  for (var index = 0; index < 100; index++) {
    var mid = (low + high) / 2;
    var midValue = npv(mid);
    if (!isFinite(midValue)) return null;
    if (Math.abs(midValue) < 1e-7) return mid;
    if (lowValue * midValue <= 0) {
      high = mid;
      highValue = midValue;
    } else {
      low = mid;
      lowValue = midValue;
    }
  }
  return (low + high) / 2;
}
