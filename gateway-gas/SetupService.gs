function getSystemStatusV840_(context) {
  var settings = readSettingsV840_(context.spreadsheet);
  return {
    spreadsheet: safeSpreadsheetInfoV840_(Object.assign({}, context, { settings: settings })),
    ready: cleanTextV840_(settings.SETUP_STATUS) === 'READY' && cleanTextV840_(settings.FILE_ROLE) === 'PRODUCTION' && !booleanV840_(settings.IS_BACKUP, false),
    requiresFirstTimeSetup: cleanTextV840_(settings.SETUP_STATUS) !== 'READY',
    setupMode: cleanTextV840_(settings.SETUP_MODE) || null,
    setupAt: isoDateTimeV840_(settings.SETUP_AT),
    dailyJobEnabled: booleanV840_(settings.DAILY_JOB_ENABLED, false),
    dailyJobTime: cleanTextV840_(settings.DAILY_JOB_TIME) || '18:30'
  };
}

function initializeNewSystemV840_(context) {
  var status = getSystemStatusV840_(context);
  if (status.ready) return Object.assign({ initialized: true, alreadyReady: true }, status);
  return Object.assign({
    initialized: false,
    alreadyReady: false,
    userActionRequired: true,
    instruction: '請在這份 Google Sheet 依序選擇「擴充功能 → Apps Script」授權，然後從「資產記錄」選單執行「首次建置」。完成後回到此頁重新驗證。'
  }, status);
}

function jobStatusV840_(context) {
  var settings = readSettingsV840_(context.spreadsheet);
  function job(prefix) {
    return {
      status: cleanTextV840_(settings[prefix + '_STATUS']) || 'idle',
      requestedAt: isoDateTimeV840_(settings[prefix + '_REQUESTED_AT']),
      startedAt: isoDateTimeV840_(settings[prefix + '_STARTED_AT']),
      finishedAt: isoDateTimeV840_(settings[prefix + '_FINISHED_AT']),
      error: cleanTextV840_(settings[prefix + '_ERROR']) || null
    };
  }
  var cursor = null; try { cursor = cleanTextV840_(settings.TREND_REBUILD_CURSOR) ? JSON.parse(settings.TREND_REBUILD_CURSOR) : null; } catch (ignore) {}
  return {
    needsRecalc: booleanV840_(settings.NEEDS_RECALC, false),
    daily: { enabled: booleanV840_(settings.DAILY_JOB_ENABLED, false), time: cleanTextV840_(settings.DAILY_JOB_TIME) || '18:30', lastRunAt: isoDateTimeV840_(settings.LAST_DAILY_JOB_AT), status: cleanTextV840_(settings.LAST_DAILY_JOB_STATUS) || null },
    marketRefresh: job('MARKET_REFRESH'), rebuild: job('REBUILD'), trendCursor: cursor, lastTrendSnapshotDate: isoDateV840_(settings.LAST_TREND_SNAPSHOT_DATE)
  };
}

function requestJobV840_(context, kind) {
  return withUserLockV840_(function () {
    var prefix = kind === 'market' ? 'MARKET_REFRESH' : 'REBUILD'; var settings = readSettingsV840_(context.spreadsheet); var current = cleanTextV840_(settings[prefix + '_STATUS']);
    if (current !== 'pending' && current !== 'running') {
      var updates = {}; updates[prefix + '_STATUS'] = 'pending'; updates[prefix + '_REQUESTED_AT'] = nowV840_(); updates[prefix + '_STARTED_AT'] = ''; updates[prefix + '_FINISHED_AT'] = ''; updates[prefix + '_ERROR'] = '';
      if (kind === 'rebuild') updates.NEEDS_RECALC = 'TRUE'; writeSettingsV840_(context.spreadsheet, updates);
    }
    return jobStatusV840_(context);
  });
}
