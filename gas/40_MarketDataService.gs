function marketResult_(assetCode, requestedSource, actualSource, success, price, currency, priceDate, status, errorCode, errorMessage) {
  return {
    success: Boolean(success),
    assetCode: cleanText_(assetCode),
    requestedSource: cleanText_(requestedSource || 'auto'),
    actualSource: cleanText_(actualSource),
    price: price == null ? null : Number(price),
    priceCurrency: cleanText_(currency),
    priceDate: cleanText_(priceDate),
    fetchedAt: new Date().toISOString(),
    status: cleanText_(status),
    errorCode: cleanText_(errorCode),
    errorMessage: cleanText_(errorMessage)
  };
}

function buildYahooUrl_(symbol, range) {
  return 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=' + encodeURIComponent(range || '5d');
}

function buildYahooHistoryUrl_(symbol, startDate, endDate) {
  var start = Math.floor(toDate_(startDate).getTime() / 1000);
  var end = Math.floor(toDate_(endDate).getTime() / 1000);
  return 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) +
    '?interval=1d&period1=' + start + '&period2=' + end + '&events=history';
}

function parseYahooHistoryResponse_(response, request) {
  var source = 'yahoo:' + request.symbol;
  try {
    var responseCode = response.getResponseCode();
    if (responseCode < 200 || responseCode >= 300) {
      return { success: false, assetCode: request.assetCode, symbol: request.symbol, source: source, currency: request.currency, points: [], status: V81.STATUS.FETCH_FAILED, errorCode: 'HTTP_ERROR', errorMessage: 'HTTP ' + responseCode };
    }
    var payload = JSON.parse(response.getContentText());
    var result = payload && payload.chart && payload.chart.result && payload.chart.result[0];
    if (!result || !result.meta) {
      return { success: false, assetCode: request.assetCode, symbol: request.symbol, source: source, currency: request.currency, points: [], status: V81.STATUS.INVALID_RESPONSE, errorCode: 'INVALID_JSON_SHAPE', errorMessage: 'Yahoo 回應缺少 chart.result' };
    }
    var timezone = cleanText_(result.meta.exchangeTimezoneName || request.timezone || V81.TIMEZONE);
    var timestamps = result.timestamp || [];
    var quotes = result.indicators && result.indicators.quote && result.indicators.quote[0] || {};
    var closes = quotes.close || [];
    var adjusted = result.indicators && result.indicators.adjclose && result.indicators.adjclose[0] && result.indicators.adjclose[0].adjclose || [];
    var byDate = {};
    timestamps.forEach(function (timestamp, index) {
      var value = finitePositive_(closes[index]) || finitePositive_(adjusted[index]);
      if (!value) return;
      var date = dateKeyInTimezone_(new Date(Number(timestamp) * 1000), timezone);
      if (!date) return;
      byDate[date] = { date: date, value: value };
    });
    var points = Object.keys(byDate).sort().map(function (date) { return byDate[date]; });
    if (!points.length) {
      return { success: false, assetCode: request.assetCode, symbol: request.symbol, source: source, currency: cleanText_(result.meta.currency || request.currency), points: [], status: V81.STATUS.NOT_FOUND, errorCode: 'NO_HISTORY', errorMessage: 'Yahoo 無有效歷史價格' };
    }
    return { success: true, assetCode: request.assetCode, symbol: request.symbol, source: source, currency: cleanText_(result.meta.currency || request.currency), timezone: timezone, points: points, status: V81.STATUS.SUCCESS, errorCode: '', errorMessage: '' };
  } catch (error) {
    return { success: false, assetCode: request.assetCode, symbol: request.symbol, source: source, currency: request.currency, points: [], status: V81.STATUS.INVALID_RESPONSE, errorCode: 'PARSE_ERROR', errorMessage: error.message };
  }
}

