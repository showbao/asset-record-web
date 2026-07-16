function addDaysV82_(value, days) {
  var date = toDate_(value);
  if (!date) return null;
  return new Date(date.getTime() + Number(days || 0) * 86400000);
}

function monthKeyV82_(value) {
  return dateKey_(value).slice(0, 7);
}

function monthStartV82_(year, month) {
  return toDate_(String(year) + '-' + String(month).padStart(2, '0') + '-01');
}

function addMonthsV82_(value, months) {
  var key = monthKeyV82_(value);
  var parts = key.split('-');
  var total = Number(parts[0]) * 12 + Number(parts[1]) - 1 + Number(months || 0);
  var year = Math.floor(total / 12);
  var month = total % 12 + 1;
  return monthStartV82_(year, month);
}

function monthEndV82_(year, month) {
  return addDaysV82_(addMonthsV82_(monthStartV82_(year, month), 1), -1);
}

function sampleLevelV82_(value) {
  var key = dateKey_(value);
  if (!key) return '';
  var date = toDate_(key);
  var day = Number(key.slice(8, 10));
  if (day === 10) return '10日';
  if (day === 20) return '20日';
  var parts = key.split('-');
  return key === dateKey_(monthEndV82_(Number(parts[0]), Number(parts[1]))) ? '月底' : '';
}

function isTrendSampleDateV82_(value) {
  return Boolean(sampleLevelV82_(value));
}

function expectedTrendDatesV82_(startDate, endDate) {
  var start = toDate_(startDate || V81.TREND_START_DATE);
  var end = toDate_(endDate || new Date());
  if (!start || !end || dateKey_(start) > dateKey_(end)) return [];
  var cursor = monthStartV82_(Number(dateKey_(start).slice(0, 4)), Number(dateKey_(start).slice(5, 7)));
  var endKey = dateKey_(end);
  var results = [];
  while (monthKeyV82_(cursor) <= monthKeyV82_(end)) {
    var parts = monthKeyV82_(cursor).split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    [monthStartV82_(year, month), monthStartV82_(year, month), monthEndV82_(year, month)].forEach(function (candidate, index) {
      if (index === 0) candidate = toDate_(parts[0] + '-' + parts[1] + '-10');
      if (index === 1) candidate = toDate_(parts[0] + '-' + parts[1] + '-20');
      var key = dateKey_(candidate);
      if (key >= dateKey_(start) && key <= endKey) results.push(candidate);
    });
    cursor = addMonthsV82_(cursor, 1);
  }
  return results;
}

function readTrendCacheV82_() {
  var sheet = getSheet_(V81.SHEETS.TEMP);
  var start = V81.TREND_CACHE_START_COLUMN;
  var width = V81.HEADERS.TREND_CACHE.length;
  var lastRow = Math.max(sheet.getLastRow(), 1);
  var values = sheet.getRange(1, start, lastRow, width).getValues();
  var headers = values[0].map(cleanText_);
  var map = {};
  for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
    var key = cleanText_(values[rowIndex][0]);
    if (!key) continue;
    var row = {};
    headers.forEach(function (header, columnIndex) { row[header] = values[rowIndex][columnIndex]; });
    map[key] = row;
  }
  return { sheet: sheet, startColumn: start, headers: headers, map: map, lastRow: lastRow };
}

function trendCacheKeyV82_(type, subject, requestedDate) {
  return cleanText_(type) + '|' + cleanText_(subject) + '|' + dateKey_(requestedDate);
}

function trendCacheRowV82_(type, subject, requestedDate, value, dataDate, currency, source, estimated) {
  return {
    'V82_CACHE_KEY': trendCacheKeyV82_(type, subject, requestedDate),
    '資料類型': type,
    '對象': subject,
    '要求日期': dateKey_(requestedDate),
    '數值': value,
    '資料日期': dateKey_(dataDate),
    '幣別': currency,
    '資料來源': source,
    '是否估算': Boolean(estimated),
    '更新時間': nowSheet_()
  };
}

function writeTrendCacheV82_(cache, updates) {
  if (!updates.length) return { updated: 0, total: Object.keys(cache.map).length };
  var unique = {};
  updates.forEach(function (row) {
    var key = cleanText_(row['V82_CACHE_KEY']);
    if (key && !cache.map[key]) unique[key] = row;
  });
  var keys = Object.keys(unique).sort();
  var existingCount = Object.keys(cache.map).length;
  var rows = keys.map(function (key) { return objectToRow_(cache.headers, unique[key]); });
  var startRow = existingCount + 2;
  var requiredRows = startRow + rows.length - 1;
  if (cache.sheet.getMaxRows() < requiredRows) cache.sheet.insertRowsAfter(cache.sheet.getMaxRows(), requiredRows - cache.sheet.getMaxRows());
  if (rows.length) cache.sheet.getRange(startRow, cache.startColumn, rows.length, cache.headers.length).setValues(rows);
  keys.forEach(function (key) { cache.map[key] = unique[key]; });
  return { updated: rows.length, total: existingCount + rows.length };
}

function resolvedFromTrendCacheV82_(row) {
  if (!row) return null;
  var value = finitePositive_(row['數值']);
  var dataDate = dateKey_(row['資料日期']);
  if (!value || !dataDate) return null;
  return {
    value: value,
    date: dataDate,
    currency: cleanText_(row['幣別']),
    source: cleanText_(row['資料來源']),
    estimated: toBoolean_(row['是否估算'], false)
  };
}

function historicalSymbolV82_(asset, priceCacheMap) {
  var code = cleanText_(asset['標的代號']);
  if (asset['標的類型'] === 'us_stock') return code.toUpperCase();
  var cached = priceCacheMap[code] || {};
  var source = cleanText_(cached['最後成功來源'] || cached['資料來源']);
  if (source.indexOf('yahoo:') === 0) {
    var known = source.slice(6);
    if (known.toUpperCase().indexOf(code.toUpperCase()) === 0) return known;
  }
  return code + '.TW';
}

function requiredFxPairsV82_(assets, transactions) {
  var currencies = {};
  assets.forEach(function (asset) {
    currencies[cleanText_(asset['交易幣別'])] = true;
    currencies[cleanText_(asset['淨值幣別'])] = true;
  });
  transactions.forEach(function (row) { currencies[cleanText_(row['交易幣別'])] = true; });
  return Object.keys(currencies).filter(function (currency) { return currency && currency !== 'TWD'; }).map(function (currency) { return currency + '/TWD'; });
}

