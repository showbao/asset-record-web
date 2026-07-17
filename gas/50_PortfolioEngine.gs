function buildPriceMap_(priceRows) {
  var map = {};
  priceRows.forEach(function (row) {
    var code = cleanText_(row['標的代號']);
    if (!code) return;
    map[code] = {
      price: finitePositive_(row['最新價格']),
      currency: cleanText_(row['淨值幣別']),
      priceDate: dateKey_(row['價格日期']),
      updatedAt: row['最後成功時間'] || row['更新時間'] || '',
      source: cleanText_(row['最後成功來源'] || row['資料來源']),
      status: cleanText_(row['狀態'])
    };
  });
  return map;
}

function buildFxMap_(fxRows) {
  var map = { 'TWD/TWD': 1 };
  fxRows.forEach(function (row) {
    var pair = cleanText_(row['幣別組合']);
    var rate = finitePositive_(row['匯率']);
    if (pair && rate) map[pair] = rate;
  });
  return map;
}

function createAssetState_(asset) {
  return {
    asset: asset,
    quantity: 0,
    remainingCostTrade: 0,
    soldCostTrade: 0,
    soldRevenueTrade: 0,
    realizedTrade: 0,
    dividendTrade: 0,
    firstDate: null,
    lastDate: null,
    hasTransactions: false,
    cashFlows: [],
    errors: []
  };
}