function fetchYahooHistoryBatch_(requests, startDate, endDate) {
  if (!requests.length) return [];
  var configs = requests.map(function (request) {
    return {
      url: buildYahooHistoryUrl_(request.symbol, startDate, endDate),
      method: 'get',
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AssetRecordV82/1.0)' }
    };
  });
  var responses;
  try {
    responses = UrlFetchApp.fetchAll(configs);
  } catch (error) {
    return requests.map(function (request) {
      return { success: false, assetCode: request.assetCode, symbol: request.symbol, source: 'yahoo:' + request.symbol, currency: request.currency, points: [], status: V81.STATUS.FETCH_FAILED, errorCode: 'NETWORK_ERROR', errorMessage: error.message };
    });
  }
  return responses.map(function (response, index) { return parseYahooHistoryResponse_(response, requests[index]); });
}

function selectHistoryPointOnOrBefore_(points, requestedDate) {
  var key = dateKey_(requestedDate);
  var selected = null;
  (points || []).forEach(function (point) {
    if (point.date <= key && (!selected || point.date > selected.date)) selected = point;
  });
  return selected;
}

function parseYahooResponse_(response, request) {
  var source = 'yahoo:' + request.symbol;
  try {
    var responseCode = response.getResponseCode();
    if (responseCode < 200 || responseCode >= 300) {
      return marketResult_(request.assetCode, request.requestedSource, source, false, null, request.currency, '', V81.STATUS.FETCH_FAILED, 'HTTP_ERROR', 'HTTP ' + responseCode);
    }
    var payload = JSON.parse(response.getContentText());
    var result = payload && payload.chart && payload.chart.result && payload.chart.result[0];
    if (!result || !result.meta) return marketResult_(request.assetCode, request.requestedSource, source, false, null, request.currency, '', V81.STATUS.INVALID_RESPONSE, 'INVALID_JSON_SHAPE', 'Yahoo 回應缺少 chart.result');
    var meta = result.meta;
    var price = finitePositive_(meta.regularMarketPrice);
    var timestamp = Number(meta.regularMarketTime) || null;
    if (!price) {
      var closes = result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close || [];
      var timestamps = result.timestamp || [];
      for (var index = closes.length - 1; index >= 0; index--) {
        var close = finitePositive_(closes[index]);
        if (close) {
          price = close;
          timestamp = Number(timestamps[index]) || timestamp;
          break;
        }
      }
    }
    if (!price) return marketResult_(request.assetCode, request.requestedSource, source, false, null, request.currency, '', V81.STATUS.INVALID_RESPONSE, 'INVALID_PRICE', 'Yahoo 無有效正價格');
    var timezone = cleanText_(meta.exchangeTimezoneName || request.timezone || V81.TIMEZONE);
    var priceDate = timestamp ? dateKeyInTimezone_(new Date(timestamp * 1000), timezone) : '';
    return marketResult_(request.assetCode, request.requestedSource, source, true, price, cleanText_(meta.currency || request.currency), priceDate, V81.STATUS.SUCCESS, '', '');
  } catch (error) {
    return marketResult_(request.assetCode, request.requestedSource, source, false, null, request.currency, '', V81.STATUS.INVALID_RESPONSE, 'PARSE_ERROR', error.message);
  }
}

function fetchYahooBatch_(requests) {
  if (!requests.length) return [];
  var configs = requests.map(function (request) {
    return {
      url: buildYahooUrl_(request.symbol, '5d'),
      method: 'get',
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AssetRecordV81/1.0)' }
    };
  });
  var responses;
  try {
    responses = UrlFetchApp.fetchAll(configs);
  } catch (error) {
    return requests.map(function (request) {
      return marketResult_(request.assetCode, request.requestedSource, 'yahoo:' + request.symbol, false, null, request.currency, '', V81.STATUS.FETCH_FAILED, 'NETWORK_ERROR', error.message);
    });
  }
  return responses.map(function (response, index) { return parseYahooResponse_(response, requests[index]); });
}

