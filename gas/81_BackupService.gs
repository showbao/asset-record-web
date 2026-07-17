function scriptPropertiesV84_() {
  return PropertiesService.getScriptProperties();
}

function settingsMapFromSpreadsheetV84_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(V81.SHEETS.SETTINGS);
  if (!sheet) throwBackupRestoreErrorV84_('BACKUP_REQUIRED_SHEET_MISSING', '缺少分頁：' + V81.SHEETS.SETTINGS);
  var values = sheet.getDataRange().getValues();
  var headers = values.length ? values[0].map(cleanText_) : [];
  var map = headerMap_(headers);
  if (map['設定項目'] == null || map['設定值'] == null) {
    throwBackupRestoreErrorV84_('BACKUP_REQUIRED_HEADER_MISSING', '系統設定缺少設定項目或設定值欄位');
  }
  var settings = {};
  for (var row = 1; row < values.length; row++) {
    var key = cleanText_(values[row][map['設定項目']]);
    if (key) settings[key] = values[row][map['設定值']];
  }
  return settings;
}

function upsertSpreadsheetSettingsV84_(spreadsheet, updates) {
  var sheet = spreadsheet.getSheetByName(V81.SHEETS.SETTINGS);
  if (!sheet) throwBackupRestoreErrorV84_('BACKUP_REQUIRED_SHEET_MISSING', '缺少分頁：' + V81.SHEETS.SETTINGS);
  var lastRow = Math.max(sheet.getLastRow(), 1);
  var lastColumn = Math.max(sheet.getLastColumn(), 3);
  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var headers = values.length ? values[0].map(cleanText_) : [];
  var map = headerMap_(headers);
  if (map['設定項目'] == null || map['設定值'] == null) {
    throwBackupRestoreErrorV84_('BACKUP_REQUIRED_HEADER_MISSING', '系統設定缺少設定項目或設定值欄位');
  }
  var descriptionColumn = map['說明'];
  var rowMap = {};
  for (var row = 1; row < values.length; row++) {
    var key = cleanText_(values[row][map['設定項目']]);
    if (key && rowMap[key] == null) rowMap[key] = row;
  }
  Object.keys(updates || {}).forEach(function (key) {
    var rowIndex = rowMap[key];
    if (rowIndex == null) {
      var appended = Array(lastColumn).fill('');
      appended[map['設定項目']] = key;
      appended[map['設定值']] = updates[key];
      if (descriptionColumn != null) appended[descriptionColumn] = 'v8.4.0 備份檔標記';
      rowMap[key] = values.length;
      values.push(appended);
    } else {
      values[rowIndex][map['設定值']] = updates[key];
    }
  });
  if (sheet.getMaxRows() < values.length) sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
  sheet.getRange(1, 1, values.length, lastColumn).setValues(values);
  return Object.keys(updates || {});
}

function normalizePrimaryFileRoleV84_(role) {
  role = cleanText_(role);
  if (!role || role === V84_BACKUP.FILE_ROLE_PRIMARY || role === V84_BACKUP.FILE_ROLE_LEGACY_PRIMARY) {
    return V84_BACKUP.FILE_ROLE_PRIMARY;
  }
  return role;
}

function ensurePrimaryFileRoleV84_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var settings = settingsMapFromSpreadsheetV84_(spreadsheet);
  var role = cleanText_(settings.FILE_ROLE);
  var normalizedRole = normalizePrimaryFileRoleV84_(role);
  if (normalizedRole !== V84_BACKUP.FILE_ROLE_PRIMARY) {
    throwBackupRestoreErrorV84_('NOT_PRIMARY_FILE', '此檔案為封存備份，不能安裝或升級正式系統。');
  }
  if (role !== V84_BACKUP.FILE_ROLE_PRIMARY) {
    upsertSpreadsheetSettingsV84_(spreadsheet, { FILE_ROLE: V84_BACKUP.FILE_ROLE_PRIMARY });
  }
  return V84_BACKUP.FILE_ROLE_PRIMARY;
}

function assertPrimarySpreadsheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet || !cleanText_(spreadsheet.getId())) {
    throwBackupRestoreErrorV84_('PRIMARY_FILE_NOT_FOUND', '找不到目前正式試算表');
  }
  var settings = settingsMapFromSpreadsheetV84_(spreadsheet);
  if (cleanText_(settings.FILE_ROLE) !== V84_BACKUP.FILE_ROLE_PRIMARY) {
    throwBackupRestoreErrorV84_('NOT_PRIMARY_FILE', '此檔案為封存備份，不能執行正式更新或修改。請回到目前正式的「資產記錄」系統操作。');
  }
  return spreadsheet;
}

function assertSystemWritableV84_() {
  var mode = cleanText_(scriptPropertiesV84_().getProperty(V84_BACKUP.PROPERTIES.SYSTEM_MODE)) || V84_BACKUP.MODES.NORMAL;
  if (mode !== V84_BACKUP.MODES.NORMAL) {
    throwBackupRestoreErrorV84_('SYSTEM_BUSY', mode === V84_BACKUP.MODES.BACKUP_RUNNING ? '系統正在建立一致性備份，暫時不能修改資料' : '系統正在還原資料或等待回復，暫時不能修改資料', { mode: mode });
  }
  return mode;
}

function assertMutationAllowedV84_(context) {
  // 既有自動驗證會把 CRUD 導向臨時測試分頁；該隔離情境不碰正式檔。
  if (context && context.validationMode === true && context.sheets) return true;
  assertPrimarySpreadsheet_();
  assertSystemWritableV84_();
  return true;
}

function ensureBackupLogSheetV84_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(V84_BACKUP.LOG_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(V84_BACKUP.LOG_SHEET_NAME);
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(cleanText_);
  var map = headerMap_(headers);
  var missing = V84_BACKUP_LOG_HEADERS.filter(function (header) { return map[header] == null; });
  if (missing.length) {
    var start = headers.filter(Boolean).length ? headers.length + 1 : 1;
    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
  }
  if (!sheet.isSheetHidden()) sheet.hideSheet();
  return sheet;
}

function backupFolderFromPropertyV84_(properties) {
  var folderId = cleanText_(properties.getProperty(V84_BACKUP.PROPERTIES.BACKUP_FOLDER_ID));
  if (!folderId) return null;
  try {
    var folder = DriveApp.getFolderById(folderId);
    if (typeof folder.isTrashed === 'function' && folder.isTrashed()) return null;
    folder.getName();
    return folder;
  } catch (ignore) {
    return null;
  }
}

function ensureBackupInfrastructure_() {
  var spreadsheet = assertPrimarySpreadsheet_();
  var properties = scriptPropertiesV84_();
  var folder = backupFolderFromPropertyV84_(properties);
  var created = false;
  try {
    if (!folder) {
      folder = DriveApp.createFolder(V84_BACKUP.FOLDER_NAME);
      properties.setProperty(V84_BACKUP.PROPERTIES.BACKUP_FOLDER_ID, folder.getId());
      created = true;
    }
    var logSheet = ensureBackupLogSheetV84_(spreadsheet);
    return { folder: folder, folderId: folder.getId(), folderCreated: created, logSheet: logSheet };
  } catch (error) {
    if (error.apiCode) throw error;
    throwBackupRestoreErrorV84_('BACKUP_FOLDER_ERROR', '無法建立或存取備份資料夾', { cause: cleanText_(error.message) });
  }
}

