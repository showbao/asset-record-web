function normalizeRestoreOptionsV84_(options) {
  options = options || {};
  ensureAllowedKeysV83_(options, Object.keys(V84_RESTORE_DEFAULT_OPTIONS), 'options');
  var normalized = {};
  Object.keys(V84_RESTORE_DEFAULT_OPTIONS).forEach(function (key) {
    normalized[key] = Object.prototype.hasOwnProperty.call(options, key) ? toBoolean_(options[key], V84_RESTORE_DEFAULT_OPTIONS[key]) : V84_RESTORE_DEFAULT_OPTIONS[key];
  });
  return normalized;
}

function readRestoreOperationV84_() {
  var raw = cleanText_(scriptPropertiesV84_().getProperty(V84_BACKUP.PROPERTIES.RESTORE_OPERATION));
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (error) { throwBackupRestoreErrorV84_('ROLLBACK_REQUIRED', '還原工作狀態損壞，請檢查 Script Properties'); }
}

function saveRestoreOperationV84_(operation) {
  operation.updatedAt = new Date().toISOString();
  var properties = scriptPropertiesV84_();
  properties.setProperty(V84_BACKUP.PROPERTIES.RESTORE_OPERATION, JSON.stringify(operation));
  properties.setProperty(V84_BACKUP.PROPERTIES.RESTORE_OPERATION_ID, operation.operationId);
  return operation;
}

function restoreOperationToApiV84_(operation) {
  if (!operation) return null;
  return {
    operationId: operation.operationId,
    sourceBackupId: operation.sourceBackupId,
    originalSourceBackupId: operation.originalSourceBackupId || operation.sourceBackupId,
    emergencyBackupId: operation.emergencyBackupId || null,
    currentStage: operation.currentStage,
    startedAt: operation.startedAt,
    updatedAt: operation.updatedAt,
    status: operation.status,
    result: operation.result || null,
    error: operation.error || null,
    warnings: operation.warnings || [],
    completedSheets: operation.completedSheets || [],
    rollbackMode: Boolean(operation.rollbackMode),
    options: operation.options || {}
  };
}

function requireRestoreOperationV84_(operationId) {
  var operation = readRestoreOperationV84_();
  if (!operation || (cleanText_(operationId) && cleanText_(operation.operationId) !== cleanText_(operationId))) {
    throwBackupRestoreErrorV84_('BACKUP_NOT_FOUND', '找不到指定的還原工作');
  }
  return operation;
}

function backupSummaryFromRecordV84_(row) {
  return {
    transactionCount: toNumber_(row['交易筆數'], 0),
    assetCount: toNumber_(row['標的筆數'], 0),
    cashFlowCount: toNumber_(row['出入金筆數'], 0),
    snapshotCount: toNumber_(row['快照筆數'], 0)
  };
}