function parseFundRichResponse_(response, request) {
  var source = 'fundrich:' + request.fundId;
  try {
    var responseCode = response.getResponseCode();
    if (responseCode < 200 || responseCode >= 300) return marketResult_(request.assetCode, request.requestedSource, source, false, null, request.currency, '', V81.STATUS.FETCH_FAILED, 'HTTP_ERROR', 'HTTP ' + responseCode);
    var payload = JSON.parse(response.getContentText());
    var candidates = [];
    if (Array.isArray(payload.data)) {
      payload.data.forEach(function (item) {
        if (item && item.fundId) candidates.push(item);
        if (item && Array.isArray(item.tablebox)) candidates = candidates.concat(item.tablebox);
      });
    } else if (payload.data && Array.isArray(payload.data.tablebox)) {
      candidates = payload.data.tablebox;
    }
    var matched = candidates.find(function (item) { return cleanText_(item.fundId) === request.fundId; });
    if (!matched) return marketResult_(request.assetCode, request.requestedSource, source, false, null, request.currency, '', V81.STATUS.NOT_FOUND, 'FUND_NOT_FOUND', 'FundRich 查無完全相符基金ID');
    var price = finitePositive_(String(matched.price == null ? '' : matched.price).replace(/,/g, ''));
    if (!price) return marketResult_(request.assetCode, request.requestedSource, source, false, null, request.currency, '', V81.STATUS.INVALID_RESPONSE, 'INVALID_PRICE', 'FundRich 淨值不是有效正數');
    var priceDate = cleanText_(matched.transdate || matched.priceDate || '').replace(/\//g, '-');
    return marketResult_(request.assetCode, request.requestedSource, source, true, price, cleanText_(matched.currency || request.currency), priceDate, V81.STATUS.SUCCESS, '', '');
  } catch (error) {
    return marketResult_(request.assetCode, request.requestedSource, source, false, null, request.currency, '', V81.STATUS.INVALID_RESPONSE, 'PARSE_ERROR', error.message);
  }
}

function fetchFundRichBatch_(requests) {
  if (!requests.length) return [];
  var configs = requests.map(function (request) {
    return {
      url: 'https://apis.fundrich.com.tw/FRSDataCenter/FundTableInfo',
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ data: { kw: request.fundId, currentPage: 1, userstock: false } }),
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AssetRecordV81/1.0)' }
    };
  });
  var responses;
  try {
    responses = UrlFetchApp.fetchAll(configs);
  } catch (error) {
    return requests.map(function (request) {
      return marketResult_(request.assetCode, request.requestedSource, 'fundrich:' + request.fundId, false, null, request.currency, '', V81.STATUS.FETCH_FAILED, 'NETWORK_ERROR', error.message);
    });
  }
  return responses.map(function (response, index) { return parseFundRichResponse_(response, requests[index]); });
}

function sourceSymbolFromCache_(cacheRow, assetCode) {
  var source = cleanText_(cacheRow && (cacheRow['最後成功來源'] || cacheRow['資料來源']));
  if (source.indexOf('yahoo:') !== 0) return '';
  var symbol = source.slice(6);
  return symbol.toUpperCase().indexOf(assetCode.toUpperCase()) === 0 ? symbol : '';
}