function computeInvestmentStateCore_(assets, transactions, priceRows, fxRows, asOfDate) {
  var stateMap = {};
  var valuationDate = toDate_(asOfDate) || new Date();
  assets.forEach(function (asset) { stateMap[cleanText_(asset['標的代號'])] = createAssetState_(asset); });
  sortTransactions_(transactions).forEach(function (transaction) {
    if (cleanText_(transaction['刪除時間'])) return;
    if (!isDateOnOrBefore_(transaction['日期'], valuationDate)) return;
    var code = cleanText_(transaction['標的代號']);
    var state = stateMap[code];
    if (!state) return;
    var type = cleanText_(transaction['交易類型']);
    var quantity = toNumber_(transaction['數量'], 0);
    var actual = toNumber_(transaction['實際入出金額'], 0);
    var date = toDate_(transaction['日期']);
    state.hasTransactions = true;
    if (!state.firstDate || date < state.firstDate) state.firstDate = date;
    if (!state.lastDate || date > state.lastDate) state.lastDate = date;
    if (type === 'buy') {
      state.quantity += quantity;
      state.remainingCostTrade += actual;
      state.cashFlows.push({ date: date, amount: -actual });
    } else if (type === 'sell') {
      if (state.quantity <= V81.EPSILON || quantity - state.quantity > V81.EPSILON) {
        state.errors.push('HISTORICAL_OVERSELL');
      } else {
        var unitCost = state.remainingCostTrade / state.quantity;
        var soldCost = unitCost * quantity;
        state.quantity -= quantity;
        state.remainingCostTrade -= soldCost;
        state.soldCostTrade += soldCost;
        state.soldRevenueTrade += actual;
        state.realizedTrade += actual - soldCost;
        state.cashFlows.push({ date: date, amount: actual });
      }
    } else if (type === 'dividend') {
      state.dividendTrade += actual;
      state.cashFlows.push({ date: date, amount: actual });
    } else if (type === 'stock_dividend') {
      state.quantity += quantity;
    } else if (type === 'split' || type === 'reverse_split') {
      var before = finitePositive_(transaction['分割前股數']);
      var after = finitePositive_(transaction['分割後股數']);
      if (before && after) state.quantity *= after / before;
      else state.errors.push('INVALID_SPLIT_RATIO');
    }
    if (Math.abs(state.quantity) < V81.EPSILON) state.quantity = 0;
    if (Math.abs(state.remainingCostTrade) < V81.EPSILON) state.remainingCostTrade = 0;
  });
  var prices = buildPriceMap_(priceRows);
  var fx = buildFxMap_(fxRows);
  var outputs = Object.keys(stateMap).map(function (code) {
    var state = stateMap[code];
    var asset = state.asset;
    var tradeCurrency = cleanText_(asset['交易幣別']);
    var navCurrency = cleanText_(asset['淨值幣別']);
    var tradeFx = tradeCurrency === 'TWD' ? 1 : finitePositive_(fx[tradeCurrency + '/TWD']);
    var navFx = navCurrency === 'TWD' ? 1 : finitePositive_(fx[navCurrency + '/TWD']);
    var priceInfo = prices[code] || {};
    var price = finitePositive_(priceInfo.price);
    if (state.quantity > V81.EPSILON && !price) state.errors.push('MISSING_PRICE');
    if (state.quantity > V81.EPSILON && !navFx) state.errors.push('MISSING_NAV_FX');
    if ((state.remainingCostTrade || state.soldCostTrade || state.soldRevenueTrade || state.dividendTrade) && !tradeFx) state.errors.push('MISSING_TRADE_FX');
    var marketNav = price ? state.quantity * price : null;
    var marketTwd = marketNav != null && navFx ? marketNav * navFx : null;
    var remainingCostTwd = tradeFx ? state.remainingCostTrade * tradeFx : null;
    var soldCostTwd = tradeFx ? state.soldCostTrade * tradeFx : null;
    var soldRevenueTwd = tradeFx ? state.soldRevenueTrade * tradeFx : null;
    var realizedTwd = tradeFx ? state.realizedTrade * tradeFx : null;
    var dividendTwd = tradeFx ? state.dividendTrade * tradeFx : null;
    var unrealizedTwd = marketTwd != null && remainingCostTwd != null ? marketTwd - remainingCostTwd : null;
    var totalProfitTwd = realizedTwd != null && dividendTwd != null && unrealizedTwd != null ? realizedTwd + dividendTwd + unrealizedTwd : null;
    var investedBaseTwd = remainingCostTwd != null && soldCostTwd != null ? remainingCostTwd + soldCostTwd : null;
    var returnRate = investedBaseTwd && totalProfitTwd != null ? totalProfitTwd / investedBaseTwd : null;
    var unrealizedRate = remainingCostTwd && unrealizedTwd != null ? unrealizedTwd / remainingCostTwd : null;
    var xirrFlows = state.cashFlows.slice();
    if (state.quantity > V81.EPSILON && marketTwd != null && tradeFx) xirrFlows.push({ date: valuationDate, amount: marketTwd / tradeFx });
    var xirr = xirr_(xirrFlows);
    var averageCost = state.quantity > V81.EPSILON ? state.remainingCostTrade / state.quantity : 0;
    var status = state.errors.length ? state.errors.join('|') : '正常';
    return {
      code: code,
      name: cleanText_(asset['標的名稱']),
      category: assetCategoryLabel_(asset['標的類型']),
      assetType: cleanText_(asset['標的類型']),
      tradeCurrency: tradeCurrency,
      navCurrency: navCurrency,
      quantity: round_(state.quantity, 8),
      averageCost: round_(averageCost, 8),
      remainingCostTrade: round_(state.remainingCostTrade, 8),
      soldCostTrade: round_(state.soldCostTrade, 8),
      soldRevenueTrade: round_(state.soldRevenueTrade, 8),
      realizedTrade: round_(state.realizedTrade, 8),
      dividendTrade: round_(state.dividendTrade, 8),
      price: price,
      priceDate: priceInfo.priceDate || '',
      priceUpdatedAt: priceInfo.updatedAt || '',
      marketNav: marketNav == null ? null : round_(marketNav, 8),
      tradeFx: tradeFx,
      navFx: navFx,
      marketTwd: marketTwd == null ? null : round_(marketTwd, 8),
      remainingCostTwd: remainingCostTwd == null ? null : round_(remainingCostTwd, 8),
      soldCostTwd: soldCostTwd == null ? null : round_(soldCostTwd, 8),
      soldRevenueTwd: soldRevenueTwd == null ? null : round_(soldRevenueTwd, 8),
      realizedTwd: realizedTwd == null ? null : round_(realizedTwd, 8),
      dividendTwd: dividendTwd == null ? null : round_(dividendTwd, 8),
      unrealizedTwd: unrealizedTwd == null ? null : round_(unrealizedTwd, 8),
      totalProfitTwd: totalProfitTwd == null ? null : round_(totalProfitTwd, 8),
      unrealizedRate: unrealizedRate,
      returnRate: returnRate,
      xirr: xirr,
      firstDate: state.firstDate,
      lastDate: state.lastDate,
      holding: state.quantity > V81.EPSILON,
      assetStatus: state.quantity > V81.EPSILON ? '持有中' : state.hasTransactions ? '已出清' : '無交易',
      enabled: toBoolean_(asset['是否啟用'], false),
      status: status,
      errorMessage: state.errors.join('；'),
      calculationTime: valuationDate
    };
  });
  var totalMarket = outputs.reduce(function (sum, row) { return sum + (row.marketTwd || 0); }, 0);
  var totalProfit = outputs.reduce(function (sum, row) { return sum + (row.totalProfitTwd || 0); }, 0);
  outputs.forEach(function (row) {
    row.assetShare = totalMarket > V81.EPSILON && row.marketTwd != null ? row.marketTwd / totalMarket : 0;
    row.profitContribution = Math.abs(totalProfit) > V81.EPSILON && row.totalProfitTwd != null ? row.totalProfitTwd / totalProfit : 0;
  });
  return outputs;
}

