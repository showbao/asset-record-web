const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeRange {
  constructor(sheet, row, column, rows, columns) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rows = rows;
    this.columns = columns;
  }
  getValues() {
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) => this.sheet.value(this.row + r, this.column + c)));
  }
  getDisplayValues() {
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) => this.sheet.displayValue(this.row + r, this.column + c)));
  }
  setValues(values) {
    values.forEach((row, r) => row.forEach((value, c) => this.sheet.setValue(this.row + r, this.column + c, value)));
    return this;
  }
  clearContent() {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.columns; c++) this.sheet.setValue(this.row + r, this.column + c, '');
    return this;
  }
  setNumberFormat(format) {
    this.sheet.numberFormats.push({ row: this.row, column: this.column, rows: this.rows, columns: this.columns, format });
    return this;
  }
}

class FakeSheet {
  constructor(name, values, displayValues) {
    this.name = name;
    this.values = (values || []).map((row) => row.slice());
    this.displayValues = displayValues ? displayValues.map((row) => row.slice()) : null;
    this.numberFormats = [];
  }
  value(row, column) { return (this.values[row - 1] || [])[column - 1] ?? ''; }
  displayValue(row, column) {
    if (this.displayValues) return (this.displayValues[row - 1] || [])[column - 1] ?? '';
    const value = this.value(row, column);
    return value == null ? '' : String(value);
  }
  setValue(row, column, value) {
    while (this.values.length < row) this.values.push([]);
    while (this.values[row - 1].length < column) this.values[row - 1].push('');
    this.values[row - 1][column - 1] = value;
  }
  getDataRange() { return new FakeRange(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  getRange(row, column, rows = 1, columns = 1) { return new FakeRange(this, row, column, rows, columns); }
  getLastRow() {
    for (let index = this.values.length - 1; index >= 0; index--) if (this.values[index].some((value) => value !== '' && value != null)) return index + 1;
    return 0;
  }
  getLastColumn() { return this.values.reduce((max, row) => Math.max(max, row.length), 0); }
  getMaxRows() { return this.values.length; }
  insertRowsAfter(after, count) { this.values.splice(after, 0, ...Array.from({ length: count }, () => [])); }
}

class FakeSpreadsheet {
  constructor(id, sheets) { this.id = id; this.sheets = new Map(sheets.map((sheet) => [sheet.name, sheet])); }
  getId() { return this.id; }
  getSheetByName(name) { return this.sheets.get(name) || null; }
}

const propertiesState = {};
const properties = {
  getProperty(key) { return Object.hasOwn(propertiesState, key) ? propertiesState[key] : null; },
  setProperty(key, value) { propertiesState[key] = String(value); return this; },
  deleteProperty(key) { delete propertiesState[key]; return this; }
};
let activeSpreadsheet;
let uuid = 0;
let triggers = [];
class FakeTrigger {
  constructor(handler) { this.handler = handler; }
  getHandlerFunction() { return this.handler; }
}

const gasDir = path.resolve(__dirname, '..', 'gas');
const gasSource = fs.readdirSync(gasDir).filter((name) => name.endsWith('.gs')).sort()
  .map((name) => fs.readFileSync(path.join(gasDir, name), 'utf8')).join('\n') + `
globalThis.__test = {
  V81, V83_PROPERTIES, V84_BACKUP, V84_RESTORE_DEFAULT_OPTIONS,
  hashApiKeyV83_, issueRestoreElevatedTokenV84_, validateRestoreElevatedTokenV84_,
  normalizeRestoreOptionsV84_, restoreRequiredHeadersV84_, restoreSourceSheetByHeaders_,
  prepareRestore_, auditManagedDailyTrigger_, scheduledDailyJob
};
`;

const context = vm.createContext({
  console,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest(_algorithm, text) { return Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest()); },
    getUuid() { uuid += 1; return `00000000-0000-4000-8000-${String(uuid).padStart(12, '0')}`; },
    formatDate(value) { return new Date(value).toISOString(); }
  },
  PropertiesService: { getScriptProperties: () => properties },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => activeSpreadsheet },
  ScriptApp: {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger(trigger) { triggers = triggers.filter((candidate) => candidate !== trigger); },
    newTrigger(handler) {
      const builder = {
        timeBased() { return this; }, atHour() { return this; }, nearMinute() { return this; },
        everyDays() { return this; }, inTimezone() { return this; },
        create() { const trigger = new FakeTrigger(handler); triggers.push(trigger); return trigger; }
      };
      return builder;
    }
  }
});
new vm.Script(gasSource, { filename: 'asset-record-v84-restore.gs' }).runInContext(context);
const t = context.__test;

propertiesState[t.V83_PROPERTIES.API_KEY_HASH] = t.hashApiKeyV83_('current-api-key');
const elevated = t.issueRestoreElevatedTokenV84_('current-api-key');
assert.match(elevated.elevatedToken, /^elevated_/);
assert.equal(elevated.expiresInSeconds, 600);
assert.equal(t.validateRestoreElevatedTokenV84_(elevated.elevatedToken), true);
assert.throws(() => t.issueRestoreElevatedTokenV84_('wrong-key'), (error) => error.apiCode === 'REAUTH_REQUIRED');
propertiesState[t.V84_BACKUP.PROPERTIES.ELEVATED_TOKEN_EXPIRES_AT] = '1';
assert.throws(() => t.validateRestoreElevatedTokenV84_(elevated.elevatedToken), (error) => error.apiCode === 'REAUTH_REQUIRED');

