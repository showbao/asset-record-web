function validationResultV84_(checks) {
  var errors = checks.filter(function (check) { return !check.ok; }).map(function (check) { return check.message; });
  return { valid: errors.length === 0, errors: errors, checks: checks };
}

function backupValidationCheckV84_(checks, name, ok, code, message, details) {
  checks.push({ name: name, ok: Boolean(ok), code: ok ? null : code, message: ok ? '' : message, details: details || {} });
}

function validateRequiredSheets_(spreadsheet, requiredSheetNames) {
  var missing = (requiredSheetNames || V84_BACKUP.SOURCE_SHEETS.concat([V81.SHEETS.SETTINGS])).filter(function (sheetName) {
    return !spreadsheet.getSheetByName(sheetName);
  });
  return { valid: missing.length === 0, missing: missing };
}

function validateRequiredHeaders_(spreadsheet, requiredHeaders) {
  var required = requiredHeaders || backupRequiredHeadersV84_();
  var failures = [];
  Object.keys(required).forEach(function (sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    var values = sheet.getDataRange().getValues();
    var headers = values.length ? values[0].map(cleanText_) : [];
    var map = headerMap_(headers);
    var missing = required[sheetName].filter(function (header) { return map[header] == null; });
    if (missing.length) failures.push({ sheet: sheetName, missing: missing });
  });
  return { valid: failures.length === 0, failures: failures };
}

function validateSourceCounts_(expected, actual) {
  var fields = ['transactionCount', 'assetCount', 'cashFlowCount', 'snapshotCount'];
  var mismatches = fields.filter(function (field) { return Number(expected[field]) !== Number(actual[field]); }).map(function (field) {
    return { field: field, expected: Number(expected[field]), actual: Number(actual[field]) };
  });
  return { valid: mismatches.length === 0, mismatches: mismatches };
}

