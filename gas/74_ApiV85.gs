var V85_ACTION_ALIASES = Object.freeze({
  'transactions.list': 'listTransactions',
  'transactions.create': 'createTransaction',
  'transactions.update': 'updateTransaction',
  'transactions.delete': 'deleteTransaction',
  'transactions.restore': 'restoreTransaction',
  'cashflows.list': 'listExternalCashFlows',
  'cashflows.create': 'createExternalCashFlow',
  'cashflows.update': 'updateExternalCashFlow',
  'cashflows.delete': 'deleteExternalCashFlow',
  'cashflows.restore': 'restoreExternalCashFlow',
  'system.requestRebuild': 'requestRebuild',
  'system.requestMarketRefresh': 'requestMarketRefresh'
});

function downsampleTrendV85_(rows, maximumPoints) {
  maximumPoints = Math.max(2, Number(maximumPoints) || 180);
  if ((rows || []).length <= maximumPoints) return rows || [];
  var sampled = [];
  var lastIndex = -1;
  for (var point = 0; point < maximumPoints; point++) {
    var index = Math.round(point * (rows.length - 1) / (maximumPoints - 1));
    if (index !== lastIndex) sampled.push(rows[index]);
    lastIndex = index;
  }
  return sampled;
}

function dashboardTrendSeriesV85_() {
  var rows = readTable_(V81.SHEETS.TREND, { requiredHeaders: V81.HEADERS.TREND, idHeader: '取樣日期' }).rows;
  rows.sort(function (a, b) { return dateKey_(a['取樣日期']).localeCompare(dateKey_(b['取樣日期'])); });
  var mapped = rows.map(trendToApiV83_);
  var maximumDate = rows.length ? dateKey_(rows[rows.length - 1]['取樣日期']) : '';
  var cutoff = maximumDate ? rollingSixMonthCutoffV82_(maximumDate) : '';
  var recent = mapped.filter(function (row) { return !cutoff || row.date >= cutoff; });
  return { longTerm: downsampleTrendV85_(mapped, 180), sixMonth: downsampleTrendV85_(recent, 180) };
}

function dashboardOverviewApiV85_(params) {
  params = ensureAllowedKeysV83_(params || {}, ['summaryOnly'], 'params');
  var dashboard = getDashboardSummaryApiV83_();
  var summary = dashboard.summary;
  var jobs = getJobStatusApiV83_();
  var allTrend = [];
  var sixMonthTrend = [];
  if (!toBoolean_(params.summaryOnly, false)) {
    var trends = dashboardTrendSeriesV85_();
    allTrend = trends.longTerm;
    sixMonthTrend = trends.sixMonth;
  }
  var alerts = [];
  if (summary.warning) alerts.push({ level: 'warning', message: summary.warning });
  if (dashboard.meta.needsRecalc) alerts.push({ level: 'warning', message: '原始資料已變更，等待集中重算。' });
  if (jobs.marketRefresh && jobs.marketRefresh.error) alerts.push({ level: 'warning', message: '市場資料更新有異常，請至系統頁查看。' });
  if (jobs.daily && jobs.daily.status && ['PASS', 'SUCCESS'].indexOf(jobs.daily.status) < 0) alerts.push({ level: 'warning', message: '每日排程最近一次未完全成功。' });
  return {
    summary: {
      netAssetTwd: summary.netAssetTwd,
      externalNetContributionTwd: summary.externalNetContributionTwd,
      totalPnlTwd: summary.totalPnlTwd,
      cashTwd: summary.cashTwd,
      totalReturn: summary.totalReturn,
      xirr: summary.xirr
    },
    longTermTrend: allTrend,
    sixMonthTrend: sixMonthTrend,
    allocation: [
      { key: 'tw_stock', label: '台股', valueTwd: summary.allocation.twStockTwd },
      { key: 'us_stock', label: '美股', valueTwd: summary.allocation.usStockTwd },
      { key: 'fund', label: '基金', valueTwd: summary.allocation.fundTwd },
      { key: 'cash', label: '現金', valueTwd: summary.allocation.cashTwd }
    ],
    alerts: alerts.slice(0, 3),
    systemStatus: {
      updatedAt: summary.updatedAt,
      oldestPriceDate: summary.oldestPriceDate,
      needsRecalc: dashboard.meta.needsRecalc,
      dailyEnabled: Boolean(jobs.daily && jobs.daily.enabled),
      dailyStatus: jobs.daily && jobs.daily.status || null,
      lastDailyRunAt: jobs.daily && jobs.daily.lastRunAt || null,
      systemMode: jobs.systemMode || V84_BACKUP.MODES.NORMAL
    }
  };
}

function instrumentsListApiV85_(params, options) {
  params = ensureAllowedKeysV83_(params || {}, ['page', 'pageSize', 'query', 'type', 'enabled', 'status'], 'params');
  var page = params.page || 1;
  var pageSize = params.pageSize || 40;
  var assets = listAssetsApiV83_({ page: page, pageSize: pageSize, query: params.query || '', type: params.type || '', enabled: params.enabled == null ? 'all' : params.enabled }, options);
  var status = cleanText_(params.status) || 'all';
  var category = cleanText_(params.type) ? assetCategoryLabel_(params.type) : '';
  var performance = getPerformanceListApiV83_({ page: page, pageSize: pageSize, query: params.query || '', category: category, status: status });
  return { assets: assets, performance: performance, meta: assets.meta };
}

function systemStatusApiV85_(options) {
  var jobs = getJobStatusApiV83_(options);
  var status = authStatusApiV85_(options);
  var activeSessions = pruneExpiredSessionsV85_(readSessionsV85_(options), options).length;
  return {
    version: V81.VERSION,
    schemaVersion: V81.SCHEMA_VERSION,
    auth: { configured: status.configured, mode: status.mode, locked: status.locked, lockedUntil: status.lockedUntil, activeSessions: activeSessions, maximumSessions: V85_AUTH.MAX_SESSIONS },
    jobs: jobs,
    meta: apiMetaV83_()
  };
}

function routeApiActionV85_(action, params, payload, options, requestId) {
  if (action === 'dashboard.getOverview') return apiResult_(true, 'OK', '', dashboardOverviewApiV85_(params));
  if (action === 'instruments.list') return apiResult_(true, 'OK', '', instrumentsListApiV85_(params, options));
  if (action === 'system.getStatus') return apiResult_(true, 'OK', '', systemStatusApiV85_(options));
  if (action === 'snapshots.rebuildAll') {
    if (!(options && ((options.serviceContext && options.serviceContext.sheets) || options.properties))) { assertPrimarySpreadsheet_(); assertSystemWritableV84_(); }
    return requestJobApiV83_('rebuild', options);
  }
  if (action === 'system.reset') throwApiErrorV83_('VALIDATION_ERROR', '系統重設僅能由 Google Sheet 執行');
  var mapped = V85_ACTION_ALIASES[action] || action;
  return routeApiActionV83_(mapped, params, payload, options, requestId);
}

function authenticateApiRequestV85_(request, action, options) {
  if (isPublicAuthActionV85_(action)) return null;
  if (isAuthActionV85_(action)) return requireSessionV85_(request.sessionToken, options);
  if (cleanText_(request.sessionToken)) return requireSessionV85_(request.sessionToken, options);
  throwApiErrorV83_('AUTH_REQUIRED', '請先登入');
}