function tableDataV84_(spreadsheet, sheetName, requiredHeaders, idHeader) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throwBackupRestoreErrorV84_('BACKUP_REQUIRED_SHEET_MISSING', '缺少必要分頁：' + sheetName, { sheet: sheetName });
  var values = sheet.getDataRange().getValues();
  var headers = values.length ? values[0].map(cleanText_) : [];
  var map = headerMap_(headers);
  var missing = (requiredHeaders || []).filter(function (header) { return map[header] == null; });
  if (missing.length) {
    throwBackupRestoreErrorV84_('BACKUP_REQUIRED_HEADER_MISSING', sheetName + ' 缺少欄位：' + missing.join('、'), { sheet: sheetName, missing: missing });
  }
  var rows = [];
  for (var index = 1; index < values.length; index++) {
    var row = values[index];
    var hasValue = row.some(function (value) { return value !== '' && value != null; });
    if (!hasValue) continue;
    if (idHeader && map[idHeader] != null && !cleanText_(row[map[idHeader]])) continue;
    rows.push(row);
  }
  return { sheet: sheet, headers: headers, headerMap: map, rows: rows, values: values };
}

function sortedDateBoundsV84_(table, header) {
  var column = table.headerMap[header];
  if (column == null) return { first: '', last: '' };
  var dates = table.rows.map(function (row) { return dateKey_(row[column]); }).filter(Boolean).sort();
  return { first: dates.length ? dates[0] : '', last: dates.length ? dates[dates.length - 1] : '' };
}

function buildBackupSummary_(spreadsheet, requiredHeaders) {
  spreadsheet = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  var required = requiredHeaders || backupRequiredHeadersV84_();
  var transactions = tableDataV84_(spreadsheet, V81.SHEETS.TRANSACTIONS, required[V81.SHEETS.TRANSACTIONS], '交易ID');
  var assets = tableDataV84_(spreadsheet, V81.SHEETS.ASSETS, required[V81.SHEETS.ASSETS], '標的代號');
  var cashFlows = tableDataV84_(spreadsheet, V81.SHEETS.CASH_FLOWS, required[V81.SHEETS.CASH_FLOWS], '流水ID');
  var cashFlowIdColumn = cashFlows.headerMap['流水ID'];
  cashFlows.rows = cashFlows.rows.filter(function (row) {
    return cleanText_(row[cashFlowIdColumn]) !== '只記錄真正從投資系統外部進入或提出的資金；股息、賣出款及再投入不在此重複登錄。';
  });
  var snapshots = spreadsheet.getSheetByName(V81.SHEETS.TREND)
    ? tableDataV84_(spreadsheet, V81.SHEETS.TREND, required[V81.SHEETS.TREND], '取樣日期')
    : { rows: [], headerMap: {} };
  var transactionDates = sortedDateBoundsV84_(transactions, '日期');
  var snapshotDates = sortedDateBoundsV84_(snapshots, '取樣日期');
  var settings = settingsMapFromSpreadsheetV84_(spreadsheet);
  return {
    transactionCount: transactions.rows.length,
    assetCount: assets.rows.length,
    cashFlowCount: cashFlows.rows.length,
    snapshotCount: snapshots.rows.length,
    earliestTransactionDate: transactionDates.first || null,
    latestTransactionDate: transactionDates.last || null,
    snapshotStartDate: snapshotDates.first || null,
    snapshotEndDate: snapshotDates.last || null,
    systemVersion: cleanText_(settings.SYSTEM_VERSION) || V81.VERSION,
    schemaVersion: cleanText_(settings.SCHEMA_VERSION) || V81.SCHEMA_VERSION,
    sourceSpreadsheetId: spreadsheet.getId()
  };
}