function openValidatedRestoreSourceV84_(backupId, allowLegacy) {
  var row = findBackupRecordV84_(backupId);
  var validationStatus = cleanText_(row['驗證狀態']);
  var legacy = validationStatus === 'LEGACY_UNVERIFIED';
  if (legacy && !allowLegacy) throwBackupRestoreErrorV84_('BACKUP_VALIDATION_FAILED', '這是舊版未驗證備份，必須額外確認後才能還原');
  if (!legacy && validationStatus !== 'VERIFIED') throwBackupRestoreErrorV84_('BACKUP_VALIDATION_FAILED', '只能還原已驗證的備份');
  var file;
  try {
    file = DriveApp.getFileById(cleanText_(row['檔案ID']));
    if (typeof file.isTrashed === 'function' && file.isTrashed()) throw new Error('trashed');
  } catch (error) {
    throwBackupRestoreErrorV84_('BACKUP_FILE_MISSING', '備份檔不存在或已移至垃圾桶');
  }
  var spreadsheet;
  try { spreadsheet = SpreadsheetApp.openById(file.getId()); }
  catch (error) { throwBackupRestoreErrorV84_('BACKUP_FILE_MISSING', '備份檔無法開啟'); }
  var validation = validateBackupCandidate_(spreadsheet, {
    sourceSpreadsheetId: cleanText_(row['正式檔ID']),
    backupId: cleanText_(row['備份ID']),
    expectedSummary: backupSummaryFromRecordV84_(row),
    expectedFingerprint: cleanText_(row['資料指紋']),
    requireArchiveMetadata: !legacy,
    requiredHeaders: legacy ? restoreRequiredHeadersV84_() : backupRequiredHeadersV84_(),
    requiredSheetNames: legacy ? restoreRequiredSheetNamesV84_() : V84_BACKUP.SOURCE_SHEETS.concat([V81.SHEETS.SETTINGS]),
    sourceSheetNames: legacy ? V84_BACKUP.SOURCE_SHEETS.filter(function (name) { return Boolean(spreadsheet.getSheetByName(name)); }) : V84_BACKUP.SOURCE_SHEETS
  });
  if (!validation.valid) {
    var modified = validation.checks.some(function (check) { return !check.ok && check.code === 'BACKUP_MODIFIED'; });
    throwBackupRestoreErrorV84_(modified ? 'BACKUP_MODIFIED' : 'BACKUP_VALIDATION_FAILED', modified ? '此備份內容可能已被修改，不能直接一鍵還原。' : '備份未通過還原前驗證', { errors: validation.errors });
  }
  var missingSnapshotSheets = [V81.SHEETS.TREND, V81.SHEETS.TREND_DETAIL].filter(function (name) { return !spreadsheet.getSheetByName(name); });
  return { spreadsheet: spreadsheet, record: row, backup: backupRecordToApiV84_(row), validation: validation, legacy: legacy, missingSnapshotSheets: missingSnapshotSheets };
}

function restorePreviewV84_(backupId) {
  var primary = assertPrimarySpreadsheet_();
  var source = openValidatedRestoreSourceV84_(backupId, true);
  var current = buildBackupSummary_(primary);
  var backup = source.validation.summary || buildBackupSummary_(source.spreadsheet);
  return {
    backup: source.backup,
    legacy: source.legacy,
    requiresLegacyConfirmation: source.legacy,
    missingSnapshotSheets: source.missingSnapshotSheets,
    snapshotRebuildRecommended: source.missingSnapshotSheets.length > 0,
    current: current,
    comparison: [
      { key: 'transactions', label: '投資交易', current: current.transactionCount, backup: backup.transactionCount },
      { key: 'assets', label: '投資標的', current: current.assetCount, backup: backup.assetCount },
      { key: 'cashFlows', label: '外部出入金', current: current.cashFlowCount, backup: backup.cashFlowCount },
      { key: 'snapshots', label: '快照筆數', current: current.snapshotCount, backup: backup.snapshotCount },
      { key: 'lastTransactionDate', label: '最後交易日', current: current.latestTransactionDate, backup: backup.latestTransactionDate },
      { key: 'lastSnapshotDate', label: '最後快照日', current: current.snapshotEndDate, backup: backup.snapshotEndDate }
    ],
    warning: '還原後，備份建立時間之後新增或修改的正式資料將被取代。系統會先建立還原前緊急備份。'
  };
}

function createRestoreEmergencyBackupV84_(operation) {
  var backupId = operation.emergencyBackupId || ('BKP-' + Utilities.getUuid());
  operation.emergencyBackupId = backupId;
  saveRestoreOperationV84_(operation);
  try {
    var existing = backupLogRowsV84_().find(function (row) { return cleanText_(row['備份ID']) === backupId && cleanText_(row['驗證狀態']) === 'VERIFIED'; });
    if (existing) return { backup: backupRecordToApiV84_(existing), validation: { valid: true, errors: [], checks: [] } };
    var result = createBackupCopyUnderLockV84_('PRE_RESTORE_EMERGENCY', '還原工作 ' + operation.operationId, backupId, new Date().toISOString(), 'RESTORE_EMERGENCY');
    if (!result.validation.valid) throwBackupRestoreErrorV84_('EMERGENCY_BACKUP_FAILED', '還原前緊急備份未通過驗證', { errors: result.validation.errors });
    return result;
  } catch (error) {
    if (error.apiCode === 'EMERGENCY_BACKUP_FAILED') throw error;
    throwBackupRestoreErrorV84_('EMERGENCY_BACKUP_FAILED', '還原前緊急備份失敗，還原已停止', { cause: cleanText_(error.message) });
  }
}