function validateBackupCandidate_(backupSpreadsheet, options) {
  options = options || {};
  var checks = [];
  var sourceSpreadsheetId = cleanText_(options.sourceSpreadsheetId);
  backupValidationCheckV84_(checks, '備份檔可開啟', Boolean(backupSpreadsheet && backupSpreadsheet.getId()), 'BACKUP_FILE_MISSING', '備份檔無法開啟');
  if (!backupSpreadsheet) return validationResultV84_(checks);
  backupValidationCheckV84_(checks, '備份檔不是正式檔', !sourceSpreadsheetId || backupSpreadsheet.getId() !== sourceSpreadsheetId, 'BACKUP_VALIDATION_FAILED', '備份檔不可與正式檔相同');

  var requiredSheetNames = options.requiredSheetNames || V84_BACKUP.SOURCE_SHEETS.concat([V81.SHEETS.SETTINGS]);
  var sourceSheetNames = options.sourceSheetNames || V84_BACKUP.SOURCE_SHEETS;
  var sheets = validateRequiredSheets_(backupSpreadsheet, requiredSheetNames);
  backupValidationCheckV84_(checks, '必要分頁存在', sheets.valid, 'BACKUP_REQUIRED_SHEET_MISSING', sheets.valid ? '' : '缺少必要分頁：' + sheets.missing.join('、'), sheets);
  var requiredHeaders = options.requiredHeaders || backupRequiredHeadersV84_();
  var headers = validateRequiredHeaders_(backupSpreadsheet, requiredHeaders);
  backupValidationCheckV84_(checks, '必要表頭存在', headers.valid, 'BACKUP_REQUIRED_HEADER_MISSING', headers.valid ? '' : '備份檔缺少必要欄位', headers);
  if (!sheets.valid || !headers.valid) return validationResultV84_(checks);

  var settings = settingsMapFromSpreadsheetV84_(backupSpreadsheet);
  var systemVersion = cleanText_(settings.BACKUP_SYSTEM_VERSION || settings.SYSTEM_VERSION);
  var schemaVersion = cleanText_(settings.BACKUP_SCHEMA_VERSION || settings.SCHEMA_VERSION);
  backupValidationCheckV84_(checks, '系統版本可讀取', Boolean(systemVersion), 'BACKUP_VERSION_UNSUPPORTED', '無法讀取備份系統版本');
  var supported = options.requireArchiveMetadata ? systemVersion === V84_BACKUP.VERSION : /^8\.[1-5]\./.test(systemVersion);
  backupValidationCheckV84_(checks, '備份版本受支援', supported, 'BACKUP_VERSION_UNSUPPORTED', '備份版本不受支援：' + (systemVersion || '未知'), { systemVersion: systemVersion, schemaVersion: schemaVersion });
  if (options.requireArchiveMetadata) {
    backupValidationCheckV84_(checks, 'FILE_ROLE 為 BACKUP', cleanText_(settings.FILE_ROLE) === V84_BACKUP.FILE_ROLE_BACKUP, 'BACKUP_VALIDATION_FAILED', '備份檔 FILE_ROLE 不是 BACKUP');
    backupValidationCheckV84_(checks, 'BACKUP_STATUS 為 ARCHIVE', cleanText_(settings.BACKUP_STATUS) === V84_BACKUP.BACKUP_STATUS_ARCHIVE, 'BACKUP_VALIDATION_FAILED', '備份檔 BACKUP_STATUS 不是 ARCHIVE');
    backupValidationCheckV84_(checks, '備份 ID 相符', !options.backupId || cleanText_(settings.BACKUP_ID) === cleanText_(options.backupId), 'BACKUP_VALIDATION_FAILED', '備份 ID 不相符');
    backupValidationCheckV84_(checks, '來源正式檔 ID 相符', !sourceSpreadsheetId || cleanText_(settings.BACKUP_SOURCE_ID) === sourceSpreadsheetId, 'BACKUP_VALIDATION_FAILED', '備份來源正式檔 ID 不相符');
  }

  var summary;
  try {
    summary = buildBackupSummary_(backupSpreadsheet, requiredHeaders);
    if (options.expectedSummary) {
      var counts = validateSourceCounts_(options.expectedSummary, summary);
      backupValidationCheckV84_(checks, '來源資料筆數一致', counts.valid, 'BACKUP_VALIDATION_FAILED', '備份來源資料筆數不一致', counts);
    }
    var fingerprint = computeBackupFingerprint_(backupSpreadsheet, requiredHeaders, sourceSheetNames);
    var expectedFingerprint = cleanText_(options.expectedFingerprint || settings.BACKUP_FINGERPRINT);
    backupValidationCheckV84_(checks, '資料指紋一致', Boolean(expectedFingerprint) && fingerprint === expectedFingerprint, 'BACKUP_MODIFIED', '此備份內容可能已被修改，不能直接一鍵還原。', { expected: expectedFingerprint, actual: fingerprint });
  } catch (error) {
    backupValidationCheckV84_(checks, '讀取來源資料', false, error.apiCode || 'BACKUP_VALIDATION_FAILED', cleanText_(error.message) || '讀取備份來源資料失敗');
  }
  var result = validationResultV84_(checks);
  result.summary = summary || null;
  return result;
}

function validateCreatedBackup_(backup, expectedSummary) {
  try {
    var spreadsheet = SpreadsheetApp.openById(backup.fileId);
    return validateBackupCandidate_(spreadsheet, {
      sourceSpreadsheetId: expectedSummary.sourceSpreadsheetId,
      backupId: backup.backupId,
      expectedSummary: expectedSummary,
      expectedFingerprint: backup.fingerprint,
      requireArchiveMetadata: true
    });
  } catch (error) {
    return {
      valid: false,
      errors: [cleanText_(error.message) || '備份檔無法開啟'],
      checks: [{ name: '備份檔可開啟', ok: false, code: 'BACKUP_FILE_MISSING', message: cleanText_(error.message) || '備份檔無法開啟', details: {} }]
    };
  }
}