function calculationRow_(state) {
  return {
    '計算鍵': state.code,
    '類別': state.category,
    '標的代號': state.code,
    '標的名稱': state.name,
    '帳戶ID': '',
    '帳戶名稱': '',
    '交易幣別': state.tradeCurrency,
    '淨值幣別': state.navCurrency,
    '持有數量': state.quantity,
    '平均成本_交易幣別': state.averageCost,
    '剩餘成本_交易幣別': state.remainingCostTrade,
    '累計售出成本_交易幣別': state.soldCostTrade,
    '累計售出收入_交易幣別': state.soldRevenueTrade,
    '已實現損益_交易幣別': state.realizedTrade,
    '累積股息_交易幣別': state.dividendTrade,
    '最新價格_淨值幣別': state.price == null ? '' : state.price,
    '市值_淨值幣別': state.marketNav == null ? '' : state.marketNav,
    '成本幣別匯率_TWD': state.tradeFx == null ? '' : state.tradeFx,
    '淨值幣別匯率_TWD': state.navFx == null ? '' : state.navFx,
    '市值_TWD': state.marketTwd == null ? '' : state.marketTwd,
    '剩餘成本_TWD': state.remainingCostTwd == null ? '' : state.remainingCostTwd,
    '累計售出成本_TWD': state.soldCostTwd == null ? '' : state.soldCostTwd,
    '累計售出收入_TWD': state.soldRevenueTwd == null ? '' : state.soldRevenueTwd,
    '已實現損益_TWD': state.realizedTwd == null ? '' : state.realizedTwd,
    '累積股息_TWD': state.dividendTwd == null ? '' : state.dividendTwd,
    '未實現損益_TWD': state.unrealizedTwd == null ? '' : state.unrealizedTwd,
    '累積總損益_TWD': state.totalProfitTwd == null ? '' : state.totalProfitTwd,
    '未實現報酬率': state.unrealizedRate == null ? '' : state.unrealizedRate,
    '累積交易報酬率': state.returnRate == null ? '' : state.returnRate,
    '是否持有': state.holding,
    '最後交易日期': state.lastDate || '',
    '價格更新時間': state.priceUpdatedAt || '',
    '計算時間': state.calculationTime,
    '狀態': state.status,
    '錯誤訊息': state.errorMessage,
    '資產占比': state.assetShare,
    '整體投資報酬率': state.returnRate == null ? '' : state.returnRate,
    'XIRR': state.xirr == null ? '' : state.xirr,
    '首次交易日': state.firstDate || '',
    '標的狀態': state.assetStatus,
    '歷史售出成本_交易幣別': state.soldCostTrade,
    '歷史售出收入_交易幣別': state.soldRevenueTrade,
    '目前價格_淨值幣別': state.price == null ? '' : state.price,
    '價格日期': state.priceDate || '',
    '成本匯率_TWD': state.tradeFx == null ? '' : state.tradeFx,
    '淨值匯率_TWD': state.navFx == null ? '' : state.navFx,
    '目前市值_TWD': state.marketTwd == null ? '' : state.marketTwd,
    '歷史售出成本_TWD': state.soldCostTwd == null ? '' : state.soldCostTwd,
    '歷史售出收入_TWD': state.soldRevenueTwd == null ? '' : state.soldRevenueTwd,
    '最後交易日': state.lastDate || '',
    '資料狀態': state.status
  };
}

