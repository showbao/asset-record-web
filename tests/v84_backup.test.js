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
  V84_BACKUP,
  V84_BACKUP_LOG_HEADERS,
  RESTORABLE_SETTING_KEYS,
  restoreRequiredHeadersV84_,
  restoreRequiredSheetNamesV84_,
  backupReasonLabelV84_,
  backupFileNameV84_,
  buildBackupSummary_,
  computeBackupFingerprint_,
  validateRequiredSheets_,
  validateRequiredHeaders_,
  validateSourceCounts_,
  validateBackupCandidate_,
  normalizePrimaryFileRoleV84_,
  assertPrimarySpreadsheet_,
  parseSpreadsheetIdV84_
};`;

let activeSpreadsheet = null;
const context = vm.createContext({
  console,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    computeDigest(_algorithm, text) {
      return Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest());
    },
    formatDate(value, _timezone, format) {
      const date = new Date(value);
      const iso = date.toISOString();
      if (format === 'yyyy-MM-dd') {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
      }
      if (format === 'yyyyMMdd_HHmmss') return iso.slice(0, 10).replace(/-/g, '') + '_' + iso.slice(11, 19).replace(/:/g, '');
      if (format.includes("'T'")) return iso.slice(0, 23) + '+08:00';
      return iso.slice(0, 19).replace('T', ' ');
    }
  },
  SpreadsheetApp: {
    getActiveSpreadsheet() { return activeSpreadsheet; }
  }
});
new vm.Script(source, { filename: 'asset-record-v84-backup.gs' }).runInContext(context);
const t = context.__test;

function makeSheet(name, values) {
  return {
    getName() { return name; },
    getDataRange() { return { getValues: () => values.map((row) => row.slice()) }; }
  };
}

function rowFor(headers, values) {
  return headers.map((header) => Object.hasOwn(values, header) ? values[header] : '');
}

function makeSpreadsheet(id, overrides = {}) {
  const sheets = new Map();
  const sourceDefinitions = [
    [t.V81.SHEETS.TRANSACTIONS, t.V81.HEADERS.TRANSACTIONS, { 交易ID: 'TX-1', 日期: '2026-07-01', 標的代號: '0050' }],
    [t.V81.SHEETS.ASSETS, t.V81.HEADERS.ASSETS, { 標的代號: '0050', 標的名稱: '元大台灣50' }],
    [t.V81.SHEETS.CASH_FLOWS, t.V81.HEADERS.CASH_FLOWS, { 流水ID: 'CFX-1', 日期: '2026-07-01' }],
    [t.V81.SHEETS.TREND, t.V81.HEADERS.TREND, { 取樣日期: '2026-07-10', 取樣級距: '10日' }],
    [t.V81.SHEETS.TREND_DETAIL, t.V81.HEADERS.TREND_DETAIL, { 取樣日期: '2026-07-10', 標的代號: '0050' }]
  ];
  sourceDefinitions.forEach(([name, headers, values]) => {
    if ((overrides.missingSheets || []).includes(name)) return;
    const targetHeaders = overrides[name] || headers;
    sheets.set(name, makeSheet(name, [targetHeaders, rowFor(targetHeaders, values)]));
  });
  const settings = Object.assign({
    SYSTEM_VERSION: '8.5.0',
    SCHEMA_VERSION: '8.5.0',
    FILE_ROLE: 'BACKUP',
    BACKUP_ID: 'BKP-1',
    BACKUP_STATUS: 'ARCHIVE',
    BACKUP_SOURCE_ID: 'primary-id',
    BACKUP_SYSTEM_VERSION: '8.5.0',
    BACKUP_SCHEMA_VERSION: '8.5.0'
  }, overrides.settings || {});
  sheets.set(t.V81.SHEETS.SETTINGS, makeSheet(t.V81.SHEETS.SETTINGS, [
    ['設定項目', '設定值', '說明'],
    ...Object.entries(settings).map(([key, value]) => [key, value, ''])
  ]));
  return {
    getId() { return id; },
    getName() { return '測試備份'; },
    getSheetByName(name) { return sheets.get(name) || null; }
  };
}

assert.equal(t.V81.VERSION, '8.5.0');
assert.equal(t.V84_BACKUP.VERSION, '8.5.0');
assert.equal(t.V84_BACKUP.FILE_ROLE_LEGACY_PRIMARY, 'PRODUCTION');
assert.equal(t.V84_BACKUP.SOURCE_SHEETS.length, 5);
assert.equal(t.V84_BACKUP_LOG_HEADERS.length, 22);
assert.deepEqual(Array.from(t.RESTORABLE_SETTING_KEYS), ['BASE_CURRENCY']);
assert.equal(t.backupReasonLabelV84_('BEFORE_IMPORT'), '匯入資料前');
assert.equal(t.backupReasonLabelV84_('unknown'), '其他');
assert.equal(t.backupFileNameV84_('MANUAL', '2026-07-17T02:30:00.000Z'), '資產記錄_備份_20260717_023000_v8.5.0_手動備份');
assert.equal(t.normalizePrimaryFileRoleV84_('PRODUCTION'), 'PRIMARY');
assert.equal(t.normalizePrimaryFileRoleV84_('PRIMARY'), 'PRIMARY');
assert.equal(t.normalizePrimaryFileRoleV84_('BACKUP'), 'BACKUP');

const backup = makeSpreadsheet('backup-id');
const summary = t.buildBackupSummary_(backup);
assert.equal(summary.transactionCount, 1);
assert.equal(summary.assetCount, 1);
assert.equal(summary.cashFlowCount, 1);
assert.equal(summary.snapshotCount, 1);
assert.equal(summary.earliestTransactionDate, '2026-07-01');
assert.equal(summary.snapshotEndDate, '2026-07-10');

const fingerprint = t.computeBackupFingerprint_(backup);
assert.match(fingerprint, /^[0-9a-f]{64}$/);
const sameBackup = makeSpreadsheet('backup-copy-id');
assert.equal(t.computeBackupFingerprint_(sameBackup), fingerprint);
const modifiedBackup = makeSpreadsheet('modified-id');
modifiedBackup.getSheetByName(t.V81.SHEETS.TRANSACTIONS).getDataRange = () => ({
  getValues: () => [t.V81.HEADERS.TRANSACTIONS, rowFor(t.V81.HEADERS.TRANSACTIONS, { 交易ID: 'TX-2', 日期: '2026-07-01', 標的代號: '0050' })]
});
assert.notEqual(t.computeBackupFingerprint_(modifiedBackup), fingerprint);

backup.getSheetByName(t.V81.SHEETS.SETTINGS).getDataRange = () => ({
  getValues: () => [
    ['設定項目', '設定值', '說明'],
    ['SYSTEM_VERSION', '8.5.0', ''], ['SCHEMA_VERSION', '8.5.0', ''], ['FILE_ROLE', 'BACKUP', ''],
    ['BACKUP_ID', 'BKP-1', ''], ['BACKUP_STATUS', 'ARCHIVE', ''], ['BACKUP_SOURCE_ID', 'primary-id', ''],
    ['BACKUP_SYSTEM_VERSION', '8.5.0', ''], ['BACKUP_SCHEMA_VERSION', '8.5.0', ''], ['BACKUP_FINGERPRINT', fingerprint, '']
  ]
});
const validation = t.validateBackupCandidate_(backup, {
  sourceSpreadsheetId: 'primary-id',
  backupId: 'BKP-1',
  expectedSummary: summary,
  expectedFingerprint: fingerprint,
  requireArchiveMetadata: true
});
assert.equal(validation.valid, true, JSON.stringify(validation.errors));

const missingHeader = makeSpreadsheet('bad-id', { [t.V81.SHEETS.ASSETS]: t.V81.HEADERS.ASSETS.slice(1) });
assert.equal(t.validateRequiredHeaders_(missingHeader).valid, false);
assert.equal(t.validateSourceCounts_({ transactionCount: 1, assetCount: 1, cashFlowCount: 1, snapshotCount: 1 }, summary).valid, true);
assert.equal(t.validateSourceCounts_({ transactionCount: 2, assetCount: 1, cashFlowCount: 1, snapshotCount: 1 }, summary).valid, false);

const legacyWithoutSnapshots = makeSpreadsheet('legacy-no-snapshots', { missingSheets: [t.V81.SHEETS.TREND, t.V81.SHEETS.TREND_DETAIL] });
const legacyRequiredHeaders = t.restoreRequiredHeadersV84_();
const legacySourceSheets = t.V84_BACKUP.SOURCE_SHEETS.filter((name) => Boolean(legacyWithoutSnapshots.getSheetByName(name)));
const legacySummary = t.buildBackupSummary_(legacyWithoutSnapshots, legacyRequiredHeaders);
const legacyFingerprint = t.computeBackupFingerprint_(legacyWithoutSnapshots, legacyRequiredHeaders, legacySourceSheets);
assert.equal(legacySummary.snapshotCount, 0);
assert.equal(t.validateRequiredSheets_(legacyWithoutSnapshots).valid, false);
assert.equal(t.validateRequiredSheets_(legacyWithoutSnapshots, t.restoreRequiredSheetNamesV84_()).valid, true);
const legacyValidation = t.validateBackupCandidate_(legacyWithoutSnapshots, {
  sourceSpreadsheetId: 'primary-id', expectedSummary: legacySummary, expectedFingerprint: legacyFingerprint,
  requireArchiveMetadata: false, requiredHeaders: legacyRequiredHeaders,
  requiredSheetNames: t.restoreRequiredSheetNamesV84_(), sourceSheetNames: legacySourceSheets
});
assert.equal(legacyValidation.valid, true, JSON.stringify(legacyValidation.errors));

activeSpreadsheet = makeSpreadsheet('primary-id', { settings: { FILE_ROLE: 'PRIMARY' } });
assert.equal(t.assertPrimarySpreadsheet_().getId(), 'primary-id');
activeSpreadsheet = backup;
assert.throws(() => t.assertPrimarySpreadsheet_(), (error) => error.apiCode === 'NOT_PRIMARY_FILE');
assert.equal(t.parseSpreadsheetIdV84_('https://docs.google.com/spreadsheets/d/abc_DEF-12345678901234567890/edit'), 'abc_DEF-12345678901234567890');
assert.throws(() => t.parseSpreadsheetIdV84_('not-a-sheet'), (error) => error.apiCode === 'INVALID_REQUEST');

const apiSource = fs.readFileSync(path.join(gasDir, '84_BackupRestoreApi.gs'), 'utf8');
for (const action of ['backup.getOverview', 'backup.create', 'backup.list', 'backup.preview', 'backup.validate', 'backup.registerLegacy']) {
  assert.ok(apiSource.includes(`'${action}'`), `missing API action ${action}`);
}
for (const action of ['restore.preview', 'restore.prepare', 'restore.apply', 'restore.finalize', 'restore.status', 'restore.rollback']) {
  assert.ok(apiSource.includes(`'${action}'`), `missing API action ${action}`);
}
const restoreSource = fs.readFileSync(path.join(gasDir, '82_RestoreService.gs'), 'utf8');
assert.equal(/deleteSheet\s*\(|insertSheet\s*\(/.test(restoreSource), false, '還原服務不得刪除或重建正式分頁');
assert.ok(restoreSource.includes('RESTORE_BATCH_SIZE'));
const systemSource = fs.readFileSync(path.join(gasDir, '80_System.gs'), 'utf8');
assert.ok(systemSource.includes('資產記錄備份（唯讀）'));
assert.ok(systemSource.includes(".addItem('安裝／修復 V8.5.0', 'installV85')"));
const manifest = JSON.parse(fs.readFileSync(path.join(gasDir, 'appsscript.json'), 'utf8'));
assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/drive'));
assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));

console.log(JSON.stringify({ ok: true, assertions: 51, fingerprint }, null, 2));