function prepareRestore_(backupId, options) {
  var normalizedOptions = normalizeRestoreOptionsV84_(options);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(V84_BACKUP.LOCK_TIMEOUT_MS)) throwBackupRestoreErrorV84_('SYSTEM_BUSY', '已有備份或還原工作正在執行');
  var operation;
  try {
    assertPrimarySpreadsheet_();
    var properties = scriptPropertiesV84_();
    var mode = cleanText_(properties.getProperty(V84_BACKUP.PROPERTIES.SYSTEM_MODE)) || V84_BACKUP.MODES.NORMAL;
    var existing = readRestoreOperationV84_();
    if (existing && existing.status === 'RUNNING') {
      if (cleanText_(existing.sourceBackupId) !== cleanText_(backupId)) throwBackupRestoreErrorV84_('RESTORE_ALREADY_RUNNING', '已有另一個還原工作正在執行');
      if ([V84_RESTORE_STAGES.PREPARED, V84_RESTORE_STAGES.SOURCE_RESTORED, V84_RESTORE_STAGES.FINALIZING, V84_RESTORE_STAGES.VALIDATING].indexOf(existing.currentStage) >= 0) {
        return { operation: restoreOperationToApiV84_(existing), emergencyBackup: backupRecordToApiV84_(findBackupRecordV84_(existing.emergencyBackupId)), resumed: true };
      }
      operation = existing;
    } else {
      if (mode !== V84_BACKUP.MODES.NORMAL) throwBackupRestoreErrorV84_('RESTORE_ALREADY_RUNNING', '系統目前不能開始新的還原工作', { mode: mode });
      var source = openValidatedRestoreSourceV84_(backupId, normalizedOptions.confirmLegacy);
      var sourceWarnings = source.legacy ? ['使用舊版未驗證備份；已完成額外指紋檢查。'] : [];
      if (source.missingSnapshotSheets.length) {
        normalizedOptions.restoreSnapshots = false;
        sourceWarnings.push(normalizedOptions.fullSnapshotRebuild ? '舊版備份缺少歷史快照；已啟動分批完整重建。' : '舊版備份缺少歷史快照；來源資料已可恢復，但歷史快照需要另行完整重建。');
      } else if (!normalizedOptions.restoreSnapshots) {
        sourceWarnings.push('本次未恢復備份中的歷史快照；若早期來源資料已變更，請另行完整重建。');
      }
      operation = {
        operationId: 'RST-' + Utilities.getUuid(),
        sourceBackupId: backupId,
        originalSourceBackupId: backupId,
        emergencyBackupId: '',
        currentStage: V84_RESTORE_STAGES.PREPARING,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'RUNNING',
        result: null,
        error: null,
        warnings: sourceWarnings,
        options: normalizedOptions,
        completedSheets: [],
        rollbackMode: false,
        protectedState: {
          apiKeyHash: cleanText_(properties.getProperty(V83_PROPERTIES.API_KEY_HASH)),
          apiKeyLast4: cleanText_(properties.getProperty(V83_PROPERTIES.API_KEY_LAST4)),
          apiKeyCreatedAt: cleanText_(properties.getProperty(V83_PROPERTIES.API_KEY_CREATED_AT)),
          primarySpreadsheetId: cleanText_(SpreadsheetApp.getActiveSpreadsheet().getId()),
          backupLogCount: backupLogRowsV84_().length,
          systemVersion: V81.VERSION,
          schemaVersion: V81.SCHEMA_VERSION,
          fileRole: V84_BACKUP.FILE_ROLE_PRIMARY
        }
      };
      operation.emergencyBackupId = 'BKP-' + Utilities.getUuid();
      saveRestoreOperationV84_(operation);
    }
    operationStateV84_({ SYSTEM_MODE: V84_BACKUP.MODES.RESTORE_RUNNING, CURRENT_OPERATION_ID: operation.operationId, CURRENT_OPERATION_STAGE: V84_RESTORE_STAGES.PREPARING, CURRENT_OPERATION_STARTED_AT: operation.startedAt, CURRENT_OPERATION_BACKUP_ID: operation.sourceBackupId, CURRENT_OPERATION_ERROR: '' });
    // 每次續跑 Prepare 都重新驗證來源；已完成的緊急備份依 ID 重用。
    openValidatedRestoreSourceV84_(operation.sourceBackupId, operation.options.confirmLegacy || operation.rollbackMode);
    var emergency = createRestoreEmergencyBackupV84_(operation);
    operation.currentStage = V84_RESTORE_STAGES.PREPARED;
    operation.error = null;
    saveRestoreOperationV84_(operation);
    operationStateV84_({ CURRENT_OPERATION_STAGE: V84_RESTORE_STAGES.PREPARED });
    return { operation: restoreOperationToApiV84_(operation), emergencyBackup: emergency.backup, resumed: false };
  } catch (error) {
    if (operation) {
      operation.currentStage = V84_RESTORE_STAGES.FAILED;
      operation.status = 'FAILED';
      operation.result = 'FAILED';
      operation.error = cleanText_(error.message);
      saveRestoreOperationV84_(operation);
    }
    // 若是另一個還原工作擋下本次請求，不可誤把既有工作的系統模式清回 NORMAL。
    if (operation) {
      operationStateV84_({ SYSTEM_MODE: V84_BACKUP.MODES.NORMAL, CURRENT_OPERATION_ID: '', CURRENT_OPERATION_STAGE: '', CURRENT_OPERATION_STARTED_AT: '', CURRENT_OPERATION_BACKUP_ID: '', CURRENT_OPERATION_ERROR: cleanText_(error.message) });
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function restoreSourceSheetByHeaders_(backupSpreadsheet, primarySpreadsheet, sheetName, requiredHeaders) {
  var sourceSheet = backupSpreadsheet.getSheetByName(sheetName);
  var targetSheet = primarySpreadsheet.getSheetByName(sheetName);
  if (!sourceSheet || !targetSheet) throwBackupRestoreErrorV84_('BACKUP_REQUIRED_SHEET_MISSING', '還原缺少分頁：' + sheetName);
  var sourceRange = sourceSheet.getDataRange();
  var sourceValues = sourceRange.getValues();
  var sourceDisplayValues = typeof sourceRange.getDisplayValues === 'function' ? sourceRange.getDisplayValues() : sourceValues;
  var targetValues = targetSheet.getDataRange().getValues();
  var sourceHeaders = sourceValues.length ? sourceValues[0].map(cleanText_) : [];
  var targetHeaders = targetValues.length ? targetValues[0].map(cleanText_) : [];
  var sourceMap = headerMap_(sourceHeaders);
  var targetMap = headerMap_(targetHeaders);
  var missingSource = (requiredHeaders || []).filter(function (header) { return sourceMap[header] == null; });
  var missingTarget = (requiredHeaders || []).filter(function (header) { return targetMap[header] == null; });
  if (missingSource.length || missingTarget.length) {
    throwBackupRestoreErrorV84_('BACKUP_REQUIRED_HEADER_MISSING', sheetName + ' 缺少必要欄位', { source: missingSource, target: missingTarget });
  }
  var sourceDataRows = [];
  for (var sourceIndex = 1; sourceIndex < sourceValues.length; sourceIndex++) {
    if (sourceValues[sourceIndex].some(function (value) { return value !== '' && value != null; })) sourceDataRows.push({ values: sourceValues[sourceIndex], display: sourceDisplayValues[sourceIndex] || sourceValues[sourceIndex] });
  }
  var outputRows = sourceDataRows.map(function (sourceRow) {
    return targetHeaders.map(function (header) {
      var sourceColumn = sourceMap[header];
      if (sourceColumn == null) return '';
      if (header === '標的代號') return cleanText_(sourceRow.display[sourceColumn]);
      return sourceRow.values[sourceColumn] == null ? '' : sourceRow.values[sourceColumn];
    });
  });
  var lastRow = targetSheet.getLastRow();
  if (lastRow > 1) targetSheet.getRange(2, 1, lastRow - 1, targetHeaders.length).clearContent();
  if (outputRows.length) {
    if (targetSheet.getMaxRows() < outputRows.length + 1) targetSheet.insertRowsAfter(targetSheet.getMaxRows(), outputRows.length + 1 - targetSheet.getMaxRows());
    var codeColumn = targetMap['標的代號'];
    if (codeColumn != null) targetSheet.getRange(2, codeColumn + 1, outputRows.length, 1).setNumberFormat('@');
    for (var start = 0; start < outputRows.length; start += V84_BACKUP.RESTORE_BATCH_SIZE) {
      var batch = outputRows.slice(start, start + V84_BACKUP.RESTORE_BATCH_SIZE);
      targetSheet.getRange(start + 2, 1, batch.length, targetHeaders.length).setValues(batch);
    }
  }
  return { sheet: sheetName, rows: outputRows.length, columns: targetHeaders.length };
}

function restoreAllowedSettings_(backupSpreadsheet) {
  var sourceSettings = settingsMapFromSpreadsheetV84_(backupSpreadsheet);
  var updates = {};
  RESTORABLE_SETTING_KEYS.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(sourceSettings, key)) updates[key] = sourceSettings[key];
  });
  if (Object.keys(updates).length) setSettingValues_(updates);
  return { restoredKeys: Object.keys(updates), skippedUnknownKeys: Object.keys(sourceSettings).filter(function (key) { return RESTORABLE_SETTING_KEYS.indexOf(key) < 0; }).length };
}

