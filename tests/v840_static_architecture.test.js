'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function allFiles(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? allFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}

test('formal v8.4 sources contain no API-key or member-login implementation', () => {
  const files = ['docs', 'gateway-gas', 'user-gas'].flatMap(allFiles).filter((file) => /\.(?:js|html|gs|json)$/.test(file));
  const source = files.map(read).join('\n');
  assert.doesNotMatch(source, /arv83_|assetRecordV83ApiKey|V83_API_KEY_HASH|registerMember\s*\(|loginMember\s*\(|\bapiKey\s*:/i);
  assert.doesNotMatch(read('docs/index.html'), /API 金鑰|id="apiKey"|api-client\.js/);
});

test('Gateway manifest executes as accessing user and has no central datastore scope', () => {
  const manifest = JSON.parse(read('gateway-gas/appsscript.json'));
  assert.equal(manifest.webapp.executeAs, 'USER_ACCESSING');
  assert.equal(manifest.webapp.access, 'ANYONE');
  assert.equal(manifest.oauthScopes.some((scope) => /firebase|cloud-platform|script\.projects/.test(scope)), false);
});

test('frontend loads GIS and stores connection under Google sub', () => {
  assert.match(read('docs/index.html'), /accounts\.google\.com\/gsi\/client/);
  assert.match(read('docs/src/connection/sheet-connection.js'), /asset-record\.connection\.' \+ sub/);
  assert.match(read('docs/src/auth/google-auth.js'), /disableAutoSelect\(\)/);
  assert.match(read('docs/src/api/gateway-client.js'), /credentials:\s*'include'/);
  assert.doesNotMatch(read('docs/src/auth/session-store.js'), /setItem\([^\n]*credential|setItem\([^\n]*idToken/i);
});

test('User GAS exposes stable handlers, idempotent setup, template guard and one daily handler', () => {
  const bootstrap = read('user-gas/Bootstrap.gs');
  const trigger = read('user-gas/TriggerService.gs');
  for (const name of ['getSystemVersion', 'firstTimeSetup', 'createManualBackup', 'validateSystem', 'getSystemHealth']) assert.match(bootstrap, new RegExp('function ' + name + '\\s*\\('));
  for (const name of ['dailyAssetMaintenance', 'installOrRepairDailyTrigger', 'removeDailyTrigger']) assert.match(trigger, new RegExp('function ' + name + '\\s*\\('));
  assert.match(bootstrap, /spreadsheet\.getName\(\) !== V840_TEMPLATE_NAME/);
  assert.match(bootstrap, /INITIAL_BACKUP_ID/);
  assert.match(trigger, /getHandlerFunction\(\) === 'dailyAssetMaintenance'/);
  assert.doesNotMatch(read('user-gas/appsscript.json'), /"webapp"/);
});

test('future version features are explicit stubs, not prematurely implemented', () => {
  const controller = read('gateway-gas/ApiController.gs');
  assert.match(controller, /匯入精靈將於 v8\.4\.1/);
  assert.match(controller, /備份與還原中心將於 v8\.4\.2/);
  assert.match(controller, /版本升級中心將於 v8\.5\.0/);
  assert.doesNotMatch(allFiles('gateway-gas').map(read).join('\n'), /projects\.updateContent|Firestore|Firebase/);
});
