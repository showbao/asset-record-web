function readSessionsV85_(options) {
  var raw = cleanText_(authPropertyStoreV85_(options).getProperty(V85_AUTH.PROPERTIES.SESSIONS_JSON));
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (ignore) {
    return [];
  }
}

function writeSessionsV85_(sessions, options) {
  authPropertyStoreV85_(options).setProperty(V85_AUTH.PROPERTIES.SESSIONS_JSON, JSON.stringify(sessions || []));
  return sessions || [];
}

function sessionHashV85_(token, options) {
  var secret = cleanText_(authPropertyStoreV85_(options).getProperty(V85_AUTH.PROPERTIES.SESSION_SECRET));
  if (!secret) throwApiErrorV83_('AUTH_NOT_CONFIGURED', '尚未設定登入帳密');
  return hmacBase64UrlV85_(validateBase64UrlV85_(token, 'Session Token', 40), secret);
}

function pruneExpiredSessionsV85_(sessions, options) {
  var now = authNowMsV85_(options);
  var properties = authPropertyStoreV85_(options);
  var passwordVersion = Number(properties.getProperty(V85_AUTH.PROPERTIES.PASSWORD_VERSION)) || 0;
  var sessionVersion = Number(properties.getProperty(V85_AUTH.PROPERTIES.SESSION_VERSION)) || 1;
  return (sessions || readSessionsV85_(options)).filter(function (session) {
    return Number(session.expiresAt) > now && Number(session.passwordVersion) === passwordVersion && Number(session.sessionVersion || 1) === sessionVersion;
  }).map(function (session) {
    session.elevated = (session.elevated || []).filter(function (entry) { return Number(entry.expiresAt) > now; });
    return session;
  });
}

function createSessionV85_(tokenCandidate, rememberMe, options) {
  return withAuthLockV85_(function () {
    var now = authNowMsV85_(options);
    var ttl = rememberMe ? V85_AUTH.REMEMBER_SESSION_TTL_MS : V85_AUTH.SESSION_TTL_MS;
    var sessions = pruneExpiredSessionsV85_(readSessionsV85_(options), options);
    var session = {
      id: Utilities.getUuid(),
      tokenHash: sessionHashV85_(tokenCandidate, options),
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now + ttl,
      passwordVersion: Number(authPropertyStoreV85_(options).getProperty(V85_AUTH.PROPERTIES.PASSWORD_VERSION)) || 1,
      sessionVersion: Number(authPropertyStoreV85_(options).getProperty(V85_AUTH.PROPERTIES.SESSION_VERSION)) || 1,
      rememberMe: Boolean(rememberMe),
      elevated: []
    };
    sessions.push(session);
    sessions.sort(function (a, b) { return Number(b.lastUsedAt) - Number(a.lastUsedAt); });
    sessions = sessions.slice(0, V85_AUTH.MAX_SESSIONS);
    writeSessionsV85_(sessions, options);
    return { sessionId: session.id, expiresAt: new Date(session.expiresAt).toISOString(), rememberMe: session.rememberMe };
  }, options);
}

function findSessionByTokenV85_(token, options) {
  var tokenHash = sessionHashV85_(token, options);
  var sessions = pruneExpiredSessionsV85_(readSessionsV85_(options), options);
  var found = null;
  sessions.some(function (session) {
    if (constantTimeEqualsV85_(session.tokenHash, tokenHash)) { found = session; return true; }
    return false;
  });
  return { session: found, sessions: sessions };
}

function requireSessionV85_(token, options) {
  if (!cleanText_(token)) throwApiErrorV83_('AUTH_REQUIRED', '請先登入');
  var result;
  try { result = findSessionByTokenV85_(token, options); }
  catch (error) {
    if (error.apiCode === 'AUTH_NOT_CONFIGURED') throw error;
    throwApiErrorV83_('AUTH_SESSION_REVOKED', '登入已失效，請重新登入');
  }
  if (!result.session) {
    writeSessionsV85_(result.sessions, options);
    throwApiErrorV83_('AUTH_SESSION_EXPIRED', '登入已逾時，請重新登入');
  }
  var now = authNowMsV85_(options);
  if (now - Number(result.session.lastUsedAt) >= 5 * 60 * 1000) {
    result.session.lastUsedAt = now;
    writeSessionsV85_(result.sessions, options);
  }
  return result.session;
}

