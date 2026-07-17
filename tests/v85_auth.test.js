const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const gasDir = path.resolve(__dirname, '..', 'gas');
const gasFiles = fs.readdirSync(gasDir).filter((name) => name.endsWith('.gs')).sort();
const source = gasFiles.map((name) => fs.readFileSync(path.join(gasDir, name), 'utf8')).join('\n') + `
globalThis.__authTest = {
  V85_AUTH,
  memoryPropertiesV83_,
  saveCredentialVerifierV85_,
  changeCredentialVerifierV85_,
  authParametersForUsernameV85_,
  verifyCredentialV85_,
  authLoginApiV85_,
  authElevateApiV85_,
  authLockStateV85_,
  unlockAccountV85_,
  readSessionsV85_,
  createSessionV85_,
  requireSessionV85_,
  createElevatedSessionV85_,
  requireElevatedSessionV85_,
  revokeAllSessionsV85_,
  authenticateApiRequestV85_,
  handleApiRequestV83_
};`;

let uuidSequence = 0;
let lockDepth = 0;
const context = vm.createContext({
  console,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    computeDigest(_algorithm, text) {
      return Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest());
    },
    computeHmacSha256Signature(value, secret) {
      return Array.from(crypto.createHmac('sha256', String(secret)).update(String(value), 'utf8').digest());
    },
    base64EncodeWebSafe(bytes) {
      return Buffer.from(Array.from(bytes, (value) => value < 0 ? value + 256 : value)).toString('base64url');
    },
    getUuid() {
      uuidSequence += 1;
      return `00000000-0000-4000-8000-${String(uuidSequence).padStart(12, '0')}`;
    },
    formatDate(value) { return new Date(value).toISOString(); },
    newBlob(text) { return { getBytes: () => Array.from(Buffer.from(String(text), 'utf8')) }; }
  },
  LockService: {
    getScriptLock() {
      return {
        tryLock() { lockDepth += 1; return true; },
        releaseLock() { lockDepth -= 1; }
      };
    }
  }
});

new vm.Script(source, { filename: 'asset-record-v85-auth.gs' }).runInContext(context);
const t = context.__authTest;
const props = t.memoryPropertiesV83_();
let nowMs = Date.parse('2026-07-17T00:00:00.000Z');
const options = { properties: props, get nowMs() { return nowMs; } };
const b64 = (text) => Buffer.from(text).toString('base64url');
const fixed32 = (seed) => crypto.createHash('sha256').update(seed).digest('base64url');
const derivedA = fixed32('correct horse battery staple 中文 空白 2026');
const derivedB = fixed32('replacement long password 中文 空白 2027');
const saltA = crypto.randomBytes(24).toString('base64url');
const saltB = crypto.randomBytes(24).toString('base64url');
const pepper = crypto.randomBytes(32).toString('base64url');
const sessionSecret = crypto.randomBytes(32).toString('base64url');
const token = (label) => fixed32(`session:${label}`);

const credential = t.saveCredentialVerifierV85_({
  username: ' ShowBao ',
  salt: saltA,
  algorithm: t.V85_AUTH.ALGORITHM,
  iterations: 600000,
  derivedKey: derivedA,
  pepperCandidate: pepper,
  sessionSecretCandidate: sessionSecret
}, options);
assert.equal(t.V85_AUTH.MIN_PASSWORD_LENGTH, 8);
assert.equal(credential.username, 'showbao');
assert.equal(credential.passwordVersion, 1);
assert.equal(lockDepth, 0);

const stored = props.getProperties();
assert.equal(stored.AUTH_MODE, 'PASSWORD_SESSION');
assert.equal(stored.AUTH_USERNAME_NORMALIZED, 'showbao');
assert.equal(stored.AUTH_PASSWORD_ALGORITHM, 'PBKDF2-HMAC-SHA256');
assert.equal(stored.AUTH_PASSWORD_ITERATIONS, '600000');
assert.notEqual(stored.AUTH_PASSWORD_VERIFIER, derivedA);
assert.equal(JSON.stringify(stored).includes(derivedA), false);
assert.equal(JSON.stringify(stored).includes('correct horse'), false);
for (const forbidden of ['AUTH_PLAIN_PASSWORD', 'AUTH_LAST_INPUT_PASSWORD', 'AUTH_DERIVED_KEY']) {
  assert.equal(Object.hasOwn(stored, forbidden), false);
}

