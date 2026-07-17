function credentialVerifierV85_(derivedKey, pepper) {
  return hmacBase64UrlV85_(validateBase64UrlV85_(derivedKey, '密碼衍生值', 40), validateBase64UrlV85_(pepper, '伺服器安全值', 40));
}

function constantTimeEqualsV85_(left, right) {
  left = String(left || '');
  right = String(right || '');
  var length = Math.max(left.length, right.length);
  var difference = left.length ^ right.length;
  for (var index = 0; index < length; index++) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

function authParametersForUsernameV85_(username, options) {
  var properties = authPropertyStoreV85_(options);
  var normalized = normalizeUsernameV85_(username);
  var configuredUsername = normalizeUsernameV85_(properties.getProperty(V85_AUTH.PROPERTIES.USERNAME));
  var configured = isAuthConfiguredV85_(options);
  var usernameMatches = configured && constantTimeEqualsV85_(normalized, configuredUsername);
  var salt = cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.PASSWORD_SALT));
  var sessionSecret = cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.SESSION_SECRET)) || randomServerSecretV85_();
  if (!usernameMatches) salt = hmacBase64UrlV85_('auth-begin|' + normalized, sessionSecret).slice(0, 32);
  return {
    algorithm: V85_AUTH.ALGORITHM,
    salt: salt || hmacBase64UrlV85_('auth-begin|unconfigured|' + normalized, sessionSecret).slice(0, 32),
    iterations: Number(properties.getProperty(V85_AUTH.PROPERTIES.PASSWORD_ITERATIONS)) || V85_AUTH.DEFAULT_ITERATIONS,
    passwordVersion: Number(properties.getProperty(V85_AUTH.PROPERTIES.PASSWORD_VERSION)) || 1
  };
}

function verifyCredentialV85_(username, derivedKey, options) {
  var properties = authPropertyStoreV85_(options);
  if (!isAuthConfiguredV85_(options)) return false;
  var usernameMatches = constantTimeEqualsV85_(normalizeUsernameV85_(username), normalizeUsernameV85_(properties.getProperty(V85_AUTH.PROPERTIES.USERNAME)));
  var pepper = cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.PEPPER));
  var expected = cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.PASSWORD_VERIFIER));
  var actual = '';
  try { actual = credentialVerifierV85_(derivedKey, pepper); }
  catch (ignore) { actual = hmacBase64UrlV85_('invalid-derived-key', pepper || randomServerSecretV85_()); }
  return usernameMatches && constantTimeEqualsV85_(actual, expected);
}

function authLockStateV85_(options) {
  var properties = authPropertyStoreV85_(options);
  var now = authNowMsV85_(options);
  var lockedUntil = Number(properties.getProperty(V85_AUTH.PROPERTIES.LOCKED_UNTIL)) || 0;
  return {
    failedCount: Number(properties.getProperty(V85_AUTH.PROPERTIES.FAILED_COUNT)) || 0,
    level: Number(properties.getProperty(V85_AUTH.PROPERTIES.LOCK_LEVEL)) || 0,
    lockedUntil: lockedUntil,
    locked: lockedUntil > now
  };
}

function registerFailedLoginV85_(options) {
  var properties = authPropertyStoreV85_(options);
  var state = authLockStateV85_(options);
  var now = authNowMsV85_(options);
  var count = state.failedCount + 1;
  var values = {};
  values[V85_AUTH.PROPERTIES.LAST_FAILED_AT] = new Date(now).toISOString();
  if (count >= V85_AUTH.FAILED_LIMIT) {
    var level = Math.min(state.level + 1, V85_AUTH.LOCK_DURATIONS_MS.length);
    values[V85_AUTH.PROPERTIES.FAILED_COUNT] = '0';
    values[V85_AUTH.PROPERTIES.LOCK_LEVEL] = String(level);
    values[V85_AUTH.PROPERTIES.LOCKED_UNTIL] = String(now + V85_AUTH.LOCK_DURATIONS_MS[level - 1]);
  } else {
    values[V85_AUTH.PROPERTIES.FAILED_COUNT] = String(count);
  }
  properties.setProperties(values, false);
  return authLockStateV85_(options);
}

function clearFailedLoginV85_(options) {
  var properties = authPropertyStoreV85_(options);
  var values = {};
  values[V85_AUTH.PROPERTIES.FAILED_COUNT] = '0';
  values[V85_AUTH.PROPERTIES.LOCKED_UNTIL] = '0';
  values[V85_AUTH.PROPERTIES.LOCK_LEVEL] = '0';
  values[V85_AUTH.PROPERTIES.LAST_SUCCESS_AT] = authNowIsoV85_(options);
  properties.setProperties(values, false);
}

function unlockAccountV85_(options) {
  var properties = authPropertyStoreV85_(options);
  var values = {};
  values[V85_AUTH.PROPERTIES.FAILED_COUNT] = '0';
  values[V85_AUTH.PROPERTIES.LOCKED_UNTIL] = '0';
  values[V85_AUTH.PROPERTIES.LOCK_LEVEL] = '0';
  properties.setProperties(values, false);
  return authLockStateV85_(options);
}