function validateBackupByIdV84_(backupId) {
  assertPrimarySpreadsheet_();
  var row = findBackupRecordV84_(backupId);
  var validation;
  try {
    var file = DriveApp.getFileById(cleanText_(row['檔案ID']));
    if (typeof file.isTrashed === 'function' && file.isTrashed()) throw new Error('備份檔已移至垃圾桶');
    var spreadsheet = SpreadsheetApp.openById(file.getId());
    validation = validateBackupCandidate_(spreadsheet, {
      sourceSpreadsheetId: cleanText_(row['正式檔ID']),
      backupId: cleanText_(row['備份ID']),
      expectedSummary: {
        transactionCount: row['交易筆數'], assetCount: row['標的筆數'], cashFlowCount: row['出入金筆數'], snapshotCount: row['快照筆數']
      },
      expectedFingerprint: cleanText_(row['資料指紋']),
      requireArchiveMetadata: cleanText_(row['驗證狀態']) !== 'LEGACY_UNVERIFIED',
      requiredHeaders: cleanText_(row['驗證狀態']) === 'LEGACY_UNVERIFIED' ? restoreRequiredHeadersV84_() : backupRequiredHeadersV84_(),
      requiredSheetNames: cleanText_(row['驗證狀態']) === 'LEGACY_UNVERIFIED' ? restoreRequiredSheetNamesV84_() : V84_BACKUP.SOURCE_SHEETS.concat([V81.SHEETS.SETTINGS]),
      sourceSheetNames: cleanText_(row['驗證狀態']) === 'LEGACY_UNVERIFIED' ? V84_BACKUP.SOURCE_SHEETS.filter(function (name) { return Boolean(spreadsheet.getSheetByName(name)); }) : V84_BACKUP.SOURCE_SHEETS
    });
    row['可用狀態'] = 'AVAILABLE';
  } catch (error) {
    validation = { valid: false, errors: ['備份檔不存在或無法開啟'], checks: [{ name: '備份檔可開啟', ok: false, code: 'BACKUP_FILE_MISSING', message: '備份檔不存在或無法開啟', details: {} }] };
    row['可用狀態'] = 'MISSING';
  }
  if (cleanText_(row['驗證狀態']) !== 'LEGACY_UNVERIFIED') row['驗證狀態'] = validation.valid ? 'VERIFIED' : 'INVALID';
  row['建立結果'] = validation.valid ? 'SUCCESS' : 'FAILED';
  row['錯誤摘要'] = validation.errors.join('；').slice(0, 500);
  writeBackupLog_(row);
  return { backup: backupRecordToApiV84_(row), validation: validation };
}

function parseSpreadsheetIdV84_(value) {
  var text = cleanText_(value);
  var match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/) || text.match(/^([a-zA-Z0-9_-]{20,})$/);
  if (!match) throwBackupRestoreErrorV84_('INVALID_REQUEST', '請貼上有效的 Google Sheet 網址');
  return match[1];
}

function registerLegacyBackupV84_(url) {
  var primary = assertPrimarySpreadsheet_();
  var fileId = parseSpreadsheetIdV84_(url);
  if (fileId === primary.getId()) throwBackupRestoreErrorV84_('BACKUP_VALIDATION_FAILED', '不能將目前正式檔加入為備份');
  var spreadsheet;
  try { spreadsheet = SpreadsheetApp.openById(fileId); }
  catch (error) { throwBackupRestoreErrorV84_('BACKUP_FILE_MISSING', '備份檔不存在或無法開啟'); }
  var sheets = validateRequiredSheets_(spreadsheet, restoreRequiredSheetNamesV84_());
  if (!sheets.valid) throwBackupRestoreErrorV84_('BACKUP_REQUIRED_SHEET_MISSING', '缺少必要分頁：' + sheets.missing.join('、'), sheets);
  var restoreHeaders = restoreRequiredHeadersV84_();
  var headers = validateRequiredHeaders_(spreadsheet, restoreHeaders);
  if (!headers.valid) throwBackupRestoreErrorV84_('BACKUP_REQUIRED_HEADER_MISSING', '備份檔缺少必要欄位', headers);
  var summary = buildBackupSummary_(spreadsheet, restoreHeaders);
  var legacySourceSheets = V84_BACKUP.SOURCE_SHEETS.filter(function (name) { return Boolean(spreadsheet.getSheetByName(name)); });
  var fingerprint = computeBackupFingerprint_(spreadsheet, restoreHeaders, legacySourceSheets);
  var settings = settingsMapFromSpreadsheetV84_(spreadsheet);
  var backupId = 'LEGACY-' + Utilities.getUuid();
  var record = backupRecordFromSummaryV84_({
    backupId: backupId,
    fileId: fileId,
    fileName: spreadsheet.getName(),
    createdAt: new Date().toISOString(),
    reason: 'OTHER',
    note: '由網址加入的舊版備份',
    fingerprint: fingerprint
  }, Object.assign({}, summary, {
    sourceSpreadsheetId: primary.getId(),
    systemVersion: cleanText_(settings.SYSTEM_VERSION) || summary.systemVersion,
    schemaVersion: cleanText_(settings.SCHEMA_VERSION) || summary.schemaVersion
  }), { valid: false, errors: ['舊版未驗證備份'], checks: [] });
  record['驗證狀態'] = 'LEGACY_UNVERIFIED';
  record['可用狀態'] = 'AVAILABLE';
  record['建立結果'] = 'SUCCESS';
  record['錯誤摘要'] = '舊版未驗證備份；還原時需額外確認';
  writeBackupLog_(record);
  return { backup: backupRecordToApiV84_(record), warnings: ['此檔案未含 v8.4.0 封存標記，不能視為 VERIFIED。'] };
}