function fxSymbolV82_(pair) {
  var currency = pair.split('/')[0];
  return currency === 'USD' ? 'TWD=X' : currency + 'TWD=X';
}

function ensureHistoricalContextV82_(assets, transactions, requestedDates, priceCacheRows) {
  ensureTrendCacheHeaders_();
  var cache = readTrendCacheV82_();
  var uniqueDates = {};
  requestedDates.forEach(function (date) { var key = dateKey_(date); if (key) uniqueDates[key] = toDate_(key); });
  var dates = Object.keys(uniqueDates).sort().map(function (key) { return uniqueDates[key]; });
  if (!dates.length) return { cache: cache, priceCacheMap: {}, errors: [], updates: 0 };
  var priceCacheMap = {};
  priceCacheRows.forEach(function (row) { priceCacheMap[cleanText_(row['標的代號'])] = row; });
  var fxCacheMap = {};
  loadFxCache_().forEach(function (row) { fxCacheMap[cleanText_(row['幣別組合'])] = row; });
  var stockRequests = [];
  var missingDateMap = {};
  assets.filter(function (asset) { return asset['標的類型'] !== 'fund'; }).forEach(function (asset) {
    var code = cleanText_(asset['標的代號']);
    var missing = false;
    dates.forEach(function (date) {
      var unresolved = !resolvedFromTrendCacheV82_(cache.map[trendCacheKeyV82_('PRICE', code, date)]);
      if (unresolved) {
        missing = true;
        missingDateMap[dateKey_(date)] = date;
      }
    });
    if (missing) stockRequests.push({ assetCode: code, symbol: historicalSymbolV82_(asset, priceCacheMap), currency: cleanText_(asset['淨值幣別']), assetType: cleanText_(asset['標的類型']) });
  });
  var fxPairs = requiredFxPairsV82_(assets, transactions);
  var fxRequests = [];
  fxPairs.forEach(function (pair) {
    var missing = false;
    dates.forEach(function (date) {
      var unresolved = !resolvedFromTrendCacheV82_(cache.map[trendCacheKeyV82_('FX', pair, date)]);
      if (unresolved) {
        missing = true;
        missingDateMap[dateKey_(date)] = date;
      }
    });
    if (missing) fxRequests.push({ assetCode: pair, symbol: fxSymbolV82_(pair), currency: 'TWD', assetType: 'fx' });
  });
  var requests = stockRequests.concat(fxRequests);
  var fetchDates = Object.keys(missingDateMap).sort().map(function (key) { return missingDateMap[key]; });
  var earliest = addDaysV82_(fetchDates[0] || dates[0], -14);
  var latest = addDaysV82_(fetchDates[fetchDates.length - 1] || dates[dates.length - 1], 2);
  var results = fetchYahooHistoryBatch_(requests, earliest, latest);
  var bySubject = {};
  results.forEach(function (result) { bySubject[result.assetCode] = result; });
  var fallback = [];
  stockRequests.forEach(function (request) {
    var result = bySubject[request.assetCode];
    if (request.assetType !== 'tw_stock' || (result && result.success)) return;
    var alternate = /\.TWO$/i.test(request.symbol) ? request.assetCode + '.TW' : request.assetCode + '.TWO';
    fallback.push(Object.assign({}, request, { symbol: alternate }));
  });
  fetchYahooHistoryBatch_(fallback, earliest, latest).forEach(function (result) {
    if (result.success || !bySubject[result.assetCode]) bySubject[result.assetCode] = result;
  });
  var updates = [];
  requests.concat(fallback).forEach(function (request) {
    var subject = request.assetCode;
    var type = request.assetType === 'fx' ? 'FX' : 'PRICE';
    var result = bySubject[subject];
    if (!result || !result.success) return;
    dates.forEach(function (date) {
      var key = trendCacheKeyV82_(type, subject, date);
      if (resolvedFromTrendCacheV82_(cache.map[key])) return;
      var point = selectHistoryPointOnOrBefore_(result.points, date);
      if (!point) return;
      updates.push(trendCacheRowV82_(type, subject, date, point.value, point.date, result.currency, result.source, false));
    });
  });
  var cacheWrite = writeTrendCacheV82_(cache, updates);
  var errorSubjects = {};
  var errors = requests.map(function (request) { return bySubject[request.assetCode]; }).filter(function (result) {
    if (!result || result.success || errorSubjects[result.assetCode]) return false;
    errorSubjects[result.assetCode] = true;
    return true;
  }).map(function (result) { return { subject: result.assetCode, code: result.errorCode, message: result.errorMessage }; });
  return { cache: cache, priceCacheMap: priceCacheMap, fxCacheMap: fxCacheMap, errors: errors, updates: cacheWrite.updated, dates: dates };
}

function resolveFxV82_(pair, requestedDate, context) {
  if (pair === 'TWD/TWD') return { value: 1, date: dateKey_(requestedDate), currency: 'TWD', source: 'system_constant', estimated: false };
  var row = context.cache.map[trendCacheKeyV82_('FX', pair, requestedDate)];
  var resolved = resolvedFromTrendCacheV82_(row);
  if (resolved && resolved.date <= dateKey_(requestedDate)) return resolved;
  var current = context.fxCacheMap && context.fxCacheMap[pair] || {};
  var currentRate = finitePositive_(current['匯率']);
  var currentDate = dateKey_(current['資料日期']);
  if (!currentRate || !currentDate || currentDate > dateKey_(requestedDate)) return null;
  return { value: currentRate, date: currentDate, currency: 'TWD', source: cleanText_(current['最後成功來源'] || current['資料來源'] || 'fx_cache'), estimated: false };
}

function latestTransactionPriceV82_(transactions, assetCode, requestedDate) {
  var key = dateKey_(requestedDate);
  var selected = null;
  sortTransactions_(transactions).forEach(function (row) {
    if (cleanText_(row['刪除時間']) || cleanText_(row['標的代號']) !== assetCode) return;
    if (['buy', 'sell'].indexOf(cleanText_(row['交易類型'])) < 0) return;
    var price = finitePositive_(row['單價']);
    var date = dateKey_(row['日期']);
    if (!price || !date || date > key) return;
    selected = { price: price, date: date, id: cleanText_(row['交易ID']), tradeCurrency: cleanText_(row['交易幣別']) };
  });
  return selected;
}

