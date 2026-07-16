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
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutput(html) {
        return { html, xFrameOptionsMode: null, setXFrameOptionsMode(mode) { this.xFrameOptionsMode = mode; return this; } };
      }
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

test('Gateway bridge accepts only allowlisted callback origins, URLs and opaque ids', () => {
  const context = gasContext();
  assert.equal(context.isAllowedCallbackOriginV840_('http://localhost:8765'), true);
  assert.equal(context.isAllowedCallbackOriginV840_('https://attacker.example'), false);
  assert.equal(context.isAllowedCallbackUrlV840_('http://localhost:8765/bridge-relay.html'), true);
  assert.equal(context.isAllowedCallbackUrlV840_('http://localhost:8765/other.html'), false);
  assert.equal(context.isValidBridgeIdV840_('bridge-test-123'), true);
  assert.equal(context.isValidBridgeIdV840_('bad id with spaces'), false);
  assert.equal(context.safeJsLiteralV840_('</script>'), '"\\u003c/script>"');
});

test('Gateway bridge transfers a private MessagePort only to an allowlisted callback origin', () => {
  const context = gasContext();
  const output = context.bridgeClientOutputV840_('http://localhost:8765', 'http://localhost:8765/bridge-relay.html', 'session-test-123');
  assert.equal(output.xFrameOptionsMode, 'ALLOWALL');
  assert.match(output.html, /gatewayBridgeCallV840/);
  assert.match(output.html, /new MessageChannel\(\)/);
  assert.match(output.html, /window\.top\.postMessage/);
  assert.match(output.html, /type:"gateway-port"/);
  assert.doesNotMatch(output.html, /assetRecordRelay|BroadcastChannel/);
  assert.match(output.html, /session-test-123/);
  const scripts = Array.from(output.html.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0]));
  assert.throws(() => context.bridgeClientOutputV840_('https://attacker.example', 'https://attacker.example/bridge-relay.html', 'session-test-123'), /不允許/);
  assert.throws(() => context.bridgeClientOutputV840_('http://localhost:8765', 'http://localhost:8765/bridge-relay.html', 'bad id'), /bridgeSessionId/);
  assert.throws(() => context.bridgeClientOutputV840_('http://localhost:8765', 'http://localhost:8765/other.html', 'session-test-123'), /relay/);
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

test('Drive metadata guard uses DriveApp readonly access and recognizes owner editability', () => {
  const context = gasContext();
  const permissions = { OWNER: 'OWNER', EDIT: 'EDIT', ORGANIZER: 'ORGANIZER', FILE_ORGANIZER: 'FILE_ORGANIZER', VIEW: 'VIEW' };
  context.Session = { getActiveUser: () => ({ getEmail: () => 'owner@example.com' }) };
  context.DriveApp = {
    Permission: permissions,
    getFileById(id) {
      assert.equal(id, '12345678901234567890');
      return {
        getId: () => id,
        getName: () => 'Private portfolio',
        getMimeType: () => 'application/vnd.google-apps.spreadsheet',
        isTrashed: () => false,
        getAccess(email) { assert.equal(email, 'owner@example.com'); return permissions.OWNER; }
      };
    }
  };
  const metadata = context.driveFileMetadataV840_('12345678901234567890');
  assert.equal(metadata.capabilities.canEdit, true);
  assert.equal(metadata.name, 'Private portfolio');
  assert.equal(metadata.mimeType, 'application/vnd.google-apps.spreadsheet');
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
