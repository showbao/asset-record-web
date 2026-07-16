var V840_TEMPLATE_NAME = '資產記錄_空白範本_v8.4';
var V840_BACKUP_FOLDER_NAME = '資產記錄備份';

function getSystemVersion() {
  return {
    appId: 'ASSET_RECORD',
    version: V81.VERSION,
    schemaVersion: V81.SCHEMA_VERSION,
    stableHandlers: ['dailyAssetMaintenance', 'installOrRepairDailyTrigger', 'validateSystem', 'getSystemVersion']
  };
}

function firstTimeSetup() {
  try {
    return withDocumentLock_(function () {
      var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      if (!spreadsheet) throw new Error('首次建置必須從綁定的 Google Sheet 執行');
      if (spreadsheet.getName() === V840_TEMPLATE_NAME) throw new Error('正式空白範本本身不可建置；請先建立自己的副本');

      var before = getSettingsMapSafeV840_();
      var setupStatus = cleanText_(before.SETUP_STATUS);
      var fileRole = cleanText_(before.FILE_ROLE || 'TEMPLATE');
      var alreadyReady = setupStatus === 'READY';
      var recoverableProduction = fileRole === 'PRODUCTION'
        && !toBoolean_(before.IS_BACKUP, false)
        && cleanText_(before.SPREADSHEET_ID) === spreadsheet.getId()
        && (!cleanText_(before.SCRIPT_ID) || cleanText_(before.SCRIPT_ID) === ScriptApp.getScriptId())
        && ['RUNNING', 'FAILED'].indexOf(setupStatus) >= 0;
      if (!alreadyReady && fileRole !== 'TEMPLATE' && !recoverableProduction) {
        throw new Error('目前檔案不是正式範本副本，拒絕首次建置');
      }

      if (!alreadyReady) {
        if (fileRole === 'TEMPLATE') PropertiesService.getScriptProperties().deleteAllProperties();
        setSettingValues_({ SETUP_STATUS: 'RUNNING' });
      }

      spreadsheet.setSpreadsheetTimeZone(V81.TIMEZONE);
      var schema = ensureV81Schema_();
      var sequences = initializeIdSequences_();
      setSettingValues_({
        APP_ID: 'ASSET_RECORD',
        SYSTEM_VERSION: V81.VERSION,
        SCHEMA_VERSION: V81.SCHEMA_VERSION,
        FILE_ROLE: 'PRODUCTION',
        IS_BACKUP: 'FALSE',
        SPREADSHEET_ID: spreadsheet.getId(),
        SCRIPT_ID: ScriptApp.getScriptId(),
        TIMEZONE: V81.TIMEZONE,
        BASE_CURRENCY: V81.BASE_CURRENCY,
        DAILY_JOB_TIME: '18:30',
        LAST_VALIDATION_STATUS: 'PENDING'
      });

      applyV81Validations_();
      applyNumberFormatsByHeaderV831_(V81.SHEETS.PERFORMANCE, performanceNumberFormatsV831_());
      var visibility = hideSystemSheetsV840_();
      var trigger = installOrRepairDailyTrigger();
      var settings = getSettingsMapSafeV840_();
      var backup = cleanText_(settings.INITIAL_BACKUP_ID)
        ? { id: cleanText_(settings.INITIAL_BACKUP_ID), reused: true }
        : createBackupInternalV840_('首次建置完成', true);
      var validation = validateSystemStructureV840_();
      if (!validation.success) throw new Error('首次建置結構驗證失敗：' + validation.failedChecks.join('、'));

      setSettingValues_({
        SETUP_STATUS: 'READY',
        SETUP_AT: cleanText_(settings.SETUP_AT) || nowSheet_(),
        SETUP_BY: cleanText_(settings.SETUP_BY) || activeUserEmailV840_(),
        INITIAL_BACKUP_ID: backup.id,
        DAILY_JOB_ENABLED: 'TRUE',
        LAST_VALIDATION_AT: nowSheet_(),
        LAST_VALIDATION_STATUS: 'PASS'
      });
      try { onOpen(); }
      catch (menuError) { console.warn('首次建置已完成，但目前執行環境無法立即刷新選單：' + menuError.message); }
      var result = apiResult_(true, alreadyReady ? 'ALREADY_READY' : 'OK', alreadyReady ? '首次建置已完成，本次僅執行安全修復' : '首次建置完成', {
        spreadsheetId: spreadsheet.getId(),
        scriptId: ScriptApp.getScriptId(),
        schema: schema,
        sequences: sequences,
        visibility: visibility,
        trigger: trigger,
        initialBackup: backup,
        validation: validation
      });
      console.log(JSON.stringify(result));
      return result;
    });
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    try { setSettingValues_({ SETUP_STATUS: 'FAILED', LAST_VALIDATION_STATUS: 'FAIL' }); } catch (ignore) {}
    return apiResult_(false, 'FIRST_TIME_SETUP_FAILED', error.message, {});
  }
}

