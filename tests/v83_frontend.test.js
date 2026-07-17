const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'docs');
const files = [
  '.nojekyll', 'index.html', 'styles.css', 'config.js', 'api-client.js', 'ui-format.js', 'app.js',
  'src/auth/session-store.js', 'src/auth/password-kdf.js', 'src/auth/auth-api.js', 'src/auth/login-page.js', 'src/auth/auth-guard.js',
  'backup-restore/backup-restore-api.js', 'backup-restore/backup-wizard.js',
  'backup-restore/restore-wizard.js', 'backup-restore/backup-restore-page.js', 'backup-restore/backup-restore.css'
];
for (const file of files) assert.equal(fs.existsSync(path.join(root, file)), true, `missing ${file}`);

function storageMock() {
  const values = new Map();
  return {
    setItem(key, value) { values.set(String(key), String(value)); },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    removeItem(key) { values.delete(String(key)); },
    key(index) { return Array.from(values.keys())[index] || null; },
    get length() { return values.size; }
  };
}

global.sessionStorage = storageMock();
global.localStorage = storageMock();
global.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
global.atob = (value) => Buffer.from(value, 'base64').toString('binary');
global.ASSET_RECORD_CONFIG = { apiUrl: 'https://script.google.com/macros/s/example/exec' };
global.crypto = {
  randomUUID: () => '123e4567-e89b-12d3-a456-426614174000',
  getRandomValues(bytes) { bytes.fill(7); return bytes; }
};

sessionStorage.setItem('assetRecordOldCredential', 'must-be-removed');
require(path.join(root, 'src', 'auth', 'session-store.js'));
assert.equal(sessionStorage.getItem('assetRecordOldCredential'), null);
global.AssetRecordSessionStore.save('session-token-candidate', false);
assert.equal(global.AssetRecordSessionStore.get(), 'session-token-candidate');
assert.equal(localStorage.getItem(global.AssetRecordSessionStore.sessionKey), null);
global.AssetRecordSessionStore.save('remembered-token-candidate', true);
assert.equal(global.AssetRecordSessionStore.get(), 'remembered-token-candidate');
assert.equal(global.AssetRecordSessionStore.rememberMe(), true);

const calls = [];
global.fetch = async (url, options) => {
  calls.push({ url, options });
  return { text: async () => JSON.stringify({ success: true, code: 'OK', message: '', data: { items: [] }, version: '8.5.0', requestId: 'x' }) };
};

const client = require(path.join(root, 'api-client.js'));

