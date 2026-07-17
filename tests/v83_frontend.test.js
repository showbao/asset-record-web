const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'docs');
const files = [
  '.nojekyll', 'index.html', 'styles.css', 'config.js', 'api-client.js', 'ui-format.js', 'app.js',
  'backup-restore/backup-restore-api.js', 'backup-restore/backup-wizard.js',
  'backup-restore/restore-wizard.js', 'backup-restore/backup-restore-page.js', 'backup-restore/backup-restore.css'
];
for (const file of files) assert.equal(fs.existsSync(path.join(root, file)), true, `missing ${file}`);

const values = new Map();
global.sessionStorage = {
  setItem(key, value) { values.set(key, String(value)); },
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  removeItem(key) { values.delete(key); }
};
global.ASSET_RECORD_CONFIG = { apiUrl: 'https://script.google.com/macros/s/example/exec' };
global.crypto = { randomUUID: () => '123e4567-e89b-12d3-a456-426614174000' };

const calls = [];
global.fetch = async (url, options) => {
  calls.push({ url, options });
  return { text: async () => JSON.stringify({ success: true, code: 'OK', message: '', data: { items: [] }, version: '8.3.1', requestId: 'x' }) };
};

const client = require(path.join(root, 'api-client.js'));
assert.throws(() => client.saveKey(''), (error) => error.code === 'AUTH_REQUIRED');
client.saveKey('secret-session-key');
assert.equal(client.getKey(), 'secret-session-key');
const generatedKey = `arv83_${'a'.repeat(96)}`;
client.saveKey(`${generatedKey}\n\n請立即複製到 GitHub Pages 登入畫面。`);
assert.equal(client.getKey(), generatedKey);
client.saveKey('secret-session-key');

(async () => {
  const result = await client.call('listAssets', { params: { page: 1 } });
  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, global.ASSET_RECORD_CONFIG.apiUrl);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.redirect, 'follow');
  assert.equal(calls[0].options.headers['Content-Type'], 'text/plain;charset=UTF-8');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.apiKey, 'secret-session-key');
  assert.equal(body.action, 'listAssets');
  assert.match(body.requestId, /^[0-9a-f-]{36}$/i);

  let release;
  global.fetch = () => new Promise((resolve) => { release = () => resolve({ text: async () => JSON.stringify({ success: true, code: 'OK', data: {} }) }); });
  const first = client.call('requestRebuild', { dedupeKey: 'maintenance' });
  await assert.rejects(client.call('requestRebuild', { dedupeKey: 'maintenance' }), (error) => error.code === 'REQUEST_IN_PROGRESS');
  release();
  await first;

  global.fetch = async () => ({ text: async () => JSON.stringify({ success: false, code: 'OVERSELL', message: '歷史時點超賣', data: {} }) });
  await assert.rejects(client.call('createTransaction'), (error) => error.code === 'OVERSELL' && error.message.includes('超賣'));

  client.clearKey();
  assert.equal(client.getKey(), '');

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const apiSource = fs.readFileSync(path.join(root, 'api-client.js'), 'utf8');
  const formatSource = fs.readFileSync(path.join(root, 'ui-format.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const backupApiSource = fs.readFileSync(path.join(root, 'backup-restore', 'backup-restore-api.js'), 'utf8');
  const restoreWizardSource = fs.readFileSync(path.join(root, 'backup-restore', 'restore-wizard.js'), 'utf8');
  const backupPageSource = fs.readFileSync(path.join(root, 'backup-restore', 'backup-restore-page.js'), 'utf8');
  const combined = html + app + apiSource + formatSource + backupApiSource + restoreWizardSource + backupPageSource;
  assert.equal(/\.innerHTML\b/.test(combined), false);
  assert.equal(/localStorage/.test(combined), false);
  assert.equal(/document\.write|\beval\s*\(/.test(combined), false);
  assert.ok(app.includes('textContent'));
  assert.ok(app.includes('window.confirm'));
  assert.ok(app.includes('syncTransactionFields'));
  assert.ok(apiSource.includes('sessionStorage'));
  assert.ok(formatSource.includes('Number.isFinite'));
  assert.ok(app.includes('XIRR（年化）'));
  assert.ok(css.includes('#performanceTable th, #performanceTable td'));
  assert.ok(apiSource.includes("'Content-Type': 'text/plain;charset=UTF-8'"));
  assert.ok(css.includes('@media (max-width: 650px)'));
  assert.ok(css.includes('[hidden] { display: none !important; }'));
  assert.ok(html.includes('trendChart'));
  assert.ok(html.includes('recalcWarning'));
  assert.ok(html.includes('restoreWizardDialog'));
  assert.ok(html.includes('restoreRecovery'));
  assert.ok(html.includes('legacyBackupDialog'));
  assert.ok(backupPageSource.includes('registerLegacy'));
  for (const action of ['createAsset', 'updateAsset', 'disableAsset', 'createTransaction', 'updateTransaction', 'deleteTransaction', 'restoreTransaction', 'createExternalCashFlow', 'updateExternalCashFlow', 'deleteExternalCashFlow', 'restoreExternalCashFlow', 'requestRebuild', 'requestMarketRefresh']) {
    assert.ok(app.includes(action), `frontend missing ${action}`);
  }
  for (const action of ['restore.preview', 'restore.elevate', 'restore.prepare', 'restore.apply', 'restore.finalize', 'restore.status', 'restore.rollback']) {
    assert.ok(backupApiSource.includes(action), `restore frontend missing ${action}`);
  }
  assert.ok(restoreWizardSource.includes("input.value.trim() !== '還原'"));
  assert.ok(restoreWizardSource.includes('回復還原前狀態'));
  assert.ok(restoreWizardSource.includes("operation.currentStage === 'PREPARING'"));
  assert.ok(restoreWizardSource.includes('snapshotRebuildRecommended'));
  assert.equal(/arv83_[0-9a-fA-F]{32,}/.test(combined), false);

  console.log(JSON.stringify({ ok: true, assertions: 53, files }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