function installV840() {
  return firstTimeSetup();
}

function activeUserEmailV840_() {
  return cleanText_(Session.getActiveUser().getEmail()) || cleanText_(Session.getEffectiveUser().getEmail());
}

function getSettingsMapSafeV840_() {
  try { return getSettingsMap_(); } catch (ignore) { return {}; }
}

function hideSystemSheetsV840_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var visible = [V81.SHEETS.DASHBOARD, V81.SHEETS.PERFORMANCE, V81.SHEETS.TRANSACTIONS, V81.SHEETS.ASSETS, V81.SHEETS.CASH_FLOWS];
  var hidden = [];
  spreadsheet.getSheets().forEach(function (sheet) {
    if (visible.indexOf(sheet.getName()) >= 0) sheet.showSheet();
    else {
      sheet.hideSheet();
      hidden.push(sheet.getName());
    }
  });
  return { visible: visible, hidden: hidden };
}

function backupFolderV840_() {
  var folders = DriveApp.getFoldersByName(V840_BACKUP_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(V840_BACKUP_FOLDER_NAME);
}

function setBackupMarkersV840_(spreadsheetId, sourceId, reason) {
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheet = spreadsheet.getSheetByName(V81.SHEETS.SETTINGS);
  if (!sheet) throw new Error('備份缺少系統設定分頁');
  var values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 3).getValues();
  var updates = {
    APP_ID: 'ASSET_RECORD',
    FILE_ROLE: 'BACKUP',
    IS_BACKUP: 'TRUE',
    BACKUP_SOURCE_ID: sourceId,
    BACKUP_REASON: reason,
    BACKUP_CREATED_AT: nowSheet_()
  };
  var map = {};
  for (var row = 1; row < values.length; row++) if (cleanText_(values[row][0])) map[cleanText_(values[row][0])] = row;
  Object.keys(updates).forEach(function (key) {
    if (map[key] == null) {
      map[key] = values.length;
      values.push([key, updates[key], 'v8.4 備份識別資料']);
    } else values[map[key]][1] = updates[key];
  });
  if (sheet.getMaxRows() < values.length) sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
  sheet.getRange(1, 1, values.length, 3).setValues(values);
}