function performanceRow_(state) {
  return {
    '類別': state.category,
    '標的代號': state.code,
    '標的名稱': state.name,
    '狀態': state.assetStatus,
    '持有數量': state.quantity,
    '目前市值_TWD': state.marketTwd == null ? '' : state.marketTwd,
    '剩餘成本_TWD': state.remainingCostTwd == null ? '' : state.remainingCostTwd,
    '歷史售出成本_TWD': state.soldCostTwd == null ? '' : state.soldCostTwd,
    '歷史售出收入_TWD': state.soldRevenueTwd == null ? '' : state.soldRevenueTwd,
    '已實現損益_TWD': state.realizedTwd == null ? '' : state.realizedTwd,
    '未實現損益_TWD': state.unrealizedTwd == null ? '' : state.unrealizedTwd,
    '累積股息_TWD': state.dividendTwd == null ? '' : state.dividendTwd,
    '累積總損益_TWD': state.totalProfitTwd == null ? '' : state.totalProfitTwd,
    '累積交易報酬率': state.returnRate == null ? '' : state.returnRate,
    '目前資產占比': state.assetShare,
    '損益貢獻度': state.profitContribution,
    '首次交易日': state.firstDate || '',
    '最後交易日': state.lastDate || '',
    '更新時間': state.calculationTime,
    '平均成本': state.averageCost,
    '目前價格': state.price == null ? '' : state.price,
    '價格日期': state.priceDate || '',
    '資產占比': state.assetShare,
    '整體投資報酬率': state.returnRate == null ? '' : state.returnRate,
    'XIRR（年化）': state.xirr == null ? '' : state.xirr
  };
}

function aggregateCategories_(states) {
  var order = ['台股', '美股', '基金'];
  var totalMarket = states.reduce(function (sum, row) { return sum + (row.marketTwd || 0); }, 0);
  var totalProfit = states.reduce(function (sum, row) { return sum + (row.totalProfitTwd || 0); }, 0);
  return order.map(function (category) {
    var rows = states.filter(function (row) { return row.category === category; });
    function sum(field) { return rows.reduce(function (value, row) { return value + (row[field] || 0); }, 0); }
    var market = sum('marketTwd');
    var remainingCost = sum('remainingCostTwd');
    var soldCost = sum('soldCostTwd');
    var soldRevenue = sum('soldRevenueTwd');
    var realized = sum('realizedTwd');
    var unrealized = sum('unrealizedTwd');
    var dividend = sum('dividendTwd');
    var profit = sum('totalProfitTwd');
    var base = remainingCost + soldCost;
    return {
      '類別': category,
      '持有標的數': rows.filter(function (row) { return row.holding; }).length,
      '目前市值_TWD': market,
      '剩餘成本_TWD': remainingCost,
      '歷史售出成本_TWD': soldCost,
      '歷史售出收入_TWD': soldRevenue,
      '已實現損益_TWD': realized,
      '未實現損益_TWD': unrealized,
      '累積股息_TWD': dividend,
      '累積總損益_TWD': profit,
      '累積交易報酬率': base > V81.EPSILON ? profit / base : '',
      '目前持倉占比': totalMarket > V81.EPSILON ? market / totalMarket : 0,
      '損益貢獻度': Math.abs(totalProfit) > V81.EPSILON ? profit / totalProfit : 0,
      '標的數': rows.length,
      '資產占比': totalMarket > V81.EPSILON ? market / totalMarket : 0,
      '整體投資報酬率': base > V81.EPSILON ? profit / base : '',
      '更新時間': new Date()
    };
  });
}