function validateSnapshots_() {
  var errors = [];
  var warnings = [];
  var snapshots;
  var details;
  try {
    snapshots = readTable_(V81.SHEETS.TREND, { requiredHeaders: V81.HEADERS.TREND }).rows;
    details = readTable_(V81.SHEETS.TREND_DETAIL, { requiredHeaders: V81.HEADERS.TREND_DETAIL }).rows;
  } catch (error) {
    return { valid: false, errors: [cleanText_(error.message)], warnings: [], snapshotCount: 0, detailCount: 0, missingDates: [] };
  }
  var dates = snapshots.map(function (row) { return dateKey_(row['取樣日期']); });
  var invalidDates = dates.filter(function (date) { return !date; });
  var duplicateDates = duplicatesV82_(dates.filter(Boolean));
  var sorted = dates.filter(Boolean).slice().sort();
  if (invalidDates.length) errors.push('快照包含無效日期');
  if (duplicateDates.length) errors.push('快照日期重複：' + duplicateDates.join('、'));
  if (dates.filter(Boolean).join('|') !== sorted.join('|')) errors.push('快照日期排序不正確');
  var detailKeys = details.map(function (row) { return dateKey_(row['取樣日期']) + '|' + cleanText_(row['標的代號']); });
  var duplicateDetails = duplicatesV82_(detailKeys.filter(function (key) { return key.indexOf('|') > 0 && key.slice(-1) !== '|'; }));
  if (duplicateDetails.length) errors.push('趨勢估值明細鍵值重複');
  var snapshotDateMap = {};
  dates.filter(Boolean).forEach(function (date) { snapshotDateMap[date] = true; });
  var orphanDetails = details.filter(function (row) { return !snapshotDateMap[dateKey_(row['取樣日期'])]; });
  if (orphanDetails.length) errors.push('趨勢估值明細存在無對應快照的日期');
  var expected = expectedTrendDatesV82_(V81.TREND_START_DATE, new Date()).map(dateKey_);
  var missingDates = expected.filter(function (date) { return !snapshotDateMap[date]; });
  if (missingDates.length) warnings.push('仍有 ' + missingDates.length + ' 個歷史取樣日期待補建');
  return { valid: errors.length === 0, errors: errors, warnings: warnings, snapshotCount: snapshots.length, detailCount: details.length, missingDates: missingDates, duplicateDates: duplicateDates, duplicateDetailKeys: duplicateDetails };
}

function auditManagedDailyTrigger_() {
  try {
    var all = ScriptApp.getProjectTriggers();
    var managed = all.filter(function (trigger) { return trigger.getHandlerFunction() === V84_BACKUP.HANDLER_NAME; });
    var removed = 0;
    if (managed.length > 1) {
      managed.slice(1).forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); removed++; });
      managed = managed.slice(0, 1);
    }
    var created = false;
    if (!managed.length) {
      ScriptApp.newTrigger(V84_BACKUP.HANDLER_NAME)
        .timeBased()
        .atHour(V81.DAILY_JOB_HOUR)
        .nearMinute(V81.DAILY_JOB_MINUTE)
        .everyDays(1)
        .inTimezone(V81.TIMEZONE)
        .create();
      created = true;
    }
    var finalCount = ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === V84_BACKUP.HANDLER_NAME; }).length;
    if (finalCount !== 1) throw new Error('受管理每日觸發器數量不是 1');
    return { handler: V84_BACKUP.HANDLER_NAME, before: all.filter(function (trigger) { return trigger.getHandlerFunction() === V84_BACKUP.HANDLER_NAME; }).length, removed: removed, created: created, after: finalCount };
  } catch (error) {
    throwBackupRestoreErrorV84_('TRIGGER_REPAIR_FAILED', '每日觸發器稽核失敗', { cause: cleanText_(error.message) });
  }
}

