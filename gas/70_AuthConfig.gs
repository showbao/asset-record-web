var V85_AUTH = Object.freeze({
  VERSION: '8.5.0',
  ALGORITHM: 'PBKDF2-HMAC-SHA256',
  DEFAULT_ITERATIONS: 600000,
  MIN_ITERATIONS: 200000,
  MAX_ITERATIONS: 1000000,
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  SESSION_TTL_MS: 12 * 60 * 60 * 1000,
  REMEMBER_SESSION_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  ELEVATED_TTL_MS: 10 * 60 * 1000,
  MAX_SESSIONS: 5,
  FAILED_LIMIT: 5,
  LOCK_DURATIONS_MS: Object.freeze([15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000]),
  MODE_DUAL: 'DUAL',
  MODE_PASSWORD_SESSION: 'PASSWORD_SESSION',
  PROPERTIES: Object.freeze({
    MODE: 'AUTH_MODE',
    USERNAME: 'AUTH_USERNAME_NORMALIZED',
    PASSWORD_VERIFIER: 'AUTH_PASSWORD_VERIFIER',
    PASSWORD_SALT: 'AUTH_PASSWORD_SALT',
    PASSWORD_ALGORITHM: 'AUTH_PASSWORD_ALGORITHM',
    PASSWORD_ITERATIONS: 'AUTH_PASSWORD_ITERATIONS',
    PASSWORD_VERSION: 'AUTH_PASSWORD_VERSION',
    PEPPER: 'AUTH_PEPPER',
    UPDATED_AT: 'AUTH_UPDATED_AT',
    FAILED_COUNT: 'AUTH_FAILED_COUNT',
    LOCKED_UNTIL: 'AUTH_LOCKED_UNTIL',
    LOCK_LEVEL: 'AUTH_LOCK_LEVEL',
    LAST_SUCCESS_AT: 'AUTH_LAST_SUCCESS_AT',
    LAST_FAILED_AT: 'AUTH_LAST_FAILED_AT',
    SESSION_SECRET: 'AUTH_SESSION_SECRET',
    SESSION_VERSION: 'AUTH_SESSION_VERSION',
    SESSIONS_JSON: 'AUTH_SESSIONS_JSON'
  }),
  PUBLIC_ACTIONS: Object.freeze(['auth.status', 'auth.begin', 'auth.login']),
  AUTH_ACTIONS: Object.freeze(['auth.logout', 'auth.getSession', 'auth.elevate', 'auth.logoutAll', 'auth.changePassword']),
  ELEVATED_SCOPES: Object.freeze({
    'auth.logoutAll': 'account',
    'auth.changePassword': 'password',
    'restore.prepare': 'restore',
    'restore.apply': 'restore',
    'restore.finalize': 'restore',
    'restore.rollback': 'restore',
    'snapshots.rebuildAll': 'snapshots',
    'system.requestRebuild': 'snapshots',
    'requestRebuild': 'snapshots',
    'system.reset': 'system'
  })
});

function authPropertyStoreV85_(options) {
  return options && options.properties ? options.properties : PropertiesService.getScriptProperties();
}

function authNowMsV85_(options) {
  return options && options.nowMs != null ? Number(options.nowMs) : Date.now();
}

function authNowIsoV85_(options) {
  return new Date(authNowMsV85_(options)).toISOString();
}

function normalizeUsernameV85_(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function validateUsernameV85_(value) {
  var normalized = normalizeUsernameV85_(value);
  if (!/^[a-z0-9_-]{3,40}$/.test(normalized)) throwApiErrorV83_('VALIDATION_ERROR', '登入帳號格式不正確');
  return normalized;
}

function validateBase64UrlV85_(value, label, minimumLength) {
  var text = String(value == null ? '' : value).trim();
  if (text.length < (minimumLength || 40) || !/^[A-Za-z0-9_-]+$/.test(text)) throwApiErrorV83_('VALIDATION_ERROR', (label || '安全值') + '格式不正確');
  return text;
}

function base64UrlV85_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function hmacBase64UrlV85_(value, secret) {
  return base64UrlV85_(Utilities.computeHmacSha256Signature(String(value || ''), String(secret || ''), Utilities.Charset.UTF_8));
}

function randomServerSecretV85_() {
  return base64UrlV85_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid(), new Date().getTime()].join('|'), Utilities.Charset.UTF_8));
}

function authModeV85_(options) {
  var mode = cleanText_(authPropertyStoreV85_(options).getProperty(V85_AUTH.PROPERTIES.MODE));
  return mode === V85_AUTH.MODE_DUAL ? mode : V85_AUTH.MODE_PASSWORD_SESSION;
}

function isAuthConfiguredV85_(options) {
  var properties = authPropertyStoreV85_(options);
  return Boolean(cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.USERNAME)) &&
    cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.PASSWORD_VERIFIER)) &&
    cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.PASSWORD_SALT)) &&
    cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.PEPPER)) &&
    cleanText_(properties.getProperty(V85_AUTH.PROPERTIES.SESSION_SECRET)));
}

function isPublicAuthActionV85_(action) {
  return V85_AUTH.PUBLIC_ACTIONS.indexOf(cleanText_(action)) >= 0;
}

function isAuthActionV85_(action) {
  return V85_AUTH.AUTH_ACTIONS.indexOf(cleanText_(action)) >= 0 || isPublicAuthActionV85_(action);
}

function elevatedScopeForActionV85_(action) {
  return V85_AUTH.ELEVATED_SCOPES[cleanText_(action)] || '';
}

function withAuthLockV85_(callback, options) {
  if (options && options.skipLock) return callback();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(V81.LOCK_TIMEOUT_MS)) throwApiErrorV83_('SYSTEM_BUSY', '登入服務忙碌中，請稍後再試');
  try { return callback(); }
  finally { lock.releaseLock(); }
}