function createBackupInternalV840_(reason, initial) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var stamp = Utilities.formatDate(new Date(), V81.TIMEZONE, 'yyyyMMdd_HHmm');
  var name = '資產記錄_備份_' + stamp + '_v' + V81.VERSION + (reason ? '_' + cleanText_(reason).replace(/[\\/:*?"<>|]/g, '_') : '');
  var copy = DriveApp.getFileById(spreadsheet.getId()).makeCopy(name, backupFolderV840_());
  setBackupMarkersV840_(copy.getId(), spreadsheet.getId(), reason || '手動備份');
  if (initial) setSettingValues_({ INITIAL_BACKUP_ID: copy.getId() });
  return { id: copy.getId(), name: copy.getName(), url: copy.getUrl(), reason: reason || '手動備份', initial: Boolean(initial), reused: false };
}

function createManualBackup() {
  try {
    return withDocumentLock_(function () {
      var settings = getSettingsMapSafeV840_();
      if (cleanText_(settings.APP_ID) !== 'ASSET_RECORD' || cleanText_(settings.FILE_ROLE) !== 'PRODUCTION') throw new Error('只有正式資產記錄檔可以建立備份');
      return apiResult_(true, 'OK', '備份建立完成', createBackupInternalV840_('手動備份', false));
    });
  } catch (error) {
    return apiResult_(false, 'BACKUP_FAILED', error.message, {});
  }
}

function validateSystemStructureV840_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var checks = [];
  function check(name, ok, details) { checks.push({ name: name, ok: Boolean(ok), details: details == null ? '' : details }); }
  var requiredSheets = Object.keys(V81.SHEETS).map(function (key) { return V81.SHEETS[key]; });
  var missingSheets = requiredSheets.filter(function (name) { return !spreadsheet.getSheetByName(name); });
  check('必要分頁完整', missingSheets.length === 0, missingSheets);
  var settings = getSettingsMapSafeV840_();
  check('APP_ID 正確', cleanText_(settings.APP_ID) === 'ASSET_RECORD', settings.APP_ID);
  check('版本正確', cleanText_(settings.SYSTEM_VERSION) === V81.VERSION && cleanText_(settings.SCHEMA_VERSION) === V81.SCHEMA_VERSION, { version: settings.SYSTEM_VERSION, schema: settings.SCHEMA_VERSION });
  check('正式檔識別正確', cleanText_(settings.FILE_ROLE) === 'PRODUCTION' && !toBoolean_(settings.IS_BACKUP, false), { role: settings.FILE_ROLE, isBackup: settings.IS_BACKUP });
  check('Spreadsheet ID 正確', cleanText_(settings.SPREADSHEET_ID) === spreadsheet.getId(), settings.SPREADSHEET_ID);
  check('Script ID 正確', cleanText_(settings.SCRIPT_ID) === ScriptApp.getScriptId(), settings.SCRIPT_ID);
  var performance = spreadsheet.getSheetByName(V81.SHEETS.PERFORMANCE);
  var headers = performance ? performance.getRange(1, 1, 1, performance.getLastColumn()).getValues()[0].map(cleanText_) : [];
  check('單一 XIRR（年化）欄', headers.filter(function (header) { return header === 'XIRR（年化）'; }).length === 1 && headers.indexOf('XIRR') < 0, headers);
  var triggerCount = ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === 'dailyAssetMaintenance'; }).length;
  check('每日觸發器唯一', triggerCount === 1, triggerCount);
  var failures = checks.filter(function (item) { return !item.ok; });
  return { success: failures.length === 0, checkCount: checks.length, errorCount: failures.length, checks: checks, failedChecks: failures.map(function (item) { return item.name; }) };
}

function validateSystem() {
  try {
    var structure = validateSystemStructureV840_();
    var core = typeof validatePhase1Internal_ === 'function' ? validatePhase1Internal_() : { success: true, checkCount: 0, errorCount: 0, warningCount: 0, checks: [] };
    var success = structure.success && core.success;
    setSettingValues_({ LAST_VALIDATION_AT: nowSheet_(), LAST_VALIDATION_STATUS: success ? 'PASS' : 'FAIL' });
    var result = apiResult_(success, success ? 'OK' : 'VALIDATION_FAILED', success ? '系統驗證通過' : '系統驗證未通過', { structure: structure, core: core });
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    return apiResult_(false, 'VALIDATION_ERROR', error.message, {});
  }
}

function getSystemHealth() {
  var settings = getSettingsMapSafeV840_();
  return apiResult_(true, 'OK', '資產記錄使用者系統正常', {
    appId: cleanText_(settings.APP_ID),
    version: V81.VERSION,
    schemaVersion: V81.SCHEMA_VERSION,
    setupStatus: cleanText_(settings.SETUP_STATUS),
    fileRole: cleanText_(settings.FILE_ROLE),
    dailyTriggerCount: ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === 'dailyAssetMaintenance'; }).length,
    lastDailyRunAt: settings.LAST_DAILY_JOB_AT || null,
    lastDailyRunStatus: settings.LAST_DAILY_JOB_STATUS || null
  });
}

function clearRowsBelowV840_(sheetName, firstDataRow) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('空白範本缺少分頁：' + sheetName);
  firstDataRow = Math.max(1, Number(firstDataRow) || 2);
  if (sheet.getMaxRows() >= firstDataRow) sheet.getRange(firstDataRow, 1, sheet.getMaxRows() - firstDataRow + 1, sheet.getMaxColumns()).clearContent();
}