function resolveHistoricalPriceV82_(asset, transactions, requestedDate, context) {
  var code = cleanText_(asset['標的代號']);
  var navCurrency = cleanText_(asset['淨值幣別']);
  var market = resolvedFromTrendCacheV82_(context.cache.map[trendCacheKeyV82_('PRICE', code, requestedDate)]);
  if (market && market.date <= dateKey_(requestedDate)) return market;
  var current = context.priceCacheMap[code] || {};
  var currentPrice = finitePositive_(current['最新價格']);
  var currentDate = dateKey_(current['價格日期']);
  if (currentPrice && currentDate && currentDate <= dateKey_(requestedDate)) {
    return { value: currentPrice, date: currentDate, currency: navCurrency, source: cleanText_(current['最後成功來源'] || current['資料來源'] || 'price_cache'), estimated: false };
  }
  var transaction = latestTransactionPriceV82_(transactions, code, requestedDate);
  if (!transaction) return null;
  var tradeCurrency = cleanText_(asset['交易幣別']);
  if (tradeCurrency === navCurrency) {
    return { value: transaction.price, date: transaction.date, currency: navCurrency, source: 'transaction_price:' + transaction.id, estimated: true };
  }
  var tradeFx = resolveFxV82_(tradeCurrency + '/TWD', transaction.date, context);
  var navFx = resolveFxV82_(navCurrency + '/TWD', transaction.date, context);
  if (!tradeFx || !navFx) return null;
  return {
    value: transaction.price * tradeFx.value / navFx.value,
    date: transaction.date,
    currency: navCurrency,
    source: 'transaction_price_fx_derived:' + transaction.id,
    estimated: true
  };
}

function computeInvestmentCashV82_(transactions, cashFlows, requestedDate, context) {
  var cutoff = dateKey_(requestedDate);
  var externalNet = 0;
  var transactionCash = 0;
  var errors = [];
  cashFlows.forEach(function (flow) {
    if (cleanText_(flow['刪除時間']) || dateKey_(flow['日期']) > cutoff) return;
    var amount = toNumber_(flow['金額_TWD'], NaN);
    if (!isFinite(amount)) {
      errors.push('外部流水無有效 TWD 金額：' + cleanText_(flow['流水ID']));
      return;
    }
    externalNet += cleanText_(flow['類型']) === '入金' ? amount : -amount;
  });
  sortTransactions_(transactions).forEach(function (row) {
    if (cleanText_(row['刪除時間']) || dateKey_(row['日期']) > cutoff) return;
    var type = cleanText_(row['交易類型']);
    if (['buy', 'sell', 'dividend', 'adjustment'].indexOf(type) < 0) return;
    var amount = toNumber_(row['實際入出金額'], NaN);
    if (!isFinite(amount)) {
      errors.push('交易無有效實際金額：' + cleanText_(row['交易ID']));
      return;
    }
    var currency = cleanText_(row['交易幣別']);
    var fx = currency === 'TWD' ? { value: 1 } : resolveFxV82_(currency + '/TWD', row['日期'], context);
    if (!fx) {
      errors.push('交易缺少歷史匯率：' + cleanText_(row['交易ID']) + '／' + currency);
      return;
    }
    var twd = amount * fx.value;
    if (type === 'buy') transactionCash -= twd;
    if (type === 'sell' || type === 'dividend') transactionCash += twd;
    if (type === 'adjustment') transactionCash += twd;
  });
  return {
    cashTwd: errors.length ? null : round_(externalNet + transactionCash, 8),
    externalNetTwd: round_(externalNet, 8),
    transactionCashTwd: errors.length ? null : round_(transactionCash, 8),
    errors: errors
  };
}

function buildTrendSnapshotV82_(requestedDate, assets, transactions, cashFlows, context) {
  var key = dateKey_(requestedDate);
  var assetMap = {};
  assets.forEach(function (asset) { assetMap[cleanText_(asset['標的代號'])] = asset; });
  var states = computeInvestmentStateCore_(assets, transactions, [], [], requestedDate);
  var totals = { '台股': 0, '美股': 0, '基金': 0 };
  var categoryMissing = { '台股': false, '美股': false, '基金': false };
  var details = [];
  var estimatedCount = 0;
  var missingCount = 0;
  var errors = [];
  states.filter(function (state) { return state.quantity > V81.EPSILON; }).forEach(function (state) {
    var asset = assetMap[state.code];
    var price = resolveHistoricalPriceV82_(asset, transactions, requestedDate, context);
    var navCurrency = cleanText_(asset['淨值幣別']);
    var fx = navCurrency === 'TWD' ? { value: 1, date: key, source: 'system_constant', estimated: false } : resolveFxV82_(navCurrency + '/TWD', requestedDate, context);
    var missing = !price || !fx || price.date > key || fx.date > key;
    var estimated = !missing && Boolean(price.estimated || fx.estimated);
    var marketTwd = missing ? null : round_(state.quantity * price.value * fx.value, 8);
    if (missing) {
      missingCount++;
      categoryMissing[state.category] = true;
      errors.push(state.code + ' 缺少' + (!price ? '價格／淨值' : '匯率'));
    } else {
      totals[state.category] += marketTwd;
      if (estimated) estimatedCount++;
    }
    details.push({
      '取樣日期': key,
      '取樣級距': sampleLevelV82_(requestedDate),
      '標的代號': state.code,
      '標的名稱': state.name,
      '類別': state.category,
      '持有數量': state.quantity,
      '價格／淨值': price ? price.value : '',
      '價格日期': price ? price.date : '',
      '淨值幣別': navCurrency,
      '匯率_TWD': fx ? fx.value : '',
      '市值_TWD': marketTwd == null ? '' : marketTwd,
      '是否估算': estimated,
      '資料來源': missing ? (!price ? 'MISSING_PRICE' : 'MISSING_FX') : price.source,
      '更新時間': nowSheet_(),
      '使用價格': price ? price.value : '',
      '使用匯率': fx ? fx.value : '',
      '匯率日期': fx ? fx.date : ''
    });
  });
  var cash = computeInvestmentCashV82_(transactions, cashFlows, requestedDate, context);
  if (cash.errors.length) errors = errors.concat(cash.errors);
  var incomplete = missingCount > 0 || cash.cashTwd == null;
  var tw = categoryMissing['台股'] ? null : round_(totals['台股'], 8);
  var us = categoryMissing['美股'] ? null : round_(totals['美股'], 8);
  var fund = categoryMissing['基金'] ? null : round_(totals['基金'], 8);
  var positions = incomplete ? null : round_(totals['台股'] + totals['美股'] + totals['基金'], 8);
  var netAsset = positions == null || cash.cashTwd == null ? null : round_(positions + cash.cashTwd, 8);
  var result = netAsset == null ? null : round_(netAsset - cash.externalNetTwd, 8);
  var status = incomplete ? V81.TREND_STATUS.INCOMPLETE : estimatedCount > 0 ? V81.TREND_STATUS.ESTIMATED : V81.TREND_STATUS.COMPLETE;
  return {
    snapshot: {
      '取樣日期': key,
      '取樣級距': sampleLevelV82_(requestedDate),
      '台股市值_TWD': tw == null ? '' : tw,
      '美股市值_TWD': us == null ? '' : us,
      '基金市值_TWD': fund == null ? '' : fund,
      '投資部位市值_TWD': positions == null ? '' : positions,
      '投資池現金_TWD': cash.cashTwd == null ? '' : cash.cashTwd,
      '投資淨資產_TWD': netAsset == null ? '' : netAsset,
      '累積外部淨投入_TWD': cash.externalNetTwd,
      '累積投資成果_TWD': result == null ? '' : result,
      '估算標的數': estimatedCount,
      '是否含估算': estimatedCount > 0,
      '更新時間': nowSheet_(),
      '最近六個月日期': '',
      '最近六個月淨資產': '',
      '最近六個月外部淨投入': '',
      '資料狀態': status,
      '缺漏標的數': missingCount,
      '錯誤訊息': errors.join('；')
    },
    details: details,
    status: status,
    estimatedCount: estimatedCount,
    missingCount: missingCount,
    errors: errors
  };
}