function stableFingerprintValueV84_(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, V81.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
  if (typeof value === 'number') {
    if (!isFinite(value)) return '';
    return value === 0 ? '0' : String(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function fingerprintPartV84_(value) {
  var text = stableFingerprintValueV84_(value);
  return text.length + ':' + text;
}

function computeBackupFingerprint_(spreadsheet, requiredHeaders, sourceSheetNames) {
  spreadsheet = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  var required = requiredHeaders || backupRequiredHeadersV84_();
  var chunks = [];
  (sourceSheetNames || V84_BACKUP.SOURCE_SHEETS).forEach(function (sheetName) {
    var table = tableDataV84_(spreadsheet, sheetName, required[sheetName], null);
    chunks.push('S' + fingerprintPartV84_(sheetName));
    table.values.forEach(function (row) {
      chunks.push('R' + row.map(fingerprintPartV84_).join('|'));
    });
  });
  return bytesToHexV83_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, chunks.join('\n'), Utilities.Charset.UTF_8));
}

function backupFileNameV84_(reason, now) {
  var stamp = Utilities.formatDate(now || new Date(), V81.TIMEZONE, 'yyyyMMdd_HHmmss');
  return '資產記錄_備份_' + stamp + '_v' + V84_BACKUP.VERSION + '_' + backupReasonLabelV84_(reason);
}

function backupRecordFromSummaryV84_(backup, summary, validation) {
  return {
    '備份ID': backup.backupId,
    '檔案ID': backup.fileId || '',
    '檔案名稱': backup.fileName || '',
    '建立時間': backup.createdAt,
    '備份原因': backup.reason,
    '使用者備註': backup.note || '',
    '系統版本': summary.systemVersion || V81.VERSION,
    '結構版本': summary.schemaVersion || V81.SCHEMA_VERSION,
    '正式檔ID': summary.sourceSpreadsheetId || '',
    '交易筆數': summary.transactionCount == null ? '' : summary.transactionCount,
    '標的筆數': summary.assetCount == null ? '' : summary.assetCount,
    '出入金筆數': summary.cashFlowCount == null ? '' : summary.cashFlowCount,
    '快照筆數': summary.snapshotCount == null ? '' : summary.snapshotCount,
    '最早交易日': summary.earliestTransactionDate || '',
    '最晚交易日': summary.latestTransactionDate || '',
    '快照起始日': summary.snapshotStartDate || '',
    '快照最後日': summary.snapshotEndDate || '',
    '資料指紋': backup.fingerprint || '',
    '驗證狀態': validation && validation.valid ? 'VERIFIED' : 'INVALID',
    '可用狀態': backup.fileId ? 'AVAILABLE' : 'MISSING',
    '建立結果': validation && validation.valid ? 'SUCCESS' : 'FAILED',
    '錯誤摘要': validation && validation.errors && validation.errors.length ? validation.errors.join('；').slice(0, 500) : ''
  };
}

function writeBackupLog_(record) {
  var sheet = ensureBackupLogSheetV84_(SpreadsheetApp.getActiveSpreadsheet());
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(cleanText_);
  var map = headerMap_(headers);
  var existingRow = null;
  if (sheet.getLastRow() > 1) {
    var ids = sheet.getRange(2, map['備份ID'] + 1, sheet.getLastRow() - 1, 1).getValues();
    ids.some(function (row, index) {
      if (cleanText_(row[0]) === cleanText_(record['備份ID'])) { existingRow = index + 2; return true; }
      return false;
    });
  }
  var values = headers.map(function (header) { return record[header] == null ? '' : record[header]; });
  var targetRow = existingRow || Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(targetRow, 1, 1, headers.length).setValues([values]);
  return targetRow;
}

function backupLogRowsV84_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(V84_BACKUP.LOG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(cleanText_);
  return values.slice(1).filter(function (row) { return row.some(function (value) { return value !== '' && value != null; }); }).map(function (row) {
    var object = {};
    headers.forEach(function (header, index) { if (header) object[header] = row[index]; });
    return object;
  });
}

function backupRecordToApiV84_(row) {
  return {
    backupId: cleanText_(row['備份ID']),
    fileId: cleanText_(row['檔案ID']),
    fileName: cleanText_(row['檔案名稱']),
    fileUrl: backupFileUrlV84_(row['檔案ID']),
    createdAt: isoDateTimeV83_(row['建立時間']),
    reason: cleanText_(row['備份原因']),
    reasonLabel: backupReasonLabelV84_(row['備份原因']),
    note: cleanText_(row['使用者備註']) || null,
    systemVersion: cleanText_(row['系統版本']),
    schemaVersion: cleanText_(row['結構版本']),
    sourceSpreadsheetId: cleanText_(row['正式檔ID']),
    transactionCount: toNumber_(row['交易筆數'], 0),
    assetCount: toNumber_(row['標的筆數'], 0),
    cashFlowCount: toNumber_(row['出入金筆數'], 0),
    snapshotCount: toNumber_(row['快照筆數'], 0),
    earliestTransactionDate: isoDateV83_(row['最早交易日']),
    latestTransactionDate: isoDateV83_(row['最晚交易日']),
    snapshotStartDate: isoDateV83_(row['快照起始日']),
    snapshotEndDate: isoDateV83_(row['快照最後日']),
    fingerprint: cleanText_(row['資料指紋']),
    validationStatus: cleanText_(row['驗證狀態']),
    availabilityStatus: cleanText_(row['可用狀態']),
    result: cleanText_(row['建立結果']),
    errorSummary: cleanText_(row['錯誤摘要']) || null
  };
}

function findBackupRecordV84_(backupId) {
  var row = backupLogRowsV84_().find(function (candidate) { return cleanText_(candidate['備份ID']) === cleanText_(backupId); });
  if (!row) throwBackupRestoreErrorV84_('BACKUP_NOT_FOUND', '找不到指定備份');
  return row;
}

function listAvailableBackups_(options) {
  assertPrimarySpreadsheet_();
  options = options || {};
  var includeInvalid = toBoolean_(options.includeInvalid, false);
  var rows = backupLogRowsV84_();
  rows.forEach(function (row) {
    var available = false;
    try {
      var file = DriveApp.getFileById(cleanText_(row['檔案ID']));
      available = !(typeof file.isTrashed === 'function' && file.isTrashed());
    } catch (ignore) {}
    var nextStatus = available ? 'AVAILABLE' : 'MISSING';
    if (cleanText_(row['可用狀態']) !== nextStatus) {
      row['可用狀態'] = nextStatus;
      writeBackupLog_(row);
    }
  });
  rows = rows.filter(function (row) {
    return includeInvalid || cleanText_(row['驗證狀態']) === 'VERIFIED';
  });
  rows.sort(function (left, right) { return cleanText_(right['建立時間']).localeCompare(cleanText_(left['建立時間'])); });
  return rows.map(backupRecordToApiV84_);
}

function markBackupArchive_(backupSpreadsheet, metadata) {
  upsertSpreadsheetSettingsV84_(backupSpreadsheet, {
    FILE_ROLE: V84_BACKUP.FILE_ROLE_BACKUP,
    BACKUP_ID: metadata.backupId,
    BACKUP_STATUS: V84_BACKUP.BACKUP_STATUS_ARCHIVE,
    BACKUP_CREATED_AT: metadata.createdAt,
    BACKUP_REASON: metadata.reason,
    BACKUP_SOURCE_ID: metadata.sourceSpreadsheetId,
    BACKUP_SYSTEM_VERSION: metadata.systemVersion,
    BACKUP_SCHEMA_VERSION: metadata.schemaVersion,
    BACKUP_FINGERPRINT: metadata.fingerprint
  });
  return metadata;
}

function operationStateV84_(updates) {
  var properties = scriptPropertiesV84_();
  Object.keys(updates || {}).forEach(function (key) {
    var propertyKey = V84_BACKUP.PROPERTIES[key] || key;
    var value = updates[key];
    if (value == null || value === '') properties.deleteProperty(propertyKey);
    else properties.setProperty(propertyKey, String(value));
  });
}

function createBackupCopyUnderLockV84_(reason, note, backupId, createdAt, stagePrefix) {
  var source = assertPrimarySpreadsheet_();
  var infrastructure = ensureBackupInfrastructure_();
  var createdDate = toDate_(createdAt) || new Date();
  var createdIso = createdAt ? new Date(createdDate.getTime()).toISOString() : createdDate.toISOString();
  var fileName = backupFileNameV84_(reason, createdDate);
  var prefix = cleanText_(stagePrefix);
  function stage(name) { operationStateV84_({ CURRENT_OPERATION_STAGE: prefix ? prefix + '_' + name : name }); }
  stage('COPYING');
  var summary = buildBackupSummary_(source);
  var fingerprint = computeBackupFingerprint_(source);
  var backup = { backupId: backupId, fileName: fileName, createdAt: createdIso, reason: reason, note: note, fingerprint: fingerprint, fileId: '' };
  try {
    var copiedFile = DriveApp.getFileById(source.getId()).makeCopy(fileName, infrastructure.folder);
    backup.fileId = copiedFile.getId();
  } catch (copyError) {
    var copyValidation = { valid: false, errors: ['建立完整 Google Sheet 副本失敗'], checks: [] };
    try { writeBackupLog_(backupRecordFromSummaryV84_(backup, summary, copyValidation)); } catch (ignore) {}
    throwBackupRestoreErrorV84_('BACKUP_COPY_FAILED', '建立完整 Google Sheet 副本失敗', { cause: cleanText_(copyError.message) });
  }
  try {
    stage('MARKING');
    var backupSpreadsheet = SpreadsheetApp.openById(backup.fileId);
    markBackupArchive_(backupSpreadsheet, {
      backupId: backup.backupId,
      createdAt: backup.createdAt,
      reason: backup.reason,
      sourceSpreadsheetId: source.getId(),
      systemVersion: summary.systemVersion,
      schemaVersion: summary.schemaVersion,
      fingerprint: fingerprint
    });
    stage('VALIDATING');
    var validation = validateCreatedBackup_(backup, summary);
    var record = backupRecordFromSummaryV84_(backup, summary, validation);
    writeBackupLog_(record);
    return { backup: backupRecordToApiV84_(record), validation: validation };
  } catch (error) {
    var failureValidation = { valid: false, errors: [cleanText_(error.message) || '備份驗證失敗'], checks: [] };
    try { writeBackupLog_(backupRecordFromSummaryV84_(backup, summary, failureValidation)); } catch (ignore) {}
    if (error.apiCode) throw error;
    throwBackupRestoreErrorV84_('BACKUP_VALIDATION_FAILED', '備份副本未通過驗證', { cause: cleanText_(error.message), backupId: backup.backupId });
  }
}

function createFullBackup_(reason, note, requestId) {
  reason = cleanText_(reason) || 'MANUAL';
  note = cleanText_(note);
  requestId = cleanText_(requestId);
  if (!Object.prototype.hasOwnProperty.call(V84_BACKUP.REASON_LABELS, reason)) throwBackupRestoreErrorV84_('INVALID_REQUEST', '不支援的備份原因');
  if (note.length > V84_BACKUP.NOTE_MAX_LENGTH) throwBackupRestoreErrorV84_('INVALID_REQUEST', '備註最多 ' + V84_BACKUP.NOTE_MAX_LENGTH + ' 字');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(V84_BACKUP.LOCK_TIMEOUT_MS)) throwBackupRestoreErrorV84_('SYSTEM_BUSY', '已有備份或還原工作正在執行');
  var properties = scriptPropertiesV84_();
  try {
    var lastRequestId = cleanText_(properties.getProperty(V84_BACKUP.PROPERTIES.LAST_BACKUP_REQUEST_ID));
    var lastResult = cleanText_(properties.getProperty(V84_BACKUP.PROPERTIES.LAST_BACKUP_RESULT));
    if (requestId && requestId === lastRequestId && lastResult) return JSON.parse(lastResult);
    assertPrimarySpreadsheet_();
    var mode = cleanText_(properties.getProperty(V84_BACKUP.PROPERTIES.SYSTEM_MODE)) || V84_BACKUP.MODES.NORMAL;
    if (mode !== V84_BACKUP.MODES.NORMAL) throwBackupRestoreErrorV84_('SYSTEM_BUSY', '系統目前無法建立備份', { mode: mode });
    var now = new Date();
    var backupId = 'BKP-' + Utilities.getUuid();
    var createdAt = now.toISOString();
    operationStateV84_({ SYSTEM_MODE: V84_BACKUP.MODES.BACKUP_RUNNING, CURRENT_OPERATION_ID: backupId, CURRENT_OPERATION_STAGE: 'COPYING', CURRENT_OPERATION_STARTED_AT: createdAt, CURRENT_OPERATION_BACKUP_ID: backupId, CURRENT_OPERATION_ERROR: '' });
    var result = createBackupCopyUnderLockV84_(reason, note, backupId, createdAt, '');
    if (!result.validation.valid) throwBackupRestoreErrorV84_('BACKUP_VALIDATION_FAILED', '備份副本未通過驗證', { errors: result.validation.errors, backup: result.backup });
    if (requestId) {
      properties.setProperty(V84_BACKUP.PROPERTIES.LAST_BACKUP_REQUEST_ID, requestId);
      properties.setProperty(V84_BACKUP.PROPERTIES.LAST_BACKUP_RESULT, JSON.stringify(result));
    }
    return result;
  } catch (error) {
    operationStateV84_({ CURRENT_OPERATION_ERROR: cleanText_(error.message) });
    throw error;
  } finally {
    operationStateV84_({ SYSTEM_MODE: V84_BACKUP.MODES.NORMAL, CURRENT_OPERATION_ID: '', CURRENT_OPERATION_STAGE: '', CURRENT_OPERATION_STARTED_AT: '', CURRENT_OPERATION_BACKUP_ID: '', CURRENT_OPERATION_ERROR: '' });
    lock.releaseLock();
  }
}