function refreshPricesInternal_() {
  ensureHeaders_(V81.SHEETS.PRICE_CACHE, V81.HEADERS.PRICE_CACHE_REQUIRED);
  var assets = loadAssets_();
  var transactions = loadTransactions_(false);
  var quantities = replayQuantities_(transactions);
  var cacheRows = loadPriceCache_();
  var cacheMap = {};
  cacheRows.forEach(function (row) { cacheMap[cleanText_(row['標的代號'])] = row; });
  var immediateResults = {};
  var yahooRequests = [];
  var fundRequests = [];
  assets.forEach(function (asset) {
    var code = cleanText_(asset['標的代號']);
    var requestedSource = cleanText_(asset['價格來源'] || 'auto').toLowerCase();
    if (!toBoolean_(asset['是否啟用'], false)) {
      immediateResults[code] = marketResult_(code, requestedSource, '', false, null, asset['淨值幣別'], '', V81.STATUS.SKIPPED_DISABLED, '', '');
      return;
    }
    if (!toBoolean_(asset['是否更新淨值'], false)) {
      immediateResults[code] = marketResult_(code, requestedSource, '', false, null, asset['淨值幣別'], '', V81.STATUS.SKIPPED_UPDATE_OFF, '', '');
      return;
    }
    if (requestedSource === 'manual') {
      immediateResults[code] = marketResult_(code, requestedSource, 'manual', false, null, asset['淨值幣別'], '', V81.STATUS.MANUAL, '', '');
      return;
    }
    if (!(toNumber_(quantities[code], 0) > V81.EPSILON)) {
      immediateResults[code] = marketResult_(code, requestedSource, '', false, null, asset['淨值幣別'], '', V81.STATUS.SKIPPED_ZERO_HOLDING, '', '');
      return;
    }
    if (asset['標的類型'] === 'fund') {
      fundRequests.push({ assetCode: code, fundId: cleanText_(asset['基金ID']), requestedSource: requestedSource, currency: cleanText_(asset['淨值幣別']) });
      return;
    }
    var known = sourceSymbolFromCache_(cacheMap[code], code);
    var symbol = asset['標的類型'] === 'us_stock' ? code.toUpperCase() : known || code + '.TW';
    yahooRequests.push({ assetCode: code, symbol: symbol, requestedSource: requestedSource, currency: cleanText_(asset['淨值幣別']), assetType: asset['標的類型'], hadKnownSymbol: Boolean(known) });
  });
  var fetched = {};
  fetchYahooBatch_(yahooRequests).forEach(function (result) { fetched[result.assetCode] = result; });
  var fallbackRequests = [];
  yahooRequests.forEach(function (request) {
    var result = fetched[request.assetCode];
    if (request.assetType !== 'tw_stock' || result.success) return;
    var alternate = /\.TWO$/i.test(request.symbol) ? request.assetCode + '.TW' : request.assetCode + '.TWO';
    fallbackRequests.push(Object.assign({}, request, { symbol: alternate }));
  });
  fetchYahooBatch_(fallbackRequests).forEach(function (result) { fetched[result.assetCode] = result; });
  fetchFundRichBatch_(fundRequests).forEach(function (result) { fetched[result.assetCode] = result; });
  var now = nowSheet_();
  var outputs = [];
  var summary = { success: 0, skipped: 0, failed: 0, requestCount: yahooRequests.length + fallbackRequests.length + fundRequests.length, batchCount: (yahooRequests.length ? 1 : 0) + (fallbackRequests.length ? 1 : 0) + (fundRequests.length ? 1 : 0), results: [] };
  assets.forEach(function (asset) {
    var code = cleanText_(asset['標的代號']);
    var result = fetched[code] || immediateResults[code];
    var existing = Object.assign({}, cacheMap[code] || {}, { '標的代號': code, '淨值幣別': cleanText_(asset['淨值幣別']) });
    if (result.success) {
      existing['最新價格'] = result.price;
      existing['淨值幣別'] = result.priceCurrency || existing['淨值幣別'];
      existing['價格日期'] = result.priceDate;
      existing['更新時間'] = now;
      existing['狀態'] = result.status;
      existing['錯誤訊息'] = '';
      existing['錯誤代碼'] = '';
      existing['資料來源'] = result.actualSource;
      existing['最後嘗試時間'] = now;
      existing['最後成功時間'] = now;
      existing['最後成功來源'] = result.actualSource;
      summary.success++;
    } else if ([V81.STATUS.SKIPPED_ZERO_HOLDING, V81.STATUS.SKIPPED_DISABLED, V81.STATUS.SKIPPED_UPDATE_OFF, V81.STATUS.MANUAL].indexOf(result.status) >= 0) {
      existing['狀態'] = result.status;
      existing['錯誤代碼'] = '';
      existing['錯誤訊息'] = '';
      summary.skipped++;
    } else {
      existing['狀態'] = result.status;
      existing['錯誤代碼'] = result.errorCode;
      existing['錯誤訊息'] = result.errorMessage;
      existing['最後嘗試時間'] = now;
      existing['更新時間'] = now;
      existing['資料來源'] = result.actualSource;
      summary.failed++;
    }
    outputs.push(existing);
    summary.results.push(result);
  });
  writeOutputRows_(V81.SHEETS.PRICE_CACHE, V81.HEADERS.PRICE_CACHE_REQUIRED, outputs);
  setSettingValues_({ LAST_MARKET_REFRESH_AT: now });
  return summary;
}