function rollingSixMonthCutoffV82_(latestDate) {
  var latest = toDate_(latestDate);
  if (!latest) return '';
  var key = dateKey_(latest);
  var targetMonth = addMonthsV82_(toDate_(key.slice(0, 7) + '-01'), -6);
  var targetDay = Math.min(Number(key.slice(8, 10)), Number(dateKey_(monthEndV82_(Number(monthKeyV82_(targetMonth).slice(0, 4)), Number(monthKeyV82_(targetMonth).slice(5, 7)))).slice(8, 10)));
  return monthKeyV82_(targetMonth) + '-' + String(targetDay).padStart(2, '0');
}

function upsertTrendOutputsV82_(results) {
  var targetDates = {};
  results.forEach(function (result) { targetDates[result.snapshot['取樣日期']] = true; });
  var existingSnapshots = readTable_(V81.SHEETS.TREND, { requiredHeaders: V81.HEADERS.TREND }).rows.filter(function (row) { return !targetDates[dateKey_(row['取樣日期'])]; });
  var snapshots = existingSnapshots.concat(results.map(function (result) { return result.snapshot; }));
  snapshots.sort(function (left, right) { return dateKey_(left['取樣日期']).localeCompare(dateKey_(right['取樣日期'])); });
  var latest = snapshots.length ? dateKey_(snapshots[snapshots.length - 1]['取樣日期']) : '';
  var cutoff = rollingSixMonthCutoffV82_(latest);
  snapshots.forEach(function (row) {
    var key = dateKey_(row['取樣日期']);
    if (key >= cutoff) {
      row['最近六個月日期'] = key;
      row['最近六個月淨資產'] = row['投資淨資產_TWD'];
      row['最近六個月外部淨投入'] = row['累積外部淨投入_TWD'];
    } else {
      row['最近六個月日期'] = '';
      row['最近六個月淨資產'] = '';
      row['最近六個月外部淨投入'] = '';
    }
  });
  var existingDetails = readTable_(V81.SHEETS.TREND_DETAIL, { requiredHeaders: V81.HEADERS.TREND_DETAIL }).rows.filter(function (row) { return !targetDates[dateKey_(row['取樣日期'])]; });
  var details = existingDetails;
  results.forEach(function (result) { details = details.concat(result.details); });
  details.sort(function (left, right) {
    var dateDiff = dateKey_(left['取樣日期']).localeCompare(dateKey_(right['取樣日期']));
    return dateDiff || cleanText_(left['標的代號']).localeCompare(cleanText_(right['標的代號']));
  });
  var writes = [
    writeOutputRows_(V81.SHEETS.TREND, V81.HEADERS.TREND, snapshots),
    writeOutputRows_(V81.SHEETS.TREND_DETAIL, V81.HEADERS.TREND_DETAIL, details)
  ];
  setSettingValues_({ LAST_TREND_SNAPSHOT_DATE: latest });
  return { snapshotCount: snapshots.length, detailCount: details.length, latestDate: latest, writes: writes };
}

function createTrendBuildContextV82_(requested) {
  var assets = loadAssets_();
  var transactions = loadTransactions_(false);
  var cashFlows = loadCashFlows_(false);
  var maxKey = dateKey_(requested[requested.length - 1]);
  var requiredDates = requested.slice();
  var assetMap = {};
  assets.forEach(function (asset) { assetMap[cleanText_(asset['標的代號'])] = asset; });
  transactions.forEach(function (row) {
    var currency = cleanText_(row['交易幣別']);
    var key = dateKey_(row['日期']);
    var asset = assetMap[cleanText_(row['標的代號'])] || {};
    var needsFundFx = cleanText_(asset['標的類型']) === 'fund' && cleanText_(asset['交易幣別']) !== cleanText_(asset['淨值幣別']) && ['buy', 'sell'].indexOf(cleanText_(row['交易類型'])) >= 0;
    if ((currency && currency !== 'TWD' || needsFundFx) && key && key <= maxKey) requiredDates.push(toDate_(key));
  });
  var context = ensureHistoricalContextV82_(assets, transactions, requiredDates, loadPriceCache_());
  return { assets: assets, transactions: transactions, cashFlows: cashFlows, context: context };
}