function backupOverviewV84_() {
  var spreadsheet = assertPrimarySpreadsheet_();
  var summary = buildBackupSummary_(spreadsheet);
  var settings = settingsMapFromSpreadsheetV84_(spreadsheet);
  var rows = backupLogRowsV84_().filter(function (row) { return cleanText_(row['建立結果']) === 'SUCCESS'; });
  rows.sort(function (left, right) { return cleanText_(right['建立時間']).localeCompare(cleanText_(left['建立時間'])); });
  var properties = scriptPropertiesV84_();
  return {
    systemVersion: summary.systemVersion,
    schemaVersion: summary.schemaVersion,
    lastFullUpdateAt: isoDateTimeV83_(settings.LAST_REBUILD_AT || settings.LAST_DAILY_JOB_AT || settings.LAST_MARKET_REFRESH_AT),
    lastBackupAt: rows.length ? isoDateTimeV83_(rows[0]['建立時間']) : null,
    transactionCount: summary.transactionCount,
    assetCount: summary.assetCount,
    cashFlowCount: summary.cashFlowCount,
    snapshotCount: summary.snapshotCount,
    systemMode: cleanText_(properties.getProperty(V84_BACKUP.PROPERTIES.SYSTEM_MODE)) || V84_BACKUP.MODES.NORMAL,
    canCreateBackup: (cleanText_(properties.getProperty(V84_BACKUP.PROPERTIES.SYSTEM_MODE)) || V84_BACKUP.MODES.NORMAL) === V84_BACKUP.MODES.NORMAL,
    checks: {
      primarySpreadsheet: true,
      settingsSheet: Boolean(spreadsheet.getSheetByName(V81.SHEETS.SETTINGS)),
      sourceSheets: V84_BACKUP.SOURCE_SHEETS.every(function (name) { return Boolean(spreadsheet.getSheetByName(name)); })
    }
  };
}