function validateCredentialEnvelopeV85_(payload, allowPepper) {
  payload = payload || {};
  ensureAllowedKeysV83_(payload, allowPepper ? ['username', 'salt', 'algorithm', 'iterations', 'derivedKey', 'pepperCandidate', 'sessionSecretCandidate'] : ['username', 'salt', 'algorithm', 'iterations', 'derivedKey'], 'payload');
  var iterations = Number(payload.iterations);
  if (cleanText_(payload.algorithm) !== V85_AUTH.ALGORITHM) throwApiErrorV83_('VALIDATION_ERROR', '不支援的密碼演算法');
  if (!Number.isInteger(iterations) || iterations < V85_AUTH.MIN_ITERATIONS || iterations > V85_AUTH.MAX_ITERATIONS) throwApiErrorV83_('VALIDATION_ERROR', 'PBKDF2 迭代次數不正確');
  return {
    username: validateUsernameV85_(payload.username),
    salt: validateBase64UrlV85_(payload.salt, 'Salt', 20),
    algorithm: V85_AUTH.ALGORITHM,
    iterations: iterations,
    derivedKey: validateBase64UrlV85_(payload.derivedKey, '密碼衍生值', 40),
    pepperCandidate: allowPepper ? validateBase64UrlV85_(payload.pepperCandidate, 'Pepper', 40) : '',
    sessionSecretCandidate: allowPepper ? validateBase64UrlV85_(payload.sessionSecretCandidate, 'Session Secret', 40) : ''
  };
}

function saveCredentialVerifierV85_(payload, options) {
  var envelope = validateCredentialEnvelopeV85_(payload, true);
  return withAuthLockV85_(function () {
    var properties = authPropertyStoreV85_(options);
    var pepper = cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.PEPPER)) || envelope.pepperCandidate;
    var sessionSecret = cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.SESSION_SECRET)) || envelope.sessionSecretCandidate;
    var version = (Number(properties.getProperty(V85_AUTH.PROPERTIES.PASSWORD_VERSION)) || 0) + 1;
    var values = {};
    values[V85_AUTH.PROPERTIES.MODE] = cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.MODE)) || V85_AUTH.MODE_DUAL;
    values[V85_AUTH.PROPERTIES.USERNAME] = envelope.username;
    values[V85_AUTH.PROPERTIES.PASSWORD_VERIFIER] = credentialVerifierV85_(envelope.derivedKey, pepper);
    values[V85_AUTH.PROPERTIES.PASSWORD_SALT] = envelope.salt;
    values[V85_AUTH.PROPERTIES.PASSWORD_ALGORITHM] = envelope.algorithm;
    values[V85_AUTH.PROPERTIES.PASSWORD_ITERATIONS] = String(envelope.iterations);
    values[V85_AUTH.PROPERTIES.PASSWORD_VERSION] = String(version);
    values[V85_AUTH.PROPERTIES.PEPPER] = pepper;
    values[V85_AUTH.PROPERTIES.SESSION_SECRET] = sessionSecret;
    values[V85_AUTH.PROPERTIES.SESSION_VERSION] = String(Number(properties.getProperty(V85_AUTH.PROPERTIES.SESSION_VERSION)) || 1);
    values[V85_AUTH.PROPERTIES.UPDATED_AT] = authNowIsoV85_(options);
    values[V85_AUTH.PROPERTIES.FAILED_COUNT] = '0';
    values[V85_AUTH.PROPERTIES.LOCKED_UNTIL] = '0';
    values[V85_AUTH.PROPERTIES.LOCK_LEVEL] = '0';
    values[V85_AUTH.PROPERTIES.SESSIONS_JSON] = '[]';
    properties.setProperties(values, false);
    return { username: envelope.username, passwordVersion: version, algorithm: envelope.algorithm, iterations: envelope.iterations, sessionsRevoked: true };
  }, options);
}

function changeCredentialVerifierV85_(payload, options) {
  var envelope = validateCredentialEnvelopeV85_(payload, false);
  return withAuthLockV85_(function () {
    var properties = authPropertyStoreV85_(options);
    var pepper = cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.PEPPER));
    if (!pepper) throwApiErrorV83_('AUTH_NOT_CONFIGURED', '尚未設定登入帳密');
    var version = (Number(properties.getProperty(V85_AUTH.PROPERTIES.PASSWORD_VERSION)) || 0) + 1;
    var values = {};
    values[V85_AUTH.PROPERTIES.USERNAME] = envelope.username;
    values[V85_AUTH.PROPERTIES.PASSWORD_VERIFIER] = credentialVerifierV85_(envelope.derivedKey, pepper);
    values[V85_AUTH.PROPERTIES.PASSWORD_SALT] = envelope.salt;
    values[V85_AUTH.PROPERTIES.PASSWORD_ALGORITHM] = envelope.algorithm;
    values[V85_AUTH.PROPERTIES.PASSWORD_ITERATIONS] = String(envelope.iterations);
    values[V85_AUTH.PROPERTIES.PASSWORD_VERSION] = String(version);
    values[V85_AUTH.PROPERTIES.UPDATED_AT] = authNowIsoV85_(options);
    values[V85_AUTH.PROPERTIES.SESSIONS_JSON] = '[]';
    properties.setProperties(values, false);
    return { username: envelope.username, passwordVersion: version, sessionsRevoked: true };
  }, options);
}