const knownBegin = t.authParametersForUsernameV85_('SHOWBAO', options);
const unknownBegin = t.authParametersForUsernameV85_('someone_else', options);
assert.deepEqual(Object.keys(knownBegin), Object.keys(unknownBegin));
assert.equal(knownBegin.algorithm, 'PBKDF2-HMAC-SHA256');
assert.equal(knownBegin.iterations, 600000);
assert.notEqual(unknownBegin.salt, knownBegin.salt);
assert.equal(Object.hasOwn(knownBegin, 'pepper'), false);
assert.equal(Object.hasOwn(knownBegin, 'verifier'), false);
assert.equal(t.verifyCredentialV85_('showbao', derivedA, options), true);
assert.equal(t.verifyCredentialV85_('unknown', derivedA, options), false);
assert.equal(t.verifyCredentialV85_('showbao', fixed32('wrong'), options), false);

const login = t.authLoginApiV85_({ username: 'SHOWBAO', derivedKey: derivedA, sessionTokenCandidate: token('primary'), rememberMe: false }, options);
assert.equal(login.rememberMe, false);
assert.equal(Date.parse(login.expiresAt) - nowMs, 12 * 60 * 60 * 1000);
assert.equal(t.requireSessionV85_(token('primary'), options).tokenHash === token('primary'), false);
assert.equal(JSON.stringify(props.getProperties()).includes(token('primary')), false);

for (let index = 0; index < 5; index++) {
  assert.throws(
    () => t.authLoginApiV85_({ username: 'showbao', derivedKey: fixed32(`wrong:${index}`), sessionTokenCandidate: token(`wrong:${index}`), rememberMe: false }, options),
    (error) => error.apiCode === 'AUTH_INVALID_CREDENTIALS'
  );
}
assert.equal(t.authLockStateV85_(options).locked, true);
assert.equal(t.authLockStateV85_(options).lockedUntil - nowMs, 15 * 60 * 1000);
assert.throws(
  () => t.authLoginApiV85_({ username: 'showbao', derivedKey: derivedA, sessionTokenCandidate: token('locked'), rememberMe: false }, options),
  (error) => error.apiCode === 'AUTH_LOCKED'
);
nowMs += 15 * 60 * 1000 + 1;
assert.doesNotThrow(() => t.authLoginApiV85_({ username: 'showbao', derivedKey: derivedA, sessionTokenCandidate: token('after-lock'), rememberMe: false }, options));
t.unlockAccountV85_(options);
assert.equal(t.authLockStateV85_(options).locked, false);

t.revokeAllSessionsV85_(options);
for (let index = 0; index < 6; index++) {
  nowMs += 1;
  t.createSessionV85_(token(`device:${index}`), index === 5, options);
}
assert.equal(t.readSessionsV85_(options).length, 5);
assert.throws(() => t.requireSessionV85_(token('device:0'), options), (error) => error.apiCode === 'AUTH_SESSION_EXPIRED');
assert.equal(t.requireSessionV85_(token('device:5'), options).rememberMe, true);
const remembered = t.readSessionsV85_(options).find((item) => item.rememberMe);
assert.equal(remembered.expiresAt - remembered.createdAt, 7 * 24 * 60 * 60 * 1000);

const currentToken = token('device:5');
const elevatedToken = token('elevated:restore');
const elevated = t.authElevateApiV85_({
  sessionToken: currentToken,
  payload: { username: 'showbao', derivedKey: derivedA, elevatedTokenCandidate: elevatedToken, scope: 'restore' }
}, options);
assert.equal(elevated.scope, 'restore');
assert.equal(Date.parse(elevated.expiresAt) - nowMs, 10 * 60 * 1000);
assert.doesNotThrow(() => t.requireElevatedSessionV85_(currentToken, elevatedToken, 'restore', options));
assert.throws(() => t.requireElevatedSessionV85_(currentToken, elevatedToken, 'account', options), (error) => error.apiCode === 'AUTH_ELEVATION_EXPIRED');
nowMs += 10 * 60 * 1000 + 1;
assert.throws(() => t.requireElevatedSessionV85_(currentToken, elevatedToken, 'restore', options), (error) => error.apiCode === 'AUTH_ELEVATION_EXPIRED');