function clearSheetDataRowsV84_(sheetName) {
  var sheet = getSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
  return { sheet: sheetName, clearedRows: Math.max(0, lastRow - 1) };
}

function clearDerivedOutputs_() {
  var cleared = [
    clearSheetDataRowsV84_(V81.SHEETS.CALCULATION),
    clearSheetDataRowsV84_(V81.SHEETS.PERFORMANCE),
    clearSheetDataRowsV84_(V81.SHEETS.CATEGORY_PERFORMANCE),
    clearSheetDataRowsV84_(V81.SHEETS.TEMP)
  ];
  var dashboard = getSheet_(V81.SHEETS.DASHBOARD);
  var dashboardLastRow = dashboard.getLastRow();
  if (dashboardLastRow > 0) dashboard.getRange(1, 1, dashboardLastRow, Math.max(dashboard.getLastColumn(), 1)).clearContent();
  setSettingValues_({ NEEDS_RECALC: 'TRUE', TREND_DIRTY_FROM_DATE: V81.TREND_START_DATE, LAST_VALIDATION_STATUS: 'PENDING' });
  cleared.push({ sheet: V81.SHEETS.DASHBOARD, clearedRows: dashboardLastRow });
  return cleared;
}

function applyRestore_(operationId) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(V84_BACKUP.LOCK_TIMEOUT_MS)) throwBackupRestoreErrorV84_('SYSTEM_BUSY', '還原來源資料正在處理');
  var operation;
  try {
    var primary = assertPrimarySpreadsheet_();
    operation = requireRestoreOperationV84_(operationId);
    if (operation.status === 'SUCCESS' || operation.currentStage === V84_RESTORE_STAGES.SOURCE_RESTORED) return { operation: restoreOperationToApiV84_(operation), resumed: true };
    if (operation.status !== 'RUNNING' || [V84_RESTORE_STAGES.PREPARED, V84_RESTORE_STAGES.APPLYING].indexOf(operation.currentStage) < 0) {
      throwBackupRestoreErrorV84_('ROLLBACK_REQUIRED', '還原工作狀態不允許寫入來源資料');
    }
    var source = openValidatedRestoreSourceV84_(operation.sourceBackupId, operation.options.confirmLegacy || operation.rollbackMode);
    operation.currentStage = V84_RESTORE_STAGES.APPLYING;
    operation.error = null;
    saveRestoreOperationV84_(operation);
    operationStateV84_({ SYSTEM_MODE: V84_BACKUP.MODES.RESTORE_RUNNING, CURRENT_OPERATION_ID: operation.operationId, CURRENT_OPERATION_STAGE: V84_RESTORE_STAGES.APPLYING, CURRENT_OPERATION_BACKUP_ID: operation.sourceBackupId });
    var required = restoreRequiredHeadersV84_();
    var sheets = [V81.SHEETS.TRANSACTIONS, V81.SHEETS.ASSETS, V81.SHEETS.CASH_FLOWS];
    if (operation.options.restoreSnapshots) sheets = sheets.concat([V81.SHEETS.TREND, V81.SHEETS.TREND_DETAIL]);
    var writes = [];
    operation.completedSheets = operation.completedSheets || [];
    sheets.forEach(function (sheetName) {
      if (operation.completedSheets.indexOf(sheetName) >= 0) return;
      writes.push(restoreSourceSheetByHeaders_(source.spreadsheet, primary, sheetName, required[sheetName]));
      operation.completedSheets.push(sheetName);
      saveRestoreOperationV84_(operation);
    });
    if (operation.options.restoreBusinessSettings && operation.completedSheets.indexOf('RESTORABLE_SETTINGS') < 0) {
      writes.push(restoreAllowedSettings_(source.spreadsheet));
      operation.completedSheets.push('RESTORABLE_SETTINGS');
      saveRestoreOperationV84_(operation);
    }
    if (operation.completedSheets.indexOf('DERIVED_OUTPUTS_CLEARED') < 0) {
      writes.push({ cleared: clearDerivedOutputs_() });
      operation.completedSheets.push('DERIVED_OUTPUTS_CLEARED');
      saveRestoreOperationV84_(operation);
    }
    operation.currentStage = V84_RESTORE_STAGES.SOURCE_RESTORED;
    saveRestoreOperationV84_(operation);
    operationStateV84_({ CURRENT_OPERATION_STAGE: V84_RESTORE_STAGES.SOURCE_RESTORED });
    return { operation: restoreOperationToApiV84_(operation), writes: writes, resumed: false };
  } catch (error) {
    if (operation) {
      operation.currentStage = V84_RESTORE_STAGES.FAILED;
      operation.status = 'FAILED';
      operation.result = 'ROLLBACK_REQUIRED';
      operation.error = cleanText_(error.message);
      saveRestoreOperationV84_(operation);
      operationStateV84_({ SYSTEM_MODE: V84_BACKUP.MODES.RESTORE_FAILED, CURRENT_OPERATION_STAGE: V84_RESTORE_STAGES.FAILED, CURRENT_OPERATION_ERROR: operation.error });
    }
    throwBackupRestoreErrorV84_('ROLLBACK_REQUIRED', '來源資料還原失敗，請回復還原前狀態', { operation: restoreOperationToApiV84_(operation), cause: cleanText_(error.message) });
  } finally {
    lock.releaseLock();
  }
}

