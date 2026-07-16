'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
function source(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function gasContext() {
  const context = {
    console,
    Date,
    BigInt,
    Number,
    Math,
    JSON,
    Object,
    Array,
    String,
    Boolean,
    RegExp,
    Error,
    isFinite,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      base64DecodeWebSafe(value) { return Array.from(Buffer.from(value, 'base64url')); },
      newBlob(value) { return { getDataAsString() { return Buffer.from(value).toString('utf8'); } }; },
      computeDigest(_algorithm, value) { return Array.from(crypto.createHash('sha256').update(value, 'utf8').digest()); },
      formatDate(date, _zone, format) { return format === 'yyyy-MM-dd' ? date.toISOString().slice(0, 10) : date.toISOString().replace('Z', '+00:00'); }
    }
  };
  vm.createContext(context);
  ['gateway-gas/CoreConfig.gs', 'gateway-gas/ResponseService.gs', 'gateway-gas/AuthContext.gs', 'gateway-gas/SpreadsheetGuard.gs'].forEach((file) => vm.runInContext(source(file), context, { filename: file }));
  return context;
}
function tokenFixture(overrides = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  Object.assign(jwk, { kid: 'test-key', alg: 'RS256', use: 'sig' });
  const now = 1784160000;
  const header = { alg: 'RS256', kid: 'test-key', typ: 'JWT' };
  const payload = Object.assign({ iss: 'https://accounts.google.com', aud: 'client.apps.googleusercontent.com', sub: 'sub-A', email: 'a@example.com', email_verified: true, name: 'Account A', iat: now - 10, exp: now + 3600 }, overrides);
  const input = Buffer.from(JSON.stringify(header)).toString('base64url') + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  return { token: input + '.' + signature, jwks: { keys: [jwk] }, now, payload };
}

test('Google ID Token verifies signature and required claims without token persistence', () => {
  const context = gasContext();
  const fixture = tokenFixture();
  const auth = context.verifyGoogleIdTokenV840_(fixture.token, { jwks: fixture.jwks, clientId: fixture.payload.aud, activeEmail: fixture.payload.email, nowSeconds: fixture.now });
  assert.equal(auth.sub, 'sub-A');
  assert.equal(auth.email, 'a@example.com');
  assert.equal(Object.values(auth).includes(fixture.token), false);
});

test('Google ID Token rejects audience, expiry, active-account mismatch and invalid signature', () => {
  const context = gasContext();
  let fixture = tokenFixture();
  assert.throws(() => context.verifyGoogleIdTokenV840_(fixture.token, { jwks: fixture.jwks, clientId: 'wrong-client', activeEmail: fixture.payload.email, nowSeconds: fixture.now }), /audience/);
  assert.throws(() => context.verifyGoogleIdTokenV840_(fixture.token, { jwks: fixture.jwks, clientId: fixture.payload.aud, activeEmail: 'b@example.com', nowSeconds: fixture.now }), /帳號/);
  fixture = tokenFixture({ exp: 1784150000 });
  assert.throws(() => context.verifyGoogleIdTokenV840_(fixture.token, { jwks: fixture.jwks, clientId: fixture.payload.aud, activeEmail: fixture.payload.email, nowSeconds: fixture.now }), /過期/);
  fixture = tokenFixture();
  const tokenParts = fixture.token.split('.');
  tokenParts[2] = (tokenParts[2][0] === 'A' ? 'B' : 'A') + tokenParts[2].slice(1);
  const tampered = tokenParts.join('.');
  assert.throws(() => context.verifyGoogleIdTokenV840_(tampered, { jwks: fixture.jwks, clientId: fixture.payload.aud, activeEmail: fixture.payload.email, nowSeconds: fixture.now }), /簽章/);
});

test('performance number normalization rejects Date, object, NaN and infinities', () => {
  const context = gasContext();
  [new Date(), {}, [], NaN, Infinity, -Infinity, '', null, undefined, '2026-07-16'].forEach((value) => assert.equal(context.numberOrNullV840_(value), null));
  assert.equal(context.numberOrNullV840_(-0.125), -0.125);
  assert.equal(context.numberOrNullV840_('0.0525'), 0.0525);
});

test('spreadsheet guard requires editable Google Sheet and production asset-record markers', () => {
  const context = gasContext();
  const spreadsheet = { getName: () => 'A 的資產記錄' };
  const base = { metadata: { name: 'A 的資產記錄', mimeType: 'application/vnd.google-apps.spreadsheet', trashed: false, capabilities: { canEdit: true } }, spreadsheet,
    settings: { APP_ID: 'ASSET_RECORD', SYSTEM_VERSION: '8.4.0', SCHEMA_VERSION: '8.4.0', FILE_ROLE: 'PRODUCTION', IS_BACKUP: 'FALSE', SETUP_STATUS: 'READY', SPREADSHEET_ID: '12345678901234567890' } };
  const result = context.guardSpreadsheetV840_('12345678901234567890', { sub: 'sub-A' }, base);
  assert.equal(result.spreadsheet, spreadsheet);
  assert.throws(() => context.guardSpreadsheetV840_('12345678901234567890', {}, Object.assign({}, base, { metadata: Object.assign({}, base.metadata, { capabilities: { canEdit: false } }) })), /編輯權限/);
  assert.throws(() => context.guardSpreadsheetV840_('12345678901234567890', {}, Object.assign({}, base, { settings: Object.assign({}, base.settings, { APP_ID: 'OTHER' }) })), /不是資產記錄/);
  assert.throws(() => context.guardSpreadsheetV840_('12345678901234567890', {}, Object.assign({}, base, { settings: Object.assign({}, base.settings, { FILE_ROLE: 'BACKUP', IS_BACKUP: 'TRUE' }) })), /備份檔/);
});

test('browser session keeps ID token only in memory and isolates connections by Google sub', () => {
  const writes = new Map();
  const localStorage = { setItem: (key, value) => writes.set(key, value), getItem: (key) => writes.get(key) || null, removeItem: (key) => writes.delete(key) };
  const window = { localStorage, atob: (value) => Buffer.from(value, 'base64').toString('binary') };
  const context = vm.createContext({ window, console, Date, JSON, Object, String, Error, decodeURIComponent });
  vm.runInContext(source('docs/src/auth/session-store.js'), context);
  vm.runInContext(source('docs/src/connection/sheet-connection.js'), context);
  const payload = Buffer.from(JSON.stringify({ sub: 'sub-A', email: 'a@example.com', name: 'A' })).toString('base64url');
  const token = 'header.' + payload + '.signature';
  window.AssetRecordSession.accept(token);
  assert.equal(window.AssetRecordSession.getIdToken(), token);
  assert.equal(Array.from(writes.values()).some((value) => value.includes(token)), false);
  window.AssetRecordConnection.save('sub-A', { spreadsheetId: 'sheet-A', spreadsheetName: 'A' });
  window.AssetRecordConnection.save('sub-B', { spreadsheetId: 'sheet-B', spreadsheetName: 'B' });
  assert.equal(window.AssetRecordConnection.load('sub-A').spreadsheetId, 'sheet-A');
  assert.equal(window.AssetRecordConnection.load('sub-B').spreadsheetId, 'sheet-B');
});