function rebuildTrendDatesInternalV82_(dates, sharedBuildContext) {
  var normalized = {};
  dates.forEach(function (date) {
    var key = dateKey_(date);
    if (!key || !isTrendSampleDateV82_(key) || key > dateKey_(new Date())) throw new Error('不是有效且已到期的取樣日：' + key);
    normalized[key] = toDate_(key);
  });
  var requested = Object.keys(normalized).sort().map(function (key) { return normalized[key]; });
  if (!requested.length) return { processedDates: [], snapshotCount: readTable_(V81.SHEETS.TREND).rows.length };
  var buildContext = sharedBuildContext || createTrendBuildContextV82_(requested);
  var results = requested.map(function (date) { return buildTrendSnapshotV82_(date, buildContext.assets, buildContext.transactions, buildContext.cashFlows, buildContext.context); });
  var output = upsertTrendOutputsV82_(results);
  output.processedDates = requested.map(dateKey_);
  output.estimatedDates = results.filter(function (result) { return result.status === V81.TREND_STATUS.ESTIMATED; }).map(function (result) { return result.snapshot['取樣日期']; });
  output.incompleteDates = results.filter(function (result) { return result.status === V81.TREND_STATUS.INCOMPLETE; }).map(function (result) { return result.snapshot['取樣日期']; });
  output.marketErrors = buildContext.context.errors;
  return output;
}

function canonicalValueV82_(value) {
  if (value instanceof Date) return dateKey_(value);
  if (typeof value === 'number') return round_(value, 8);
  if (typeof value === 'boolean') return value;
  return cleanText_(value);
}