function runPostRestoreRebuild_(operation) {
  var warnings = operation.warnings ? operation.warnings.slice() : [];
  var result = {};
  if (operation.options.refreshPrices) {
    try {
      result.prices = refreshPricesInternal_();
      if (result.prices.failed > 0) warnings.push('部分價格或基金淨值更新失敗，已保留可用快取。');
    } catch (error) { warnings.push('價格或基金淨值更新暫時失敗：' + cleanText_(error.message)); }
  }
  if (operation.options.refreshFx) {
    try {
      result.fx = refreshExchangeRatesInternal_();
      if (result.fx.failed > 0) warnings.push('部分匯率更新失敗，已保留可用快取。');
    } catch (error) { warnings.push('匯率更新暫時失敗：' + cleanText_(error.message)); }
  }
  result.rebuild = rebuildInvestmentStateInternal_({});
  if (result.rebuild.errorCount > 0) throwBackupRestoreErrorV84_('POST_RESTORE_VALIDATION_FAILED', '持倉重算後仍有資料錯誤', { errorCount: result.rebuild.errorCount });
  result.dashboard = refreshDashboardInternalV82_();
  result.snapshotsBefore = validateSnapshots_();
  if (operation.options.fullSnapshotRebuild) {
    saveTrendCursorV82_(createTrendCursorV82_(V81.TREND_START_DATE, new Date()));
    result.snapshotRebuild = continueTrendRebuildInternalV82_();
    if (result.snapshotRebuild.hasMore) warnings.push('完整歷史快照重建已完成一批，仍需續跑。');
  } else if (operation.options.fillMissingSnapshots) {
    result.snapshotFill = rebuildMissingTrendSnapshotsInternalV82_();
    if (result.snapshotFill.missingAfter > 0) warnings.push('缺漏快照已補建一批，仍有後續月份待處理。');
  }
  result.trigger = auditManagedDailyTrigger_();
  return { result: result, warnings: warnings };
}