const options = t.normalizeRestoreOptionsV84_({ refreshPrices: false, fullSnapshotRebuild: true });
assert.equal(options.refreshPrices, false);
assert.equal(options.fullSnapshotRebuild, true);
assert.equal(options.restoreSnapshots, true);
assert.throws(() => t.normalizeRestoreOptionsV84_({ unsupported: true }), (error) => error.apiCode === 'INVALID_REQUEST');

const sourceHeaders = ['標的名稱', '標的代號', '標的類型', '交易幣別', '淨值幣別'];
const source = new FakeSheet('投資標的', [sourceHeaders, ['元大台灣50', 50, 'tw_stock', 'TWD', 'TWD']], [sourceHeaders, ['元大台灣50', '0050', 'tw_stock', 'TWD', 'TWD']]);
const targetHeaders = ['標的代號', '標的名稱', '標的類型', '交易幣別', '淨值幣別', '基金ID', '備註'];
const target = new FakeSheet('投資標的', [targetHeaders, ['OLD', '舊資料', 'tw_stock', 'TWD', 'TWD', '', '會被清除']]);
const sourceBook = new FakeSpreadsheet('backup', [source]);
const targetBook = new FakeSpreadsheet('primary', [target]);
const mappingResult = t.restoreSourceSheetByHeaders_(sourceBook, targetBook, '投資標的', t.restoreRequiredHeadersV84_()['投資標的']);
assert.equal(mappingResult.rows, 1);
assert.deepEqual(target.values[1].slice(0, 7), ['0050', '元大台灣50', 'tw_stock', 'TWD', 'TWD', '', '']);
assert.equal(target.numberFormats[0].format, '@');
assert.equal(targetBook.getSheetByName('投資標的'), target, '還原不得刪除或重建既有分頁');

activeSpreadsheet = new FakeSpreadsheet('primary', [new FakeSheet('系統設定', [['設定項目', '設定值'], ['FILE_ROLE', 'PRIMARY']])]);
propertiesState[t.V84_BACKUP.PROPERTIES.ELEVATED_TOKEN_EXPIRES_AT] = String(Date.now() + 600000);
propertiesState[t.V84_BACKUP.PROPERTIES.SYSTEM_MODE] = t.V84_BACKUP.MODES.RESTORE_RUNNING;
propertiesState[t.V84_BACKUP.PROPERTIES.RESTORE_OPERATION] = JSON.stringify({ operationId: 'RST-A', sourceBackupId: 'BKP-A', currentStage: 'PREPARED', status: 'RUNNING' });
assert.throws(() => t.prepareRestore_('BKP-B', elevated.elevatedToken, {}), (error) => error.apiCode === 'RESTORE_ALREADY_RUNNING');
assert.equal(propertiesState[t.V84_BACKUP.PROPERTIES.SYSTEM_MODE], t.V84_BACKUP.MODES.RESTORE_RUNNING, '衝突請求不得清除既有還原鎖');
const settingsBeforeScheduledSkip = JSON.stringify(activeSpreadsheet.getSheetByName('系統設定').values);
const skippedJob = t.scheduledDailyJob();
assert.equal(skippedJob.code, 'SYSTEM_BUSY');
assert.equal(skippedJob.data.skipped, true);
assert.equal(JSON.stringify(activeSpreadsheet.getSheetByName('系統設定').values), settingsBeforeScheduledSkip, '還原鎖期間排程不得寫入設定');
propertiesState[t.V84_BACKUP.PROPERTIES.SYSTEM_MODE] = t.V84_BACKUP.MODES.BACKUP_RUNNING;
const skippedDuringBackup = t.scheduledDailyJob();
assert.equal(skippedDuringBackup.code, 'SYSTEM_BUSY');
assert.equal(skippedDuringBackup.data.skipped, true);
assert.equal(JSON.stringify(activeSpreadsheet.getSheetByName('系統設定').values), settingsBeforeScheduledSkip, '備份鎖期間排程不得寫入設定');

triggers = [new FakeTrigger(t.V84_BACKUP.HANDLER_NAME), new FakeTrigger(t.V84_BACKUP.HANDLER_NAME), new FakeTrigger('unrelatedHandler')];
const triggerAudit = t.auditManagedDailyTrigger_();
assert.equal(triggerAudit.before, 2);
assert.equal(triggerAudit.removed, 1);
assert.equal(triggerAudit.after, 1);
assert.equal(triggers.filter((trigger) => trigger.getHandlerFunction() === 'unrelatedHandler').length, 1, '不得刪除非本系統觸發器');
triggers = [];
const createdTriggerAudit = t.auditManagedDailyTrigger_();
assert.equal(createdTriggerAudit.created, true);
assert.equal(createdTriggerAudit.after, 1);

console.log(JSON.stringify({ ok: true, assertions: 27, restoreBatchSize: t.V84_BACKUP.RESTORE_BATCH_SIZE }, null, 2));