const apiBegin = t.handleApiRequestV83_({ action: 'auth.begin', requestId: 'begin-1', payload: { username: 'unknown' }, params: {} }, options);
assert.equal(apiBegin.success, true);
const protectedResult = t.handleApiRequestV83_({ action: 'dashboard.getOverview', requestId: 'protected-1', payload: {}, params: {} }, options);
assert.equal(protectedResult.code, 'AUTH_REQUIRED');

const replacementSession = token('replacement-session');
t.authLoginApiV85_({ username: 'showbao', derivedKey: derivedA, sessionTokenCandidate: replacementSession, rememberMe: false }, options);
const passwordElevation = token('elevated:password');
t.createElevatedSessionV85_(replacementSession, passwordElevation, 'password', options);
const oldPasswordVersion = Number(props.getProperty('AUTH_PASSWORD_VERSION'));
t.changeCredentialVerifierV85_({
  username: 'showbao', salt: saltB, algorithm: t.V85_AUTH.ALGORITHM, iterations: 600000, derivedKey: derivedB
}, options);
assert.equal(Number(props.getProperty('AUTH_PASSWORD_VERSION')), oldPasswordVersion + 1);
assert.equal(t.readSessionsV85_(options).length, 0);
assert.equal(t.verifyCredentialV85_('showbao', derivedA, options), false);
assert.equal(t.verifyCredentialV85_('showbao', derivedB, options), true);
assert.throws(() => t.requireSessionV85_(replacementSession, options), (error) => error.apiCode === 'AUTH_SESSION_EXPIRED');

const logoutSession = token('logout-all-session');
t.authLoginApiV85_({ username: 'showbao', derivedKey: derivedB, sessionTokenCandidate: logoutSession, rememberMe: false }, options);
const oldSessionVersion = Number(props.getProperty('AUTH_SESSION_VERSION'));
assert.equal(t.revokeAllSessionsV85_(options), 1);
assert.equal(Number(props.getProperty('AUTH_SESSION_VERSION')), oldSessionVersion + 1);
assert.throws(() => t.requireSessionV85_(logoutSession, options), (error) => error.apiCode === 'AUTH_SESSION_EXPIRED');

const restoreSession = token('restore-session');
t.authLoginApiV85_({ username: 'showbao', derivedKey: derivedB, sessionTokenCandidate: restoreSession, rememberMe: false }, options);
const restoreWithoutElevation = t.handleApiRequestV83_({ action: 'restore.prepare', sessionToken: restoreSession, requestId: 'restore-1', payload: { backupId: 'BKP-1' }, params: {} }, options);
assert.equal(restoreWithoutElevation.code, 'AUTH_ELEVATION_REQUIRED');
const rebuildWithoutElevation = t.handleApiRequestV83_({ action: 'requestRebuild', sessionToken: restoreSession, requestId: 'rebuild-1', payload: {}, params: {} }, options);
assert.equal(rebuildWithoutElevation.code, 'AUTH_ELEVATION_REQUIRED');
const namespacedRebuildWithoutElevation = t.handleApiRequestV83_({ action: 'system.requestRebuild', sessionToken: restoreSession, requestId: 'rebuild-2', payload: {}, params: {} }, options);
assert.equal(namespacedRebuildWithoutElevation.code, 'AUTH_ELEVATION_REQUIRED');

const authSource = ['70_AuthConfig.gs', '71_AuthService.gs', '72_SessionService.gs', '73_AuthApi.gs']
  .map((name) => fs.readFileSync(path.join(gasDir, name), 'utf8')).join('\n');
assert.equal(/console\.(log|debug|info|warn|error)\s*\(/.test(authSource), false);
assert.equal(/AUTH_(PLAIN_PASSWORD|LAST_INPUT_PASSWORD|DERIVED_KEY)/.test(authSource), false);

console.log(JSON.stringify({ ok: true, assertions: 63, authMode: props.getProperty('AUTH_MODE') }, null, 2));