function finalizeRestore_(operationId) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(V84_BACKUP.LOCK_TIMEOUT_MS)) throwBackupRestoreErrorV84_('SYSTEM_BUSY', '還原後維護正在處理');
  var operation;
  try {
    assertPrimarySpreadsheet_();
    operation = requireRestoreOperationV84_(operationId);
    if (operation.status === 'SUCCESS') return { operation: restoreOperationToApiV84_(operation), resumed: true };
    if (operation.status !== 'RUNNING' || [V84_RESTORE_STAGES.SOURCE_RESTORED, V84_RESTORE_STAGES.FINALIZING, V84_RESTORE_STAGES.VALIDATING].indexOf(operation.currentStage) < 0) {
      throwBackupRestoreErrorV84_('ROLLBACK_REQUIRED', '還原工作尚未完成來源資料寫入');
    }
    operation.currentStage = V84_RESTORE_STAGES.FINALIZING;
    saveRestoreOperationV84_(operation);
    operationStateV84_({ SYSTEM_MODE: V84_BACKUP.MODES.RESTORE_RUNNING, CURRENT_OPERATION_STAGE: V84_RESTORE_STAGES.FINALIZING });
    var maintenance = runPostRestoreRebuild_(operation);
    operation.warnings = maintenance.warnings;
    operation.currentStage = V84_RESTORE_STAGES.VALIDATING;
    saveRestoreOperationV84_(operation);
    operationStateV84_({ CURRENT_OPERATION_STAGE: V84_RESTORE_STAGES.VALIDATING });
    var validation = validatePostRestore_(operation);
    if (!validation.valid) throwBackupRestoreErrorV84_('POST_RESTORE_VALIDATION_FAILED', '還原後完整驗證未通過', { errors: validation.errors });
    operation.warnings = operation.warnings.concat(validation.warnings || []).filter(function (warning, index, all) { return warning && all.indexOf(warning) === index; });
    operation.currentStage = V84_RESTORE_STAGES.SUCCESS;
    operation.status = 'SUCCESS';
    operation.result = operation.warnings.length ? 'SUCCESS_WITH_WARNINGS' : 'SUCCESS';
    operation.error = null;
    saveRestoreOperationV84_(operation);
    operationStateV84_({ SYSTEM_MODE: V84_BACKUP.MODES.NORMAL, CURRENT_OPERATION_ID: '', CURRENT_OPERATION_STAGE: '', CURRENT_OPERATION_STARTED_AT: '', CURRENT_OPERATION_BACKUP_ID: '', CURRENT_OPERATION_ERROR: '' });
    return { operation: restoreOperationToApiV84_(operation), maintenance: maintenance.result, validation: validation, resumed: false };
  } catch (error) {
    if (operation) {
      operation.currentStage = V84_RESTORE_STAGES.FAILED;
      operation.status = 'FAILED';
      operation.result = 'ROLLBACK_REQUIRED';
      operation.error = cleanText_(error.message);
      saveRestoreOperationV84_(operation);
      operationStateV84_({ SYSTEM_MODE: V84_BACKUP.MODES.RESTORE_FAILED, CURRENT_OPERATION_STAGE: V84_RESTORE_STAGES.FAILED, CURRENT_OPERATION_ERROR: operation.error });
    }
    if (error.apiCode === 'ROLLBACK_REQUIRED') throw error;
    throwBackupRestoreErrorV84_('ROLLBACK_REQUIRED', '還原後核心驗證失敗，請回復還原前狀態', { operation: restoreOperationToApiV84_(operation), cause: cleanText_(error.message) });
  } finally {
    lock.releaseLock();
  }
}

