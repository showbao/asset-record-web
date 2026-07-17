function authStatusApiV85_(options) {
  var state = authLockStateV85_(options);
  return {
    configured: isAuthConfiguredV85_(options),
    mode: authModeV85_(options),
    algorithm: V85_AUTH.ALGORITHM,
    locked: state.locked,
    lockedUntil: state.locked ? new Date(state.lockedUntil).toISOString() : null,
    version: V81.VERSION
  };
}

function authLoginApiV85_(payload, options) {
  payload = ensureAllowedKeysV83_(payload || {}, ['username', 'derivedKey', 'sessionTokenCandidate', 'rememberMe'], 'payload');
  if (!isAuthConfiguredV85_(options)) throwApiErrorV83_('AUTH_NOT_CONFIGURED', '請先至 Google Sheet 設定網頁登入帳密');
  return withAuthLockV85_(function () {
    var state = authLockStateV85_(options);
    if (state.locked) throwApiErrorV83_('AUTH_LOCKED', '帳號或密碼錯誤，請稍後再試。');
    var valid = verifyCredentialV85_(payload.username, payload.derivedKey, options);
    if (!valid) {
      registerFailedLoginV85_(Object.assign({}, options || {}, { skipLock: true }));
      throwApiErrorV83_('AUTH_INVALID_CREDENTIALS', '帳號或密碼錯誤，請稍後再試。');
    }
    clearFailedLoginV85_(Object.assign({}, options || {}, { skipLock: true }));
    return createSessionV85_(validateBase64UrlV85_(payload.sessionTokenCandidate, 'Session Token', 40), Boolean(payload.rememberMe), Object.assign({}, options || {}, { skipLock: true }));
  }, options);
}

function authElevateApiV85_(request, options) {
  var payload = ensureAllowedKeysV83_(request.payload || {}, ['username', 'derivedKey', 'elevatedTokenCandidate', 'scope'], 'payload');
  return withAuthLockV85_(function () {
    requireSessionV85_(request.sessionToken, options);
    var state = authLockStateV85_(options);
    if (state.locked) throwApiErrorV83_('AUTH_LOCKED', '帳號或密碼錯誤，請稍後再試。');
    if (!verifyCredentialV85_(payload.username, payload.derivedKey, options)) {
      registerFailedLoginV85_(Object.assign({}, options || {}, { skipLock: true }));
      throwApiErrorV83_('AUTH_INVALID_CREDENTIALS', '帳號或密碼錯誤，請稍後再試。');
    }
    clearFailedLoginV85_(Object.assign({}, options || {}, { skipLock: true }));
    return createElevatedSessionV85_(request.sessionToken, validateBase64UrlV85_(payload.elevatedTokenCandidate, 'Elevated Token', 40), payload.scope, Object.assign({}, options || {}, { skipLock: true }));
  }, options);
}

function routeAuthApiActionV85_(action, request, options) {
  var payload = request.payload || {};
  if (action === 'auth.status') {
    ensureAllowedKeysV83_(payload, [], 'payload');
    return apiResult_(true, 'OK', '', authStatusApiV85_(options));
  }
  if (action === 'auth.begin') {
    payload = ensureAllowedKeysV83_(payload, ['username'], 'payload');
    return apiResult_(true, 'OK', '', authParametersForUsernameV85_(payload.username, options));
  }
  if (action === 'auth.login') return apiResult_(true, 'OK', '登入成功', authLoginApiV85_(payload, options));
  if (action === 'auth.getSession') {
    var session = requireSessionV85_(request.sessionToken, options);
    return apiResult_(true, 'OK', '', { sessionId: session.id, username: cleanText_(authPropertyStoreV85_(options).getProperty(V85_AUTH.PROPERTIES.USERNAME)), expiresAt: new Date(session.expiresAt).toISOString(), rememberMe: Boolean(session.rememberMe) });
  }
  if (action === 'auth.logout') {
    revokeSessionV85_(request.sessionToken, options);
    return apiResult_(true, 'OK', '已登出', {});
  }
  if (action === 'auth.elevate') return apiResult_(true, 'OK', '再次驗證完成', authElevateApiV85_(request, options));
  if (action === 'auth.logoutAll') {
    requireElevatedSessionV85_(request.sessionToken, request.elevatedToken, 'account', options);
    var count = revokeAllSessionsV85_(options);
    return apiResult_(true, 'OK', '所有裝置均已登出', { revokedSessions: count });
  }
  if (action === 'auth.changePassword') {
    requireElevatedSessionV85_(request.sessionToken, request.elevatedToken, 'password', options);
    var changed = changeCredentialVerifierV85_(payload, options);
    return apiResult_(true, 'OK', '登入密碼已更新，請重新登入', changed);
  }
  throwApiErrorV83_('ACTION_NOT_FOUND', '不支援的登入 action');
}