function sourceDataHashV82_() {
  var data = {
    assets: loadAssets_().map(function (row) { return V81.HEADERS.ASSETS.map(function (header) { return canonicalValueV82_(row[header]); }); }),
    transactions: loadTransactions_(true).map(function (row) { return V81.HEADERS.TRANSACTIONS.map(function (header) { return canonicalValueV82_(row[header]); }); }),
    cashFlows: loadCashFlows_(true).map(function (row) { return V81.HEADERS.CASH_FLOWS.map(function (header) { return canonicalValueV82_(row[header]); }); })
  };
  var text = JSON.stringify(data);
  var hash = 2166136261;
  for (var index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return ('00000000' + hash.toString(16)).slice(-8);
}

function totalMonthsV82_(startDate, endDate) {
  var start = monthKeyV82_(startDate).split('-');
  var end = monthKeyV82_(endDate).split('-');
  return (Number(end[0]) - Number(start[0])) * 12 + Number(end[1]) - Number(start[1]) + 1;
}

function createTrendCursorV82_(startDate, endDate) {
  var start = dateKey_(startDate || V81.TREND_START_DATE);
  var end = dateKey_(endDate || new Date());
  return {
    version: 1,
    startDate: start,
    endDate: end,
    nextMonth: start.slice(0, 7),
    status: 'RUNNING',
    processedMonths: 0,
    totalMonths: totalMonthsV82_(start, end),
    processedDates: 0,
    lastError: '',
    updatedAt: nowSheet_()
  };
}

function readTrendCursorV82_() {
  var raw = cleanText_(getSettingsMap_().TREND_REBUILD_CURSOR);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (error) { return null; }
}

function saveTrendCursorV82_(cursor) {
  cursor.updatedAt = nowSheet_();
  setSettingValues_({ TREND_REBUILD_CURSOR: JSON.stringify(cursor) });
}

function trendDatesForMonthV82_(monthKey, endDate) {
  var parts = monthKey.split('-');
  var dates = [toDate_(monthKey + '-10'), toDate_(monthKey + '-20'), monthEndV82_(Number(parts[0]), Number(parts[1]))];
  var endKey = dateKey_(endDate || new Date());
  return dates.filter(function (date) { return dateKey_(date) >= V81.TREND_START_DATE && dateKey_(date) <= endKey; });
}

function continueTrendRebuildInternalV82_() {
  var cursor = readTrendCursorV82_();
  if (!cursor) throw new Error('尚未建立歷史回算游標，請先執行 startTrendRebuildFrom2024()');
  if (cursor.status === 'COMPLETE') return { cursor: cursor, processed: [], hasMore: false };
  cursor.status = 'RUNNING';
  cursor.lastError = '';
  var settings = getSettingsMap_();
  var batchMonths = Math.max(1, Math.min(6, toNumber_(settings.TREND_BATCH_MONTHS, V81.TREND_BATCH_MONTHS)));
  var processed = [];
  try {
    for (var index = 0; index < batchMonths && cursor.nextMonth <= cursor.endDate.slice(0, 7); index++) {
      var dates = trendDatesForMonthV82_(cursor.nextMonth, cursor.endDate);
      var result = rebuildTrendDatesInternalV82_(dates);
      processed.push(result);
      cursor.processedMonths += 1;
      cursor.processedDates += dates.length;
      cursor.nextMonth = monthKeyV82_(addMonthsV82_(toDate_(cursor.nextMonth + '-01'), 1));
      saveTrendCursorV82_(cursor);
    }
    if (cursor.nextMonth > cursor.endDate.slice(0, 7)) {
      cursor.status = 'COMPLETE';
      cursor.lastError = '';
      var hash = sourceDataHashV82_();
      setSettingValues_({ TREND_SOURCE_HASH: hash, TREND_DIRTY_FROM_DATE: '' });
    }
    saveTrendCursorV82_(cursor);
    return { cursor: cursor, processed: processed, hasMore: cursor.status !== 'COMPLETE' };
  } catch (error) {
    cursor.status = 'ERROR';
    cursor.lastError = error.message;
    saveTrendCursorV82_(cursor);
    throw error;
  }
}

function startTrendRebuildFrom2024() {
  try {
    return withDocumentLock_(function () {
      ensureV81Schema_();
      var settings = getSettingsMap_();
      var start = dateKey_(settings.TREND_DIRTY_FROM_DATE) || V81.TREND_START_DATE;
      var cursor = createTrendCursorV82_(start, new Date());
      saveTrendCursorV82_(cursor);
      var result = continueTrendRebuildInternalV82_();
      return apiResult_(true, 'OK', '歷史回算已啟動並完成第一批', result);
    });
  } catch (error) {
    return apiResult_(false, 'TREND_REBUILD_START_FAILED', error.message, {});
  }
}

function continueTrendRebuild() {
  try {
    return withDocumentLock_(function () {
      var result = continueTrendRebuildInternalV82_();
      return apiResult_(true, 'OK', result.hasMore ? '歷史回算批次完成，尚有後續月份' : '歷史回算全部完成', result);
    });
  } catch (error) {
    return apiResult_(false, 'TREND_REBUILD_CONTINUE_FAILED', error.message, {});
  }
}

function rebuildTrendSnapshotForDate(date) {
  try {
    return withDocumentLock_(function () {
      var key = dateKey_(date);
      if (!key || !isTrendSampleDateV82_(key) || key > dateKey_(new Date())) throw new Error('只允許已到期的 10 日、20 日或月底：' + key);
      var result = rebuildTrendDatesInternalV82_([toDate_(key)]);
      return apiResult_(true, 'OK', '指定取樣日已重建', result);
    });
  } catch (error) {
    return apiResult_(false, 'TREND_DATE_REBUILD_FAILED', error.message, {});
  }
}

function rebuildTrendMonth(year, month) {
  try {
    return withDocumentLock_(function () {
      var y = Number(year);
      var m = Number(month);
      if (!(y >= 2024) || !(m >= 1 && m <= 12)) throw new Error('年月格式錯誤');
      var result = rebuildTrendDatesInternalV82_(trendDatesForMonthV82_(String(y) + '-' + String(m).padStart(2, '0'), new Date()));
      return apiResult_(true, 'OK', '指定月份已重建', result);
    });
  } catch (error) {
    return apiResult_(false, 'TREND_MONTH_REBUILD_FAILED', error.message, {});
  }
}

function rebuildMissingTrendSnapshotsInternalV82_() {
  var expected = expectedTrendDatesV82_(V81.TREND_START_DATE, new Date()).map(dateKey_);
  var actual = {};
  readTable_(V81.SHEETS.TREND).rows.forEach(function (row) { actual[dateKey_(row['取樣日期'])] = true; });
  var missing = expected.filter(function (key) { return !actual[key]; });
  var months = [];
  missing.forEach(function (key) { var month = key.slice(0, 7); if (months.indexOf(month) < 0) months.push(month); });
  months = months.slice(0, V81.TREND_BATCH_MONTHS);
  var dates = missing.filter(function (key) { return months.indexOf(key.slice(0, 7)) >= 0; }).map(toDate_);
  var result = rebuildTrendDatesInternalV82_(dates);
  result.missingBefore = missing.length;
  result.missingAfter = Math.max(0, missing.length - dates.length);
  return result;
}

function rebuildMissingTrendSnapshots() {
  try {
    return withDocumentLock_(function () {
      var result = rebuildMissingTrendSnapshotsInternalV82_();
      return apiResult_(true, 'OK', result.missingAfter ? '已補建一批缺漏快照' : '缺漏快照已補齊', result);
    });
  } catch (error) {
    return apiResult_(false, 'TREND_MISSING_REBUILD_FAILED', error.message, {});
  }
}

function portfolioXirrV82_(cashFlows, terminalValue, valuationDate) {
  var cutoff = dateKey_(valuationDate);
  var flows = cashFlows.filter(function (row) { return !cleanText_(row['刪除時間']) && dateKey_(row['日期']) <= cutoff; }).map(function (row) {
    var amount = toNumber_(row['金額_TWD'], 0);
    return { date: row['日期'], amount: cleanText_(row['類型']) === '入金' ? -amount : amount };
  });
  if (isFinite(terminalValue) && terminalValue > V81.EPSILON) flows.push({ date: valuationDate, amount: terminalValue });
  return xirr_(flows);
}

function currentOverviewV82_() {
  var assets = loadAssets_();
  var transactions = loadTransactions_(false);
  var cashFlows = loadCashFlows_(false);
  var prices = loadPriceCache_();
  var fxRows = loadFxCache_();
  var states = computeInvestmentStateCore_(assets, transactions, prices, fxRows, new Date());
  var requiredDates = [new Date()];
  var assetMap = {};
  assets.forEach(function (asset) { assetMap[cleanText_(asset['標的代號'])] = asset; });
  transactions.forEach(function (row) {
    var asset = assetMap[cleanText_(row['標的代號'])] || {};
    var needsFundFx = cleanText_(asset['標的類型']) === 'fund' && cleanText_(asset['交易幣別']) !== cleanText_(asset['淨值幣別']) && ['buy', 'sell'].indexOf(cleanText_(row['交易類型'])) >= 0;
    if (cleanText_(row['交易幣別']) !== 'TWD' || needsFundFx) requiredDates.push(row['日期']);
  });
  var context = ensureHistoricalContextV82_(assets, transactions, requiredDates, prices);
  var cash = computeInvestmentCashV82_(transactions, cashFlows, new Date(), context);
  var stateErrors = states.filter(function (row) { return row.holding && row.status !== '正常'; });
  var totalMarket = states.reduce(function (sum, row) { return sum + (row.marketTwd || 0); }, 0);
  var netAsset = cash.cashTwd == null || stateErrors.length ? null : round_(totalMarket + cash.cashTwd, 8);
  var totals = {
    market: round_(totalMarket, 8),
    cash: cash.cashTwd,
    netAsset: netAsset,
    externalNet: cash.externalNetTwd,
    result: netAsset == null ? null : round_(netAsset - cash.externalNetTwd, 8),
    realized: round_(states.reduce(function (sum, row) { return sum + (row.realizedTwd || 0); }, 0), 8),
    unrealized: round_(states.reduce(function (sum, row) { return sum + (row.unrealizedTwd || 0); }, 0), 8),
    dividend: round_(states.reduce(function (sum, row) { return sum + (row.dividendTwd || 0); }, 0), 8),
    totalProfit: round_(states.reduce(function (sum, row) { return sum + (row.totalProfitTwd || 0); }, 0), 8),
    remainingCost: round_(states.reduce(function (sum, row) { return sum + (row.remainingCostTwd || 0); }, 0), 8),
    soldCost: round_(states.reduce(function (sum, row) { return sum + (row.soldCostTwd || 0); }, 0), 8)
  };
  totals.returnRate = totals.remainingCost + totals.soldCost > V81.EPSILON ? totals.totalProfit / (totals.remainingCost + totals.soldCost) : null;
  totals.xirr = portfolioXirrV82_(cashFlows, totals.netAsset, new Date());
  var holdingStates = states.filter(function (row) { return row.holding; });
  var priceDates = holdingStates.map(function (row) { return dateKey_(row.priceDate); }).filter(Boolean).sort();
  var holdingCodeMap = {};
  holdingStates.forEach(function (row) { holdingCodeMap[row.code] = true; });
  var composition = { '台股': 0, '美股': 0, '基金': 0, '投資池現金': totals.cash || 0 };
  holdingStates.forEach(function (row) { composition[row.category] += row.marketTwd || 0; });
  return {
    states: states,
    totals: totals,
    composition: composition,
    oldestPriceDate: priceDates.length ? priceDates[0] : '',
    errors: cash.errors
      .concat(context.errors.filter(function (row) { return holdingCodeMap[row.subject]; }).map(function (row) { return row.subject + ':' + row.code; }))
      .concat(stateErrors.map(function (row) { return row.code + ':' + row.errorMessage; }))
  };
}

function refreshDashboardInternalV82_() {
  var overview = currentOverviewV82_();
  var sheet = getSheet_(V81.SHEETS.DASHBOARD);
  var width = Math.max(sheet.getMaxColumns(), 18);
  var height = 30;
  var matrix = Array.from({ length: height }, function () { return Array(width).fill(''); });
  var totals = overview.totals;
  matrix[0][0] = '資產記錄｜投資總覽';
  matrix[1][0] = 'V8.2｜目前淨資產、投資池現金與 2024 年起歷史趨勢';
  matrix[3][0] = '核心指標';
  matrix[4][0] = '投資淨資產_TWD'; matrix[4][1] = totals.netAsset == null ? '' : totals.netAsset;
  matrix[4][2] = '投資部位市值_TWD'; matrix[4][3] = totals.market;
  matrix[4][4] = '投資池現金_TWD'; matrix[4][5] = totals.cash == null ? '' : totals.cash;
  matrix[4][6] = '累積外部淨投入_TWD'; matrix[4][7] = totals.externalNet;
  matrix[6][0] = '累積投資成果_TWD'; matrix[6][1] = totals.result == null ? '' : totals.result;
  matrix[6][2] = '累積總損益_TWD'; matrix[6][3] = totals.totalProfit;
  matrix[6][4] = '整體投資報酬率'; matrix[6][5] = totals.returnRate == null ? '' : totals.returnRate;
  matrix[6][6] = '投資組合 XIRR'; matrix[6][7] = totals.xirr == null ? '' : totals.xirr;
  matrix[8][0] = '已實現損益_TWD'; matrix[8][1] = totals.realized;
  matrix[8][2] = '未實現損益_TWD'; matrix[8][3] = totals.unrealized;
  matrix[8][4] = '累積股息_TWD'; matrix[8][5] = totals.dividend;
  matrix[8][6] = '持倉價格最舊日期'; matrix[8][7] = overview.oldestPriceDate;
  matrix[10][0] = '資產組成';
  ['類別', '金額_TWD', '占投資淨資產比例'].forEach(function (header, index) { matrix[11][index] = header; });
  ['台股', '美股', '基金', '投資池現金'].forEach(function (category, index) {
    var amount = overview.composition[category];
    matrix[12 + index][0] = category;
    matrix[12 + index][1] = amount;
    matrix[12 + index][2] = totals.netAsset && isFinite(totals.netAsset) ? amount / totals.netAsset : '';
  });
  matrix[17][0] = '資料狀態';
  matrix[18][0] = '最後更新時間'; matrix[18][1] = nowSheet_();
  matrix[19][0] = '最後趨勢快照'; matrix[19][1] = getSettingsMap_().LAST_TREND_SNAPSHOT_DATE || '';
  matrix[20][0] = '資料警告'; matrix[20][1] = overview.errors.length ? overview.errors.join('；') : '無';
  var lastRow = sheet.getLastRow();
  if (lastRow > 0) sheet.getRange(1, 1, Math.max(lastRow, height), width).clearContent();
  sheet.getRange(1, 1, height, width).setValues(matrix);
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(1);
  sheet.getRange('A1:R1').setFontWeight('bold').setFontSize(16).setBackground('#e8f0fe');
  ['A4:H4', 'A11:C11', 'A18:H18'].forEach(function (range) { sheet.getRange(range).setFontWeight('bold').setBackground('#f1f3f4'); });
  sheet.getRange('B5:H9').setNumberFormat('#,##0.00');
  sheet.getRange('F7:H7').setNumberFormat('0.00%');
  sheet.getRange('H9').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('B13:B16').setNumberFormat('#,##0.00');
  sheet.getRange('C13:C16').setNumberFormat('0.00%');
  sheet.getRange('A1:I21').setWrap(true);
  sheet.setColumnWidths(1, 9, 145);
  sheet.getCharts().forEach(function (chart) { sheet.removeChart(chart); });
  var trend = getSheet_(V81.SHEETS.TREND);
  var trendLastRow = trend.getLastRow();
  if (trendLastRow > 1) {
    var fullChart = sheet.newChart()
      .setChartType(Charts.ChartType.LINE)
      .addRange(trend.getRange(1, 1, trendLastRow, 1))
      .addRange(trend.getRange(1, 8, trendLastRow, 2))
      .setNumHeaders(1)
      .setPosition(2, 10, 0, 0)
      .setOption('title', '投資以來淨資產趨勢')
      .setOption('legend', { position: 'bottom' })
      .setOption('hAxis', { title: '取樣日期' })
      .setOption('vAxis', { title: 'TWD' })
      .setOption('colors', ['#1a73e8', '#9aa0a6'])
      .setOption('width', 720)
      .setOption('height', 330)
      .build();
    var rollingChart = sheet.newChart()
      .setChartType(Charts.ChartType.LINE)
      .addRange(trend.getRange(1, 14, trendLastRow, 3))
      .setNumHeaders(1)
      .setPosition(17, 10, 0, 0)
      .setOption('title', '最近六個月投資趨勢')
      .setOption('legend', { position: 'bottom' })
      .setOption('hAxis', { title: '取樣日期' })
      .setOption('vAxis', { title: 'TWD' })
      .setOption('colors', ['#1a73e8', '#9aa0a6'])
      .setOption('width', 720)
      .setOption('height', 330)
      .build();
    sheet.insertChart(fullChart);
    sheet.insertChart(rollingChart);
  }
  return { rows: height, columns: width, chartCount: sheet.getCharts().length, overview: overview };
}

function refreshDashboard() {
  try {
    return withDocumentLock_(function () {
      var result = refreshDashboardInternalV82_();
      return apiResult_(true, 'OK', 'V8.2 投資總覽已更新', result);
    });
  } catch (error) {
    return apiResult_(false, 'DASHBOARD_REFRESH_FAILED', error.message, {});
  }
}

function installDailyTriggerV82_() {
  var removed = removeScheduledDailyTriggers_();
  var trigger = ScriptApp.newTrigger('scheduledDailyJob')
    .timeBased()
    .atHour(V81.DAILY_JOB_HOUR)
    .nearMinute(V81.DAILY_JOB_MINUTE)
    .everyDays(1)
    .inTimezone(V81.TIMEZONE)
    .create();
  return { removed: removed, createdHandler: trigger.getHandlerFunction(), triggerCount: ScriptApp.getProjectTriggers().filter(function (item) { return item.getHandlerFunction() === 'scheduledDailyJob'; }).length };
}

function installV82() {
  if (V81.VERSION === '8.4.0' && typeof installV840 === 'function') return installV840();
  if (/^8\.3\./.test(V81.VERSION) && typeof installV831 === 'function') return installV831();
  try {
    return withDocumentLock_(function () {
      var schema = ensureV81Schema_();
      var sequences = initializeIdSequences_();
      var settings = getSettingsMap_();
      var trigger = installDailyTriggerV82_();
      var updates = {
        SYSTEM_VERSION: V81.VERSION,
        SCHEMA_VERSION: V81.SCHEMA_VERSION,
        TIMEZONE: V81.TIMEZONE,
        BASE_CURRENCY: V81.BASE_CURRENCY,
        DAILY_JOB_ENABLED: 'TRUE',
        DAILY_JOB_TIME: '07:30',
        TREND_BATCH_MONTHS: String(V81.TREND_BATCH_MONTHS),
        LAST_VALIDATION_STATUS: 'PENDING'
      };
      if (!cleanText_(settings.TREND_SOURCE_HASH) && !dateKey_(settings.TREND_DIRTY_FROM_DATE)) updates.TREND_DIRTY_FROM_DATE = V81.TREND_START_DATE;
      setSettingValues_(updates);
      onOpen();
      return apiResult_(true, 'OK', 'V8.2 安裝完成', { schema: schema, sequences: sequences, trigger: trigger, next: ['refreshAllCurrentData()', 'startTrendRebuildFrom2024()', 'continueTrendRebuild()', 'refreshDashboard()', 'validatePhase2()'] });
    });
  } catch (error) {
    return apiResult_(false, 'INSTALL_V82_FAILED', error.message, {});
  }
}

function scheduledDailyJob() {
  try {
    return withDocumentLock_(function () {
      var jobStartedAt = nowSheet_();
      setJobStateV840_('market', 'running', { startedAt: jobStartedAt, finishedAt: '', error: '' });
      setJobStateV840_('rebuild', 'running', { startedAt: jobStartedAt, finishedAt: '', error: '' });
      ensureV81Schema_();
      var fx = refreshExchangeRatesInternal_();
      var prices = refreshPricesInternal_();
      var rebuild = rebuildInvestmentStateInternal_({});
      var today = dateKey_(new Date());
      var yesterday = dateKey_(addDaysV82_(new Date(), -1));
      var due = [today, yesterday].filter(function (key, index, array) { return array.indexOf(key) === index && isTrendSampleDateV82_(key) && key >= V81.TREND_START_DATE; }).map(toDate_);
      var dueResult = due.length ? rebuildTrendDatesInternalV82_(due) : { processedDates: [] };
      var settings = getSettingsMap_();
      var currentHash = sourceDataHashV82_();
      var cursor = readTrendCursorV82_();
      var trendWork;
      if (cursor && ['RUNNING', 'ERROR'].indexOf(cursor.status) >= 0) {
        trendWork = continueTrendRebuildInternalV82_();
      } else if (cleanText_(settings.TREND_SOURCE_HASH) !== currentHash) {
        var start = dateKey_(settings.TREND_DIRTY_FROM_DATE) || V81.TREND_START_DATE;
        saveTrendCursorV82_(createTrendCursorV82_(start, new Date()));
        trendWork = continueTrendRebuildInternalV82_();
      } else {
        trendWork = rebuildMissingTrendSnapshotsInternalV82_();
      }
      var dashboard = refreshDashboardInternalV82_();
      var success = fx.failed === 0 && prices.failed === 0 && rebuild.errorCount === 0;
      var jobFinishedAt = nowSheet_();
      setJobStateV840_('market', fx.failed === 0 && prices.failed === 0 ? 'success' : 'partial', { finishedAt: jobFinishedAt, error: '' });
      setJobStateV840_('rebuild', rebuild.errorCount === 0 ? 'success' : 'partial', { finishedAt: jobFinishedAt, error: '' });
      setSettingValues_({ LAST_DAILY_JOB_AT: nowSheet_(), LAST_DAILY_JOB_STATUS: success ? 'PASS' : 'PARTIAL', NEEDS_RECALC: success ? 'FALSE' : 'TRUE' });
      return apiResult_(success, success ? 'OK' : 'DAILY_JOB_PARTIAL', success ? '每日工作完成' : '每日工作完成但有警告', { fx: fx, prices: prices, rebuild: rebuild, due: dueResult, trend: trendWork, dashboard: dashboard });
    });
  } catch (error) {
    var jobFailedAt = nowSheet_();
    setJobStateV840_('market', 'error', { finishedAt: jobFailedAt, error: error.message });
    setJobStateV840_('rebuild', 'error', { finishedAt: jobFailedAt, error: error.message });
    setSettingValues_({ LAST_DAILY_JOB_AT: nowSheet_(), LAST_DAILY_JOB_STATUS: 'ERROR', NEEDS_RECALC: 'TRUE' });
    return apiResult_(false, 'DAILY_JOB_FAILED', error.message, {});
  }
}