function validatePostRestore_(operation) {
  var checks = [];
  var errors = [];
  var warnings = [];
  function check(name, ok, message, details) {
    var item = { name: name, ok: Boolean(ok), message: ok ? '' : message, details: details || {} };
    checks.push(item);
    if (!item.ok) errors.push(message);
  }
  function warnCheck(name, ok, message, details) {
    var item = { name: name, ok: Boolean(ok), severity: ok ? 'ok' : 'warning', message: ok ? '' : message, details: details || {} };
    checks.push(item);
    if (!item.ok) warnings.push(message);
  }
  function finiteOrBlank(value) {
    return value == null || value === '' || (typeof value === 'number' && isFinite(value) && !isDateValueV831_(value));
  }
  var record = findBackupRecordV84_(operation.sourceBackupId);
  var expected = backupSummaryFromRecordV84_(record);
  var actual = buildBackupSummary_(SpreadsheetApp.getActiveSpreadsheet());
  check('投資交易筆數符合備份', actual.transactionCount === expected.transactionCount, '投資交易筆數與備份不一致', { expected: expected.transactionCount, actual: actual.transactionCount });
  check('投資標的筆數符合備份', actual.assetCount === expected.assetCount, '投資標的筆數與備份不一致', { expected: expected.assetCount, actual: actual.assetCount });
  check('外部出入金筆數符合備份', actual.cashFlowCount === expected.cashFlowCount, '外部出入金筆數與備份不一致', { expected: expected.cashFlowCount, actual: actual.cashFlowCount });
  if (operation.options.restoreSnapshots) check('快照筆數不少於備份', actual.snapshotCount >= expected.snapshotCount, '歷史快照筆數少於備份', { expectedMinimum: expected.snapshotCount, actual: actual.snapshotCount });

  var transactions = loadTransactions_(true);
  var assets = loadAssets_();
  var cashFlows = loadCashFlows_(true);
  var transactionIds = transactions.map(function (row) { return cleanText_(row['交易ID']); });
  var assetCodes = assets.map(function (row) { return cleanText_(row['標的代號']); });
  var cashFlowIds = cashFlows.map(function (row) { return cleanText_(row['流水ID']); });
  check('交易 ID 完整且唯一', transactionIds.every(Boolean) && duplicatesV82_(transactionIds).length === 0, '交易 ID 缺漏或重複');
  check('標的代號完整且唯一', assetCodes.every(Boolean) && duplicatesV82_(assetCodes).length === 0, '標的代號缺漏或重複');
  check('外部流水 ID 完整且唯一', cashFlowIds.every(Boolean) && duplicatesV82_(cashFlowIds).length === 0, '外部流水 ID 缺漏或重複');
  check('交易必填欄位與日期合法', transactions.every(function (row) { return cleanText_(row['交易ID']) && dateKey_(row['日期']) && cleanText_(row['標的代號']) && V81.TRANSACTION_TYPES.indexOf(cleanText_(row['交易類型'])) >= 0; }), '交易存在必填欄位、日期或類型錯誤');
  check('投資標的欄位與幣別合法', assets.every(function (row) { return typeof row['標的代號'] === 'string' && cleanText_(row['標的代號']) && cleanText_(row['標的名稱']) && V81.ASSET_TYPES.indexOf(cleanText_(row['標的類型'])) >= 0 && V81.CURRENCIES.indexOf(cleanText_(row['交易幣別'])) >= 0 && V81.CURRENCIES.indexOf(cleanText_(row['淨值幣別'])) >= 0; }), '投資標的存在欄位、前導零或幣別錯誤');
  check('外部出入金欄位合法', cashFlows.every(function (row) { return cleanText_(row['流水ID']) && dateKey_(row['日期']) && V81.CASH_FLOW_TYPES.indexOf(cleanText_(row['類型'])) >= 0 && V81.CURRENCIES.indexOf(cleanText_(row['幣別'])) >= 0; }), '外部出入金存在必填欄位或幣別錯誤');

  var performance = readTable_(V81.SHEETS.PERFORMANCE, { requiredHeaders: V81.HEADERS.PERFORMANCE_REQUIRED }).rows;
  check('XIRR 維持有限數值或空值', performance.every(function (row) {
    var value = row['XIRR（年化）'];
    return finiteOrBlank(value);
  }), 'XIRR 出現非有限數值或 Date 型態');
  var ratioHeaders = ['累積交易報酬率', '目前資產占比', '損益貢獻度', '資產占比', '整體投資報酬率'];
  check('標的績效比例欄位維持有限數值或空值', performance.every(function (row) {
    return ratioHeaders.every(function (header) { return finiteOrBlank(row[header]); });
  }), '標的績效比例欄位出現非數值或 Date 型態');
  var categoryPerformance = readTable_(V81.SHEETS.CATEGORY_PERFORMANCE, { requiredHeaders: V81.HEADERS.CATEGORY_REQUIRED }).rows;
  check('類別績效比例欄位維持有限數值或空值', categoryPerformance.every(function (row) {
    return ['累積交易報酬率', '目前持倉占比', '損益貢獻度', '資產占比', '整體投資報酬率'].every(function (header) { return finiteOrBlank(row[header]); });
  }), '類別績效比例欄位出現非數值或 Date 型態');
  var calculation = readTable_(V81.SHEETS.CALCULATION, { requiredHeaders: V81.HEADERS.CALCULATION_REQUIRED }).rows;
  check('持倉沒有非預期負庫存', calculation.every(function (row) {
    var quantity = row['持有數量'];
    return quantity == null || quantity === '' || (typeof quantity === 'number' && isFinite(quantity) && quantity >= -V81.EPSILON);
  }), '持倉重算後仍有負庫存');
  var snapshots = validateSnapshots_();
  warnCheck('歷史快照結構有效', snapshots.valid, '歷史快照需要另行完整重建。', snapshots);
  warnings = warnings.concat(snapshots.warnings || []);

  var settings = settingsMapFromSpreadsheetV84_(SpreadsheetApp.getActiveSpreadsheet());
  check('正式檔角色保持 PRIMARY', cleanText_(settings.FILE_ROLE) === V84_BACKUP.FILE_ROLE_PRIMARY, '正式檔角色被改變');
  check('系統版本保持目前版本', cleanText_(settings.SYSTEM_VERSION) === V81.VERSION && cleanText_(settings.SCHEMA_VERSION) === V81.SCHEMA_VERSION, '系統版本或結構版本被備份覆蓋');
  check('備份紀錄仍存在', Boolean(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(V84_BACKUP.LOG_SHEET_NAME)), '備份紀錄分頁遺失');
  var properties = scriptPropertiesV84_();
  var protectedState = operation.protectedState || {};
  check('備份紀錄未被來源資料覆蓋', backupLogRowsV84_().length >= toNumber_(protectedState.backupLogCount, 0) + 1, '備份紀錄筆數異常減少');
  check('正式試算表 ID 保持不變', !protectedState.primarySpreadsheetId || SpreadsheetApp.getActiveSpreadsheet().getId() === protectedState.primarySpreadsheetId, '正式試算表 ID 被改變');
  check('帳密驗證設定未被覆蓋', authModeV85_() === cleanText_(protectedState.authMode) && cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.USERNAME)) === cleanText_(protectedState.authUsername) && cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.PASSWORD_VERSION)) === cleanText_(protectedState.authPasswordVersion), '帳密驗證設定被還原資料覆蓋');
  var triggerCount = ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === V84_BACKUP.HANDLER_NAME; }).length;
  check('每日觸發器正好一個', triggerCount === 1, '每日觸發器數量不是 1', { count: triggerCount });
  return { valid: errors.length === 0, errors: errors, warnings: warnings, checks: checks, sourceSummary: actual, snapshots: snapshots, triggerCount: triggerCount };
}