function rollbackRestore_(operationId) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(V84_BACKUP.LOCK_TIMEOUT_MS)) throwBackupRestoreErrorV84_('SYSTEM_BUSY', '還原回復正在處理');
  try {
    assertPrimarySpreadsheet_();
    var operation = requireRestoreOperationV84_(operationId);
    if (!operation.emergencyBackupId) throwBackupRestoreErrorV84_('EMERGENCY_BACKUP_FAILED', '找不到還原前緊急備份');
    openValidatedRestoreSourceV84_(operation.emergencyBackupId, false);
    operation.originalSourceBackupId = operation.originalSourceBackupId || operation.sourceBackupId;
    operation.sourceBackupId = operation.emergencyBackupId;
    operation.currentStage = V84_RESTORE_STAGES.PREPARED;
    operation.status = 'RUNNING';
    operation.result = null;
    operation.error = null;
    operation.warnings = ['正在使用還原前緊急備份回復正式資料。'];
    operation.completedSheets = [];
    operation.rollbackMode = true;
    operation.options.confirmLegacy = false;
    saveRestoreOperationV84_(operation);
    operationStateV84_({ SYSTEM_MODE: V84_BACKUP.MODES.RESTORE_RUNNING, CURRENT_OPERATION_ID: operation.operationId, CURRENT_OPERATION_STAGE: V84_RESTORE_STAGES.PREPARED, CURRENT_OPERATION_BACKUP_ID: operation.emergencyBackupId, CURRENT_OPERATION_ERROR: '' });
    return { operation: restoreOperationToApiV84_(operation) };
  } finally {
    lock.releaseLock();
  }
}

function restoreStatusV84_(operationId) {
  assertPrimarySpreadsheet_();
  var operation = readRestoreOperationV84_();
  if (cleanText_(operationId) && (!operation || cleanText_(operation.operationId) !== cleanText_(operationId))) throwBackupRestoreErrorV84_('BACKUP_NOT_FOUND', '找不到指定的還原工作');
  var mode = cleanText_(scriptPropertiesV84_().getProperty(V84_BACKUP.PROPERTIES.SYSTEM_MODE)) || V84_BACKUP.MODES.NORMAL;
  return { systemMode: mode, operation: restoreOperationToApiV84_(operation), hasUnfinishedOperation: Boolean(operation && operation.status === 'RUNNING'), rollbackRequired: Boolean(operation && operation.result === 'ROLLBACK_REQUIRED') };
}