function refreshDashboardV81_(states, categories) {
  var sheet = getSheet_(V81.SHEETS.DASHBOARD);
  var width = Math.max(sheet.getLastColumn(), 18);
  var height = 17;
  var matrix = Array.from({ length: height }, function () { return Array(width).fill(''); });
  var totalMarket = states.reduce(function (sum, row) { return sum + (row.marketTwd || 0); }, 0);
  var remainingCost = states.reduce(function (sum, row) { return sum + (row.remainingCostTwd || 0); }, 0);
  var realized = states.reduce(function (sum, row) { return sum + (row.realizedTwd || 0); }, 0);
  var unrealized = states.reduce(function (sum, row) { return sum + (row.unrealizedTwd || 0); }, 0);
  var dividend = states.reduce(function (sum, row) { return sum + (row.dividendTwd || 0); }, 0);
  var totalProfit = realized + unrealized + dividend;
  var soldCost = states.reduce(function (sum, row) { return sum + (row.soldCostTwd || 0); }, 0);
  var totalBase = remainingCost + soldCost;
  matrix[0][0] = '資產記錄｜投資總覽';
  matrix[1][0] = 'V8.1 只顯示目前投資部位與績效；外部資金基準尚未建立，投資池現金與淨資產不發布。';
  matrix[3][0] = '核心指標';
  matrix[4][0] = '投資部位市值_TWD'; matrix[4][1] = totalMarket;
  matrix[4][2] = '投資池現金_TWD'; matrix[4][3] = '未建立基準';
  matrix[4][4] = '投資淨資產_TWD'; matrix[4][5] = '未建立基準';
  matrix[4][6] = '累積外部淨投入_TWD'; matrix[4][7] = '未建立基準';
  matrix[6][0] = '剩餘成本_TWD'; matrix[6][1] = remainingCost;
  matrix[6][2] = '已實現損益_TWD'; matrix[6][3] = realized;
  matrix[6][4] = '未實現損益_TWD'; matrix[6][5] = unrealized;
  matrix[6][6] = '累積股息_TWD'; matrix[6][7] = dividend;
  matrix[8][0] = '累積總損益_TWD'; matrix[8][1] = totalProfit;
  matrix[8][2] = '整體投資報酬率'; matrix[8][3] = totalBase > V81.EPSILON ? totalProfit / totalBase : '';
  matrix[8][4] = '持有標的數'; matrix[8][5] = states.filter(function (row) { return row.holding; }).length;
  matrix[8][6] = '資料更新時間'; matrix[8][7] = new Date();
  matrix[10][0] = '資產類別彙總';
  ['類別', '持有標的數', '市值_TWD', '剩餘成本_TWD', '未實現損益_TWD', '已實現損益_TWD', '累積股息_TWD', '累積總損益_TWD', '資產占比'].forEach(function (header, index) { matrix[11][index] = header; });
  categories.forEach(function (row, index) {
    var target = matrix[12 + index];
    target[0] = row['類別']; target[1] = row['持有標的數']; target[2] = row['目前市值_TWD']; target[3] = row['剩餘成本_TWD'];
    target[4] = row['未實現損益_TWD']; target[5] = row['已實現損益_TWD']; target[6] = row['累積股息_TWD']; target[7] = row['累積總損益_TWD']; target[8] = row['資產占比'];
  });
  var total = matrix[15];
  total[0] = '合計'; total[1] = states.filter(function (row) { return row.holding; }).length; total[2] = totalMarket; total[3] = remainingCost;
  total[4] = unrealized; total[5] = realized; total[6] = dividend; total[7] = totalProfit; total[8] = totalMarket > 0 ? 1 : 0;
  var lastRow = sheet.getLastRow();
  if (lastRow > 0) sheet.getRange(1, 1, lastRow, width).clearContent();
  sheet.getRange(1, 1, matrix.length, width).setValues(matrix);
  return { rows: matrix.length, columns: width };
}

function rebuildInvestmentStateInternal_(options) {
  options = options || {};
  var assets = loadAssets_();
  var transactions = loadTransactions_(false);
  var prices = loadPriceCache_();
  var fx = loadFxCache_();
  var states = computeInvestmentStateCore_(assets, transactions, prices, fx, options.asOfDate || new Date());
  var categories = aggregateCategories_(states);
  var writes = [];
  writes.push(writeOutputRows_(V81.SHEETS.CALCULATION, V81.HEADERS.CALCULATION_REQUIRED, states.map(calculationRow_)));
  writes.push(writeOutputRows_(V81.SHEETS.PERFORMANCE, V81.HEADERS.PERFORMANCE_REQUIRED, states.map(performanceRow_)));
  writes.push(writeOutputRows_(V81.SHEETS.CATEGORY_PERFORMANCE, V81.HEADERS.CATEGORY_REQUIRED, categories));
  if (V81.VERSION === '8.1.0') writes.push(refreshDashboardV81_(states, categories));
  else writes.push({ sheet: V81.SHEETS.DASHBOARD, deferredTo: 'refreshDashboardInternalV82_' });
  var now = nowSheet_();
  setSettingValues_({ LAST_REBUILD_AT: now, NEEDS_RECALC: 'FALSE' });
  return {
    stateCount: states.length,
    holdingCount: states.filter(function (row) { return row.holding; }).length,
    errorCount: states.filter(function (row) { return row.status !== '正常'; }).length,
    states: states,
    categories: categories,
    writes: writes
  };
}

function rebuildInvestmentState(options) {
  try {
    assertMutationAllowedV84_();
    return withDocumentLock_(function () {
      var data = rebuildInvestmentStateInternal_(options || {});
      return apiResult_(data.errorCount === 0, data.errorCount === 0 ? 'OK' : 'REBUILD_WITH_ERRORS', data.errorCount === 0 ? '集中重算完成' : '集中重算完成但有資料錯誤', data);
    });
  } catch (error) {
    return apiResult_(false, 'REBUILD_FAILED', error.message, {});
  }
}