(async () => {
  const result = await client.call('transactions.list', { params: { page: 1 } });
  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, global.ASSET_RECORD_CONFIG.apiUrl);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'text/plain;charset=UTF-8');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.sessionToken, 'remembered-token-candidate');
  assert.equal(body.action, 'transactions.list');
  assert.equal(Object.hasOwn(body, ['api', 'Key'].join('')), false);
  assert.match(body.requestId, /^[0-9a-f-]{36}$/i);

  const cachedA = await client.call('dashboard.getOverview', { cacheTtl: 45000, cacheKey: 'dashboard-overview' });
  const cachedB = await client.call('dashboard.getOverview', { cacheTtl: 45000, cacheKey: 'dashboard-overview' });
  assert.equal(cachedA, cachedB);
  assert.equal(calls.length, 2, '首頁摘要快取命中時不得重複呼叫');

  let release;
  global.fetch = () => new Promise((resolve) => { release = () => resolve({ text: async () => JSON.stringify({ success: true, code: 'OK', data: {} }) }); });
  const first = client.call('system.requestRebuild', { dedupeKey: 'maintenance' });
  await assert.rejects(client.call('system.requestRebuild', { dedupeKey: 'maintenance' }), (error) => error.code === 'REQUEST_IN_PROGRESS');
  release(); await first;

  global.fetch = async () => ({ text: async () => JSON.stringify({ success: false, code: 'AUTH_SESSION_EXPIRED', message: 'expired', data: {} }) });
  let authFailed = false; client.onAuthFailure(() => { authFailed = true; });
  await assert.rejects(client.call('transactions.list', { dedupeKey: 'expired' }), (error) => error.code === 'AUTH_SESSION_EXPIRED');
  assert.equal(authFailed, true);

  const sources = Object.fromEntries(files.filter((file) => /\.(?:html|js|css)$/.test(file)).map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
  const html = sources['index.html']; const app = sources['app.js']; const apiSource = sources['api-client.js']; const sessionSource = sources['src/auth/session-store.js']; const kdfSource = sources['src/auth/password-kdf.js'];
  const backupApiSource = sources['backup-restore/backup-restore-api.js']; const restoreWizardSource = sources['backup-restore/restore-wizard.js'];
  const combined = Object.values(sources).join('\n');
  assert.equal(/\.innerHTML\b/.test(combined), false);
  assert.equal(/document\.write|\beval\s*\(/.test(combined), false);
  assert.equal(/console\.(?:log|debug|info)\s*\(/.test(combined), false);
  assert.equal(new RegExp(['api', 'Key'].join('') + '\\s*:').test(combined), false);
  assert.ok(kdfSource.includes("name: 'PBKDF2'"));
  assert.ok(kdfSource.includes("hash: 'SHA-256'"));
  assert.ok(sessionSource.includes('sessionStorage') && sessionSource.includes('localStorage'));
  assert.equal(/derivedKey[^\n]{0,80}(?:localStorage|sessionStorage)/.test(combined), false);
  assert.equal(/password[^\n]{0,80}(?:localStorage|sessionStorage)/i.test(combined), false);
  assert.ok(apiSource.includes("'Content-Type': 'text/plain;charset=UTF-8'"));
  assert.equal((html.match(/data-view=/g) || []).length, 5);
  for (const label of ['總覽', '交易', '投資標的', '資金流水', '系統']) assert.ok(html.includes(`>${label}</button>`));
  assert.equal(html.includes(['API', ' 金鑰'].join('')), false);
  assert.ok(html.includes('type="password"'));
  assert.ok(html.includes('longTermTrendChart') && html.includes('sixMonthTrendChart'));
  assert.ok(html.includes('technicalInfo') && html.includes('<details'));
  assert.match(app, /params\.pageSize = 50/);
  assert.ok(app.includes("api.call('dashboard.getOverview'"));
  assert.equal(/Promise\.all\(\[\s*api\.call\('dashboard/.test(app), false);
  assert.ok(app.includes('transaction-drawer'));
  assert.ok(app.includes('refreshOverviewSummary'));
  assert.ok(app.includes('length < 8'));
  assert.ok(html.includes('新密碼至少 8 個 Unicode 字元'));
  assert.ok(sources['styles.css'].includes('@media (max-width: 650px)'));
  for (const action of ['transactions.list', 'transactions.create', 'transactions.update', 'transactions.delete', 'cashflows.list', 'cashflows.create', 'cashflows.update', 'dashboard.getOverview', 'system.getStatus', 'snapshots.rebuildAll', 'auth.changePassword']) assert.ok(combined.includes(action), `frontend missing ${action}`);
  assert.equal(app.includes("queueJob('system.requestRebuild'"), false);
  for (const action of ['restore.preview', 'restore.prepare', 'restore.apply', 'restore.finalize', 'restore.status', 'restore.rollback']) assert.ok(backupApiSource.includes(action), `restore frontend missing ${action}`);
  assert.equal(backupApiSource.includes('restore.elevate'), false);
  assert.ok(restoreWizardSource.includes('目前的原始密碼'));
  assert.ok(restoreWizardSource.includes("input.value.trim() !== '還原'"));
  assert.ok(restoreWizardSource.includes('回復還原前狀態'));

  console.log(JSON.stringify({ ok: true, assertions: 64, files }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