function refreshExchangeRatesInternal_() {
  ensureHeaders_(V81.SHEETS.FX_CACHE, V81.HEADERS.FX_CACHE_REQUIRED);
  var existingRows = loadFxCache_();
  var existingMap = {};
  existingRows.forEach(function (row) { existingMap[cleanText_(row['幣別組合'])] = row; });
  var requests = [
    { assetCode: 'USD/TWD', symbol: 'TWD=X', requestedSource: 'yahoo', currency: 'TWD' },
    { assetCode: 'JPY/TWD', symbol: 'JPYTWD=X', requestedSource: 'yahoo', currency: 'TWD' }
  ];
  var results = {};
  fetchYahooBatch_(requests).forEach(function (result) { results[result.assetCode] = result; });
  var now = nowSheet_();
  var outputs = [];
  var fixed = Object.assign({}, existingMap['TWD/TWD'] || {}, {
    '幣別組合': 'TWD/TWD', '匯率': 1, '來源幣別': 'TWD', '目標幣別': 'TWD', '資料日期': dateKey_(new Date()),
    '更新時間': now, '狀態': V81.STATUS.SUCCESS, '錯誤訊息': '', '資料來源': 'system_constant', '錯誤代碼': '',
    '最後嘗試時間': now, '最後成功時間': now, '最後成功來源': 'system_constant'
  });
  outputs.push(fixed);
  ['USD/TWD', 'JPY/TWD'].forEach(function (pair) {
    var result = results[pair];
    var sourceCurrency = pair.split('/')[0];
    var row = Object.assign({}, existingMap[pair] || {}, { '幣別組合': pair, '來源幣別': sourceCurrency, '目標幣別': 'TWD' });
    if (result && result.success) {
      row['匯率'] = result.price;
      row['資料日期'] = result.priceDate;
      row['更新時間'] = now;
      row['狀態'] = V81.STATUS.SUCCESS;
      row['錯誤訊息'] = '';
      row['資料來源'] = result.actualSource;
      row['錯誤代碼'] = '';
      row['最後嘗試時間'] = now;
      row['最後成功時間'] = now;
      row['最後成功來源'] = result.actualSource;
    } else {
      row['更新時間'] = now;
      row['狀態'] = result ? result.status : V81.STATUS.FETCH_FAILED;
      row['錯誤訊息'] = result ? result.errorMessage : '無回應';
      row['資料來源'] = result ? result.actualSource : 'yahoo';
      row['錯誤代碼'] = result ? result.errorCode : 'NO_RESULT';
      row['最後嘗試時間'] = now;
    }
    outputs.push(row);
  });
  writeOutputRows_(V81.SHEETS.FX_CACHE, V81.HEADERS.FX_CACHE_REQUIRED, outputs);
  return {
    success: outputs.filter(function (row) { return row['狀態'] === V81.STATUS.SUCCESS; }).length,
    failed: outputs.filter(function (row) { return row['狀態'] !== V81.STATUS.SUCCESS; }).length,
    requestCount: requests.length,
    batchCount: 1,
    results: outputs
  };
}