function resetTemplateSettingsV840_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(V81.SHEETS.SETTINGS);
  if (!sheet) throw new Error('空白範本缺少系統設定分頁');
  sheet.getRange(1, 1, sheet.getMaxRows(), 3).clearDataValidations();
  sheet.getDataRange().clearContent();
  var rows = [['設定項目', '設定值', '說明']];
  Object.keys(V81.SETTINGS).forEach(function (key) { rows.push([key, V81.SETTINGS[key], V81.SETTING_DESCRIPTIONS[key] || 'V8 系統設定']); });
  if (sheet.getMaxRows() < rows.length) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length - sheet.getMaxRows());
  sheet.getRange(1, 1, rows.length, 3).setValues(rows);
}

/** 僅供發布正式空白範本時使用；正式檔與任意副本都無法執行。 */
function prepareBlankTemplateV840() {
  try {
    return withDocumentLock_(function () {
      var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      if (!spreadsheet || spreadsheet.getName() !== V840_TEMPLATE_NAME) throw new Error('安全防護：此函式只能在「' + V840_TEMPLATE_NAME + '」執行');
      resetTemplateSettingsV840_();
      ensureV81Schema_();
      clearRowsBelowV840_(V81.SHEETS.ASSETS, 2);
      clearRowsBelowV840_(V81.SHEETS.TRANSACTIONS, 2);
      clearRowsBelowV840_(V81.SHEETS.CASH_FLOWS, 3);
      [V81.SHEETS.PRICE_CACHE, V81.SHEETS.FX_CACHE, V81.SHEETS.CALCULATION, V81.SHEETS.PERFORMANCE, V81.SHEETS.CATEGORY_PERFORMANCE, V81.SHEETS.TREND, V81.SHEETS.TREND_DETAIL].forEach(function (name) { clearRowsBelowV840_(name, 2); });

      var temp = spreadsheet.getSheetByName(V81.SHEETS.TEMP);
      if (!temp) throw new Error('空白範本缺少系統暫存分頁');
      temp.getRange(1, 1, temp.getMaxRows(), Math.min(26, temp.getMaxColumns())).clearContent();
      if (temp.getMaxRows() > 1 && temp.getMaxColumns() >= V81.TREND_CACHE_START_COLUMN) {
        temp.getRange(2, V81.TREND_CACHE_START_COLUMN, temp.getMaxRows() - 1, Math.min(V81.HEADERS.TREND_CACHE.length, temp.getMaxColumns() - V81.TREND_CACHE_START_COLUMN + 1)).clearContent();
      }
      ensureTrendCacheHeaders_();
      resetTemplateSettingsV840_();
      PropertiesService.getScriptProperties().deleteAllProperties();
      removeDailyTrigger();
      resetTemplateSettingsV840_();
      applyV81Validations_();
      applyNumberFormatsByHeaderV831_(V81.SHEETS.PERFORMANCE, performanceNumberFormatsV831_());
      refreshDashboardInternalV82_();
      hideSystemSheetsV840_();
      resetTemplateSettingsV840_();
      SpreadsheetApp.flush();

      var personalRows = {
        assets: readTable_(V81.SHEETS.ASSETS, { idHeader: '標的代號' }).rows.length,
        transactions: readTable_(V81.SHEETS.TRANSACTIONS, { idHeader: '交易ID' }).rows.length,
        cashFlows: loadCashFlows_(true).length,
        prices: readTable_(V81.SHEETS.PRICE_CACHE, { idHeader: '標的代號' }).rows.length,
        fx: readTable_(V81.SHEETS.FX_CACHE, { idHeader: '幣別組合' }).rows.length,
        trend: readTable_(V81.SHEETS.TREND, { idHeader: '取樣日期' }).rows.length
      };
      var clean = Object.keys(personalRows).every(function (key) { return personalRows[key] === 0; });
      if (!clean) throw new Error('空白範本仍含個人資料：' + JSON.stringify(personalRows));
      var result = apiResult_(true, 'OK', 'v8.4 正式空白範本已清理完成', { name: spreadsheet.getName(), version: V81.VERSION, schemaVersion: V81.SCHEMA_VERSION, personalRows: personalRows, triggerCount: ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === 'dailyAssetMaintenance'; }).length });
      console.log(JSON.stringify(result));
      return result;
    });
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    return apiResult_(false, 'TEMPLATE_PREPARE_FAILED', error.message, {});
  }
}
