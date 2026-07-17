const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const gasDir = path.resolve(__dirname, '..', 'gas');
const gasFiles = fs.readdirSync(gasDir).filter((name) => name.endsWith('.gs')).sort();
const source = gasFiles.map((name) => fs.readFileSync(path.join(gasDir, name), 'utf8')).join('\n') + `
globalThis.__test = {
  V81,
  V85_AUTH,
  createSessionV85_,
  parsePaginationV83_,
  paginateV83_,
  ensureAllowedKeysV83_,
  cleanNullableNumberV831_,
  performanceToApiV83_,
  assetToApiV83_,
  transactionToApiV83_,
  cashFlowToApiV83_,
  memoryPropertiesV83_,
  requestJobApiV83_,
  getJobStatusApiV83_,
  handleApiRequestV83_,
  doGet,
  doPost
};`;

let uuidSequence = 0;
const outputs = [];
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
    newBlob(text) {
      return { getBytes: () => Array.from(Buffer.from(String(text), 'utf8')) };
    },
    formatDate(value, _timezone, format) {
      const iso = new Date(value).toISOString();
      if (format === 'yyyy-MM-dd') return iso.slice(0, 10);
      if (format.includes("'T'")) return iso.slice(0, 19) + '+08:00';
      return iso.slice(0, 19).replace('T', ' ');
    }
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput(text) {
      const output = {
        text,
        mimeType: '',
        setMimeType(value) { this.mimeType = value; return this; }
      };
      outputs.push(output);
      return output;
    }
  },
  LockService: {
    getScriptLock() { return { tryLock() { return true; }, releaseLock() {} }; }
  }
});

new vm.Script(source, { filename: 'asset-record-v83.gs' }).runInContext(context);
const t = context.__test;

assert.equal(t.V81.VERSION, '8.5.0');
assert.equal(t.V81.SCHEMA_VERSION, '8.5.0');
assert.equal(gasFiles.length, 19);
assert.ok(gasFiles.includes('70_Api.gs'));
assert.ok(!gasFiles.includes('61_TrendValidation.gs'));

assert.deepEqual(JSON.parse(JSON.stringify(t.parsePaginationV83_({}))), { page: 1, pageSize: 25 });
assert.deepEqual(JSON.parse(JSON.stringify(t.parsePaginationV83_({ page: 2, pageSize: 100 }))), { page: 2, pageSize: 100 });
assert.throws(() => t.parsePaginationV83_({ page: 0 }), (error) => error.apiCode === 'VALIDATION_ERROR');
assert.throws(() => t.parsePaginationV83_({ pageSize: 101 }), (error) => error.apiCode === 'VALIDATION_ERROR');
assert.throws(() => t.ensureAllowedKeysV83_({ secret: true }, ['page'], 'params'), (error) => error.apiCode === 'INVALID_REQUEST');

const mappedAsset = t.assetToApiV83_({
  標的代號: '0050', 標的名稱: '元大台灣50', 標的類型: 'tw_stock', 交易幣別: 'TWD', 淨值幣別: 'TWD',
  是否啟用: true, 是否更新淨值: true, 建立時間: '2026-07-15 07:30:00', 更新時間: '', 備註: ''
});
assert.equal(mappedAsset.code, '0050');
assert.equal(mappedAsset.enabled, true);
assert.equal(mappedAsset.updatedAt, null);
assert.equal(Object.hasOwn(mappedAsset, 'rowNumber'), false);

const mappedTransaction = t.transactionToApiV83_({
  交易ID: 'TX-1', 日期: '2026-07-15', 標的代號: '0050', 標的名稱: '元大台灣50', 標的類型: 'tw_stock',
  交易幣別: 'TWD', 淨值幣別: 'TWD', 交易類型: 'buy', 數量: '2', 單價: '100', 手續費: '1', 實際入出金額: '201',
  人工金額標誌: false, 匯入批次ID: 'hidden', 原始入出帳戶: 'hidden', 帳戶ID: 'hidden', 帳戶名稱: 'hidden'
});
assert.equal(mappedTransaction.quantity, 2);
assert.equal(mappedTransaction.actualAmount, 201);
assert.equal(Object.hasOwn(mappedTransaction, 'importBatchId'), false);
assert.equal(JSON.stringify(mappedTransaction).includes('hidden'), false);