function revokeSessionV85_(token, options) {
  if (!cleanText_(token)) return false;
  return withAuthLockV85_(function () {
    var tokenHash;
    try { tokenHash = sessionHashV85_(token, options); }
    catch (ignore) { return false; }
    var sessions = readSessionsV85_(options);
    var kept = sessions.filter(function (session) { return !constantTimeEqualsV85_(session.tokenHash, tokenHash); });
    writeSessionsV85_(kept, options);
    return kept.length !== sessions.length;
  }, options);
}

function revokeAllSessionsV85_(options) {
  return withAuthLockV85_(function () {
    var properties = authPropertyStoreV85_(options);
    var count = readSessionsV85_(options).length;
    var values = {};
    values[V85_AUTH.PROPERTIES.SESSIONS_JSON] = '[]';
    values[V85_AUTH.PROPERTIES.SESSION_VERSION] = String((Number(properties.getProperty(V85_AUTH.PROPERTIES.SESSION_VERSION)) || 1) + 1);
    properties.setProperties(values, false);
    return count;
  }, options);
}

function createElevatedSessionV85_(sessionToken, tokenCandidate, scope, options) {
  scope = cleanText_(scope);
  if (!scope || Object.keys(V85_AUTH.ELEVATED_SCOPES).map(function (action) { return V85_AUTH.ELEVATED_SCOPES[action]; }).indexOf(scope) < 0) throwApiErrorV83_('VALIDATION_ERROR', '不支援的高權限範圍');
  return withAuthLockV85_(function () {
    var found = findSessionByTokenV85_(sessionToken, options);
    if (!found.session) throwApiErrorV83_('AUTH_SESSION_EXPIRED', '登入已逾時，請重新登入');
    var now = authNowMsV85_(options);
    var entry = {
      id: Utilities.getUuid(),
      tokenHash: sessionHashV85_(tokenCandidate, options),
      scope: scope,
      createdAt: now,
      expiresAt: now + V85_AUTH.ELEVATED_TTL_MS
    };
    found.session.elevated = (found.session.elevated || []).filter(function (item) { return Number(item.expiresAt) > now && item.scope !== scope; });
    found.session.elevated.push(entry);
    writeSessionsV85_(found.sessions, options);
    return { elevatedId: entry.id, scope: scope, expiresAt: new Date(entry.expiresAt).toISOString(), expiresInSeconds: Math.floor(V85_AUTH.ELEVATED_TTL_MS / 1000) };
  }, options);
}

function requireElevatedSessionV85_(sessionToken, elevatedToken, scope, options) {
  var session = requireSessionV85_(sessionToken, options);
  if (!cleanText_(elevatedToken)) throwApiErrorV83_('AUTH_ELEVATION_REQUIRED', '這項操作需要再次驗證密碼');
  var tokenHash = sessionHashV85_(elevatedToken, options);
  var now = authNowMsV85_(options);
  var match = (session.elevated || []).find(function (entry) {
    return entry.scope === scope && Number(entry.expiresAt) > now && constantTimeEqualsV85_(entry.tokenHash, tokenHash);
  });
  if (!match) throwApiErrorV83_('AUTH_ELEVATION_EXPIRED', '高權限驗證已逾時，請重新驗證');
  return { session: session, elevated: match };
}

function revokeElevatedSessionV85_(sessionToken, elevatedToken, options) {
  if (!cleanText_(sessionToken) || !cleanText_(elevatedToken)) return false;
  return withAuthLockV85_(function () {
    var found = findSessionByTokenV85_(sessionToken, options);
    if (!found.session) return false;
    var tokenHash = sessionHashV85_(elevatedToken, options);
    var before = (found.session.elevated || []).length;
    found.session.elevated = (found.session.elevated || []).filter(function (entry) { return !constantTimeEqualsV85_(entry.tokenHash, tokenHash); });
    writeSessionsV85_(found.sessions, options);
    return found.session.elevated.length !== before;
  }, options);
}
