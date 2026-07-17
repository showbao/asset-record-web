function backupApiPayloadV84_(payload, allowed) {
  return ensureAllowedKeysV83_(payload || {}, allowed || [], 'payload');
}

function assertNormalApiModeV84_() {
  var mode = cleanText_(scriptPropertiesV84_().getProperty(V84_BACKUP.PROPERTIES.SYSTEM_MODE)) || V84_BACKUP.MODES.NORMAL;
  if (mode === V84_BACKUP.MODES.RESTORE_RUNNING || mode === V84_BACKUP.MODES.RESTORE_FAILED) {
    throwBackupRestoreErrorV84_('SYSTEM_BUSY', mode === V84_BACKUP.MODES.RESTORE_FAILED ? '系統等待回復還原前狀態，暫時只能查看還原工作。' : '系統正在還原資料，請稍候。', { mode: mode });
  }
  return mode;
}

function routeBackupApiActionV84_(action, params, payload, requestId) {
  if (action === 'backup.getOverview') {
    ensureAllowedKeysV83_(params || {}, [], 'params');
    backupApiPayloadV84_(payload, []);
    return apiResult_(true, 'OK', '', backupOverviewV84_());
  }
  if (action === 'backup.create') {
    ensureAllowedKeysV83_(params || {}, [], 'params');
    payload = backupApiPayloadV84_(payload, ['reason', 'note']);
    var created = createFullBackup_(payload.reason, payload.note, requestId);
    return apiResult_(true, 'OK', '備份已建立並通過驗證', created);
  }
  if (action === 'backup.list') {
    params = ensureAllowedKeysV83_(params || {}, ['includeInvalid'], 'params');
    backupApiPayloadV84_(payload, []);
    return apiResult_(true, 'OK', '', { items: listAvailableBackups_(params) });
  }
  if (action === 'backup.preview') {
    params = ensureAllowedKeysV83_(params || {}, ['backupId'], 'params');
    backupApiPayloadV84_(payload, []);
    assertPrimarySpreadsheet_();
    return apiResult_(true, 'OK', '', { backup: backupRecordToApiV84_(findBackupRecordV84_(params.backupId)) });
  }
  if (action === 'backup.validate') {
    params = ensureAllowedKeysV83_(params || {}, ['backupId'], 'params');
    backupApiPayloadV84_(payload, []);
    var validated = validateBackupByIdV84_(params.backupId);
    if (!validated.validation.valid) throwBackupRestoreErrorV84_('BACKUP_VALIDATION_FAILED', '備份未通過驗證', validated);
    return apiResult_(true, 'OK', '備份驗證通過', validated);
  }
  if (action === 'backup.registerLegacy') {
    ensureAllowedKeysV83_(params || {}, [], 'params');
    payload = backupApiPayloadV84_(payload, ['url']);
    return apiResult_(true, 'OK', '舊版備份已加入', registerLegacyBackupV84_(payload.url));
  }
  throwBackupRestoreErrorV84_('ACTION_NOT_FOUND', '不支援的備份 action：' + action);
}

function routeRestoreApiActionV84_(action, params, payload) {
  if (action === 'restore.preview') {
    params = ensureAllowedKeysV83_(params || {}, ['backupId'], 'params');
    backupApiPayloadV84_(payload, []);
    return apiResult_(true, 'OK', '', restorePreviewV84_(params.backupId));
  }
  if (action === 'restore.prepare') {
    ensureAllowedKeysV83_(params || {}, [], 'params');
    payload = backupApiPayloadV84_(payload, ['backupId', 'options']);
    return apiResult_(true, 'OK', '還原前緊急備份已建立並通過驗證', prepareRestore_(payload.backupId, payload.options || {}));
  }
  if (action === 'restore.apply') {
    ensureAllowedKeysV83_(params || {}, [], 'params');
    payload = backupApiPayloadV84_(payload, ['operationId']);
    return apiResult_(true, 'OK', '正式來源資料已恢復', applyRestore_(payload.operationId));
  }
  if (action === 'restore.finalize') {
    ensureAllowedKeysV83_(params || {}, [], 'params');
    payload = backupApiPayloadV84_(payload, ['operationId']);
    var finalized = finalizeRestore_(payload.operationId);
    var finalResponse = apiResult_(true, finalized.operation.result || 'SUCCESS', finalized.operation.result === 'SUCCESS_WITH_WARNINGS' ? '資料已還原，但有警告需要留意' : '資料還原完成', finalized);
    finalResponse.warnings = finalized.operation.warnings || [];
    return finalResponse;
  }
  if (action === 'restore.status') {
    params = ensureAllowedKeysV83_(params || {}, ['operationId'], 'params');
    backupApiPayloadV84_(payload, []);
    return apiResult_(true, 'OK', '', restoreStatusV84_(params.operationId));
  }
  if (action === 'restore.rollback') {
    ensureAllowedKeysV83_(params || {}, [], 'params');
    payload = backupApiPayloadV84_(payload, ['operationId']);
    return apiResult_(true, 'OK', '已準備使用還原前緊急備份回復', rollbackRestore_(payload.operationId));
  }
  throwBackupRestoreErrorV84_('ACTION_NOT_FOUND', '不支援的還原 action：' + action);
}

function installV84() {
  if (/^8\.5\./.test(V81.VERSION) && typeof installV85 === 'function') return installV85();
  var generatedKey = '';
  try {
    var result = withDocumentLock_(function () {
      var schema = ensureV81Schema_();
      var sequences = initializeIdSequences_();
      var trigger = installDailyTriggerV82_();
      var properties = PropertiesService.getScriptProperties();
      if (!cleanText_(properties.getProperty(V83_PROPERTIES.API_KEY_HASH))) {
        generatedKey = generateApiKeyV83_();
        storeApiKeyV83_(generatedKey);
      }
      ensurePrimaryFileRoleV84_();
      setSettingValues_({
        SYSTEM_VERSION: V84_BACKUP.VERSION,
        SCHEMA_VERSION: V84_BACKUP.SCHEMA_VERSION,
        TIMEZONE: V81.TIMEZONE,
        BASE_CURRENCY: V81.BASE_CURRENCY,
        DAILY_JOB_ENABLED: 'TRUE',
        DAILY_JOB_TIME: '07:30',
        LAST_VALIDATION_STATUS: 'PENDING',
        FILE_ROLE: V84_BACKUP.FILE_ROLE_PRIMARY
      });
      onOpen();
      return apiResult_(true, 'OK', 'V8.5.0 安裝完成', {
        schema: schema,
        sequences: sequences,
        trigger: trigger,
        apiKeyCreated: Boolean(generatedKey),
        apiKeyLast4: properties.getProperty(V83_PROPERTIES.API_KEY_LAST4) || null,
        backupInfrastructure: '首次建立備份時自動建置',
        next: ['backup.getOverview', 'backup.create', 'backup.list', 'restore.preview', 'restore.prepare']
      });
    });
    if (generatedKey) showApiKeyOnceV83_(generatedKey);
    return result;
  } catch (error) {
    return apiResult_(false, error.apiCode || 'INSTALL_V84_FAILED', error.message, error.details || {});
  }
}