const properties = t.memoryPropertiesV83_();
properties.setProperty('AUTH_MODE', 'PASSWORD_SESSION');
properties.setProperty('AUTH_SESSION_SECRET', crypto.randomBytes(32).toString('base64url'));
properties.setProperty('AUTH_PASSWORD_VERSION', '1');
properties.setProperty('AUTH_SESSION_VERSION', '1');
const options = {
  properties,
  settings: { NEEDS_RECALC: 'TRUE', DAILY_JOB_ENABLED: 'TRUE', DAILY_JOB_TIME: '07:30' }
};
const sessionToken = crypto.createHash('sha256').update('v83-api-session').digest('base64url');
t.createSessionV85_(sessionToken, false, options);
const queued = t.requestJobApiV83_('rebuild', options);
assert.equal(queued.success, true);
assert.equal(queued.code, 'OK');
assert.equal(queued.data.rebuild.status, 'pending');
const duplicate = t.requestJobApiV83_('rebuild', options);
assert.equal(duplicate.success, true);
assert.equal(duplicate.code, 'ALREADY_PENDING');
const blockedUnauthenticatedRebuild = t.handleApiRequestV83_({ action: 'requestRebuild', requestId: 'req-1', params: {}, payload: {} }, options);
assert.equal(blockedUnauthenticatedRebuild.success, false);
assert.equal(blockedUnauthenticatedRebuild.code, 'AUTH_REQUIRED');

const invalidAction = t.handleApiRequestV83_({ action: 'missingAction', sessionToken, requestId: 'req-3', params: {}, payload: {} }, options);
assert.equal(invalidAction.code, 'ACTION_NOT_FOUND');
const invalidField = t.handleApiRequestV83_({ action: 'requestRebuild', sessionToken, requestId: 'req-4', params: {}, payload: {}, extra: 1 }, options);
assert.equal(invalidField.code, 'INVALID_REQUEST');
const invalidSession = t.handleApiRequestV83_({ action: 'getJobStatus', sessionToken: crypto.createHash('sha256').update('invalid-session').digest('base64url'), requestId: 'req-5', params: {}, payload: {} }, options);
assert.equal(invalidSession.code, 'AUTH_SESSION_EXPIRED');

const health = JSON.parse(t.doGet().text);
assert.equal(health.success, true);
assert.equal(health.data.service, 'asset-record-api');
assert.equal(health.data.version, '8.5.0');
assert.equal(JSON.stringify(health).includes('assetCode'), false);

const badJson = JSON.parse(t.doPost({ postData: { contents: '{bad' } }).text);
assert.equal(badJson.code, 'INVALID_JSON');
const tooLarge = JSON.parse(t.doPost({ postData: { contents: 'x'.repeat(102401) } }).text);
assert.equal(tooLarge.code, 'PAYLOAD_TOO_LARGE');

const apiSource = fs.readFileSync(path.join(gasDir, '70_Api.gs'), 'utf8');
assert.ok(apiSource.includes('properties.setProperty(V85_AUTH.PROPERTIES.MODE, V85_AUTH.MODE_PASSWORD_SESSION)'));
assert.ok(apiSource.includes("operations.requestRebuild = requestJobApiV83_('rebuild', apiOptions)"));
for (const action of [
  'listAssets', 'getAsset', 'createAsset', 'updateAsset', 'disableAsset',
  'listTransactions', 'getTransaction', 'createTransaction', 'updateTransaction', 'deleteTransaction', 'restoreTransaction',
  'listExternalCashFlows', 'getExternalCashFlow', 'createExternalCashFlow', 'updateExternalCashFlow', 'deleteExternalCashFlow', 'restoreExternalCashFlow',
  'getDashboardSummary', 'getPerformanceList', 'getTrendData', 'requestRebuild', 'requestMarketRefresh', 'getJobStatus'
]) assert.ok(apiSource.includes(`'${action}'`), `missing API action ${action}`);
const removedAuthMarkers = [
  ['API', '_KEY'].join(''),
  ['api', 'Key'].join(''),
  ['generate', 'Api', 'Key'].join(''),
  ['validate', 'Api', 'Key'].join('')
];
removedAuthMarkers.forEach((marker) => assert.equal(source.includes(marker), false));
assert.equal(/onEdit\s*\(/.test(source), false);

console.log(JSON.stringify({ ok: true, assertions: 36, gasFiles }, null, 2));