function getAuthDialogParametersV85() {
  return { algorithm: V85_AUTH.ALGORITHM, iterations: V85_AUTH.DEFAULT_ITERATIONS, minPasswordLength: V85_AUTH.MIN_PASSWORD_LENGTH, maxPasswordLength: V85_AUTH.MAX_PASSWORD_LENGTH };
}

function saveCredentialFromDialogV85(payload) {
  try {
    assertMutationAllowedV84_();
    return apiResult_(true, 'OK', '網頁登入帳密已設定，所有舊 Session 已失效', saveCredentialVerifierV85_(payload));
  } catch (error) {
    return apiResult_(false, error.apiCode || 'INTERNAL_ERROR', error.apiCode ? error.message : '帳密設定失敗', error.details || {});
  }
}

function showAuthCredentialDialogV85() {
  assertMutationAllowedV84_();
  var html = HtmlService.createHtmlOutputFromFile('AuthCredentialDialog').setWidth(520).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, '設定／重設網頁登入帳密');
}

function unlockWebLoginV85() {
  assertMutationAllowedV84_();
  unlockAccountV85_();
  SpreadsheetApp.getActive().toast('網頁登入鎖定已解除。', '資產記錄', 5);
}

function logoutAllDevicesFromSheetV85() {
  assertMutationAllowedV84_();
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('登出所有裝置', '這會立即撤銷所有網頁 Session，是否繼續？', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var count = revokeAllSessionsV85_();
  ui.alert('已撤銷 ' + count + ' 個 Session。');
}

function showWebLoginStatusV85() {
  var status = authStatusApiV85_();
  var sessions = pruneExpiredSessionsV85_(readSessionsV85_());
  var properties = authPropertyStoreV85_();
  var lines = [
    '狀態：' + (status.configured ? '已設定' : '尚未設定'),
    '驗證模式：' + status.mode,
    '有效 Session：' + sessions.length + ' / ' + V85_AUTH.MAX_SESSIONS,
    '登入鎖定：' + (status.locked ? '至 ' + status.lockedUntil : '否'),
    '最近成功：' + (cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.LAST_SUCCESS_AT)) || '—'),
    '最近失敗：' + (cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.LAST_FAILED_AT)) || '—'),
    '更新時間：' + (cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.UPDATED_AT)) || '—')
  ];
  SpreadsheetApp.getUi().alert('網頁登入狀態', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

function installV85() {
  try {
    return withDocumentLock_(function () {
      var schema = ensureV81Schema_();
      var sequences = initializeIdSequences_();
      var trigger = installDailyTriggerV82_();
      var properties = authPropertyStoreV85_();
      if (!cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.MODE))) properties.setProperty(V85_AUTH.PROPERTIES.MODE, V85_AUTH.MODE_DUAL);
      ensurePrimaryFileRoleV84_();
      setSettingValues_({
        SYSTEM_VERSION: V81.VERSION,
        SCHEMA_VERSION: V81.SCHEMA_VERSION,
        TIMEZONE: V81.TIMEZONE,
        BASE_CURRENCY: V81.BASE_CURRENCY,
        DAILY_JOB_ENABLED: 'TRUE',
        DAILY_JOB_TIME: '07:30',
        LAST_VALIDATION_STATUS: 'PENDING',
        FILE_ROLE: V84_BACKUP.FILE_ROLE_PRIMARY
      });
      onOpen();
      return apiResult_(true, 'OK', 'V8.5.0 安裝完成；請設定網頁登入帳密', { schema: schema, sequences: sequences, trigger: trigger, auth: authStatusApiV85_() });
    });
  } catch (error) {
    return apiResult_(false, error.apiCode || 'INSTALL_V85_FAILED', error.message, error.details || {});
  }
}
