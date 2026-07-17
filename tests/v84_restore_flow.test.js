const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeRange {
  constructor(sheet, row, column, rows, columns) { Object.assign(this, { sheet, row, column, rows, columns }); }
  getValues() { return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) => this.sheet.value(this.row + r, this.column + c))); }
  getDisplayValues() { return this.getValues().map((row) => row.map((value) => value == null ? '' : String(value))); }
  setValues(values) { values.forEach((row, r) => row.forEach((value, c) => this.sheet.setValue(this.row + r, this.column + c, value))); return this; }
  clearContent() { for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.columns; c++) this.sheet.setValue(this.row + r, this.column + c, ''); return this; }
  setNumberFormat(format) { this.sheet.formats.push({ row: this.row, column: this.column, rows: this.rows, columns: this.columns, format }); return this; }
}

class FakeSheet {
  constructor(name, values = []) { this.name = name; this.values = values.map((row) => row.slice()); this.hidden = false; this.formats = []; }
  value(row, column) { return (this.values[row - 1] || [])[column - 1] ?? ''; }
  setValue(row, column, value) { while (this.values.length < row) this.values.push([]); while (this.values[row - 1].length < column) this.values[row - 1].push(''); this.values[row - 1][column - 1] = value; }
  getName() { return this.name; }
  getDataRange() { return new FakeRange(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  getRange(row, column, rows = 1, columns = 1) { return new FakeRange(this, row, column, rows, columns); }
  getLastRow() { for (let index = this.values.length - 1; index >= 0; index--) if (this.values[index].some((value) => value !== '' && value != null)) return index + 1; return 0; }
  getLastColumn() { return this.values.reduce((max, row) => Math.max(max, row.length), 0); }
  getMaxRows() { return this.values.length; }
  getMaxColumns() { return Math.max(this.getLastColumn(), 1); }
  insertRowsAfter(after, count) { this.values.splice(after, 0, ...Array.from({ length: count }, () => [])); }
  isSheetHidden() { return this.hidden; }
  hideSheet() { this.hidden = true; }
  clone() { const clone = new FakeSheet(this.name, this.values); clone.hidden = this.hidden; return clone; }
}

class FakeSpreadsheet {
  constructor(id, name, sheets) { this.id = id; this.name = name; this.sheets = new Map(sheets.map((sheet) => [sheet.name, sheet])); }
  getId() { return this.id; }
  getName() { return this.name; }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) { const sheet = new FakeSheet(name); this.sheets.set(name, sheet); return sheet; }
  clone(id, name) { return new FakeSpreadsheet(id, name, Array.from(this.sheets.values(), (sheet) => sheet.clone())); }
}

class FakeTrigger {
  constructor(handler) { this.handler = handler; }
  getHandlerFunction() { return this.handler; }
}

const gasDir = path.resolve(__dirname, '..', 'gas');
const gasSource = fs.readdirSync(gasDir).filter((name) => name.endsWith('.gs')).sort()
  .map((name) => fs.readFileSync(path.join(gasDir, name), 'utf8')).join('\n') + `
globalThis.__test = {
  V81, V84_BACKUP,
  settingsMapFromSpreadsheetV84_, createFullBackup_,
  restorePreviewV84_, prepareRestore_, applyRestore_, finalizeRestore_, rollbackRestore_, restoreStatusV84_,
  validateSnapshots_, runPostRestoreRebuild_, expectedTrendDatesV82_
};
`;

const propertyValues = {};
const properties = {
  getProperty(key) { return Object.hasOwn(propertyValues, key) ? propertyValues[key] : null; },
  setProperty(key, value) { propertyValues[key] = String(value); return this; },
  deleteProperty(key) { delete propertyValues[key]; return this; }
};
let activeSpreadsheet;
let copyCount = 0;
let uuidCount = 0;
let triggers = [];
const spreadsheets = new Map();
const files = new Map();
const folders = new Map();

function fileObject(id, name, makeCopy) {
  return { id, name, trashed: false, getId() { return this.id; }, getName() { return this.name; }, isTrashed() { return this.trashed; }, makeCopy };
}

const context = vm.createContext({
  console,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest(_algorithm, text) { return Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest()); },
    getUuid() { uuidCount += 1; return `00000000-0000-4000-8000-${String(uuidCount).padStart(12, '0')}`; },
    formatDate(value, _timezone, format) {
      const date = new Date(value); const iso = date.toISOString();
      if (format === 'yyyy-MM-dd') {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
        const map = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${map.year}-${map.month}-${map.day}`;
      }
      if (format === 'yyyyMMdd_HHmmss') return iso.slice(0, 10).replace(/-/g, '') + '_' + iso.slice(11, 19).replace(/:/g, '');
      if (format.includes("'T'")) return iso.slice(0, 19) + '+08:00';
      return iso.slice(0, 19).replace('T', ' ');
    }
  },
  PropertiesService: { getScriptProperties: () => properties },
  LockService: {
    getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }),
    getDocumentLock: () => ({ waitLock() {}, releaseLock() {} })
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => activeSpreadsheet,
    openById(id) { if (!spreadsheets.has(id)) throw new Error('missing spreadsheet'); return spreadsheets.get(id); }
  },
  DriveApp: {
    createFolder(name) { const folder = { id: 'folder-1', name, getId() { return this.id; }, getName() { return this.name; }, isTrashed() { return false; } }; folders.set(folder.id, folder); return folder; },
    getFolderById(id) { if (!folders.has(id)) throw new Error('missing folder'); return folders.get(id); },
    getFileById(id) { if (!files.has(id)) throw new Error('missing file'); return files.get(id); }
  },
  ScriptApp: {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger(trigger) { triggers = triggers.filter((candidate) => candidate !== trigger); },
    newTrigger(handler) {
      return { timeBased() { return this; }, atHour() { return this; }, nearMinute() { return this; }, everyDays() { return this; }, inTimezone() { return this; }, create() { const trigger = new FakeTrigger(handler); triggers.push(trigger); return trigger; } };
    }
  }
});
new vm.Script(gasSource, { filename: 'asset-record-v84-restore-flow.gs' }).runInContext(context);
const t = context.__test;
const realValidateSnapshots = context.validateSnapshots_;

function row(headers, values) { return headers.map((header) => Object.hasOwn(values, header) ? values[header] : ''); }
function dataRow(sheetName, index = 1) { return activeSpreadsheet.getSheetByName(sheetName).values[index]; }

const sheets = [
  new FakeSheet(t.V81.SHEETS.TRANSACTIONS, [t.V81.HEADERS.TRANSACTIONS, row(t.V81.HEADERS.TRANSACTIONS, { 交易ID: 'TX-OLD', 日期: '2026-07-01', 標的代號: '0050', 標的名稱: '元大台灣50', 標的類型: 'tw_stock', 交易幣別: 'TWD', 淨值幣別: 'TWD', 交易類型: 'buy', 數量: 10, 單價: 100 })]),
  new FakeSheet(t.V81.SHEETS.ASSETS, [t.V81.HEADERS.ASSETS, row(t.V81.HEADERS.ASSETS, { 標的代號: '0050', 標的名稱: '元大台灣50', 標的類型: 'tw_stock', 交易幣別: 'TWD', 淨值幣別: 'TWD', 是否啟用: true })]),
  new FakeSheet(t.V81.SHEETS.CASH_FLOWS, [t.V81.HEADERS.CASH_FLOWS, row(t.V81.HEADERS.CASH_FLOWS, { 流水ID: 'CFX-OLD', 日期: '2026-07-01', 類型: '入金', 金額: 1000, 幣別: 'TWD' })]),
  new FakeSheet(t.V81.SHEETS.TREND, [t.V81.HEADERS.TREND, row(t.V81.HEADERS.TREND, { 取樣日期: '2026-07-10', 取樣級距: '10日', 投資淨資產_TWD: 1000 })]),
  new FakeSheet(t.V81.SHEETS.TREND_DETAIL, [t.V81.HEADERS.TREND_DETAIL, row(t.V81.HEADERS.TREND_DETAIL, { 取樣日期: '2026-07-10', 取樣級距: '10日', 標的代號: '0050', 標的名稱: '元大台灣50', 類別: '台股', 持有數量: 10, 市值_TWD: 1000 })]),
  new FakeSheet(t.V81.SHEETS.SETTINGS, [['設定項目', '設定值', '說明'], ['SYSTEM_VERSION', '8.5.0', ''], ['SCHEMA_VERSION', '8.5.0', ''], ['FILE_ROLE', 'PRIMARY', ''], ['BASE_CURRENCY', 'TWD', '']]),
  new FakeSheet(t.V81.SHEETS.CALCULATION, [t.V81.HEADERS.CALCULATION_REQUIRED, ['stale']]),
  new FakeSheet(t.V81.SHEETS.PERFORMANCE, [t.V81.HEADERS.PERFORMANCE_REQUIRED]),
  new FakeSheet(t.V81.SHEETS.CATEGORY_PERFORMANCE, [t.V81.HEADERS.CATEGORY_REQUIRED, ['stale']]),
  new FakeSheet(t.V81.SHEETS.TEMP, [t.V81.HEADERS.TREND_CACHE, ['stale']]),
  new FakeSheet(t.V81.SHEETS.DASHBOARD, [['stale dashboard']])
];
activeSpreadsheet = new FakeSpreadsheet('primary-id', '資產記錄', sheets);
spreadsheets.set(activeSpreadsheet.id, activeSpreadsheet);
files.set('primary-id', fileObject('primary-id', '資產記錄', (name) => {
  copyCount += 1;
  const id = `backup-file-${copyCount}`;
  const copy = activeSpreadsheet.clone(id, name); spreadsheets.set(id, copy);
  const file = fileObject(id, name); files.set(id, file); return file;
}));
triggers = [new FakeTrigger(t.V84_BACKUP.HANDLER_NAME)];
propertyValues.AUTH_PASSWORD_VERIFIER = 'auth-verifier-sentinel';

const sourceBackup = t.createFullBackup_('MANUAL', '還原整合測試', 'restore-source-request');
assert.equal(sourceBackup.validation.valid, true);
assert.equal(copyCount, 1);

activeSpreadsheet.getSheetByName(t.V81.SHEETS.TRANSACTIONS).values.push(row(t.V81.HEADERS.TRANSACTIONS, { 交易ID: 'TX-NEW', 日期: '2026-07-15', 標的代號: '0050', 交易類型: 'buy' }));
activeSpreadsheet.getSheetByName(t.V81.SHEETS.CASH_FLOWS).values.push(row(t.V81.HEADERS.CASH_FLOWS, { 流水ID: 'CFX-NEW', 日期: '2026-07-15', 類型: '入金', 金額: 500, 幣別: 'TWD' }));
const preview = t.restorePreviewV84_(sourceBackup.backup.backupId);
assert.equal(preview.current.transactionCount, 2);
assert.equal(preview.backup.transactionCount, 1);
const expectedSnapshotDates = t.expectedTrendDatesV82_('2024-01-01', '2026-07-17');
assert.equal(expectedSnapshotDates.length, 91);
const snapshotValidation = t.validateSnapshots_();
assert.equal(snapshotValidation.valid, true);
assert.ok(snapshotValidation.missingDates.length > 0);
activeSpreadsheet.getSheetByName(t.V81.SHEETS.TREND).values.push(dataRow(t.V81.SHEETS.TREND).slice());
assert.equal(t.validateSnapshots_().valid, false, '重複快照日期必須被偵測');
activeSpreadsheet.getSheetByName(t.V81.SHEETS.TREND).values.pop();

const prepared = t.prepareRestore_(sourceBackup.backup.backupId, {});
assert.equal(prepared.operation.currentStage, 'PREPARED');
assert.equal(prepared.emergencyBackup.validationStatus, 'VERIFIED');
assert.equal(copyCount, 2);
const interruptedPrepare = JSON.parse(propertyValues[t.V84_BACKUP.PROPERTIES.RESTORE_OPERATION]);
interruptedPrepare.currentStage = 'PREPARING';
propertyValues[t.V84_BACKUP.PROPERTIES.RESTORE_OPERATION] = JSON.stringify(interruptedPrepare);
const resumedPreparing = t.prepareRestore_(sourceBackup.backup.backupId, {});
assert.equal(resumedPreparing.operation.currentStage, 'PREPARED');
assert.equal(copyCount, 2, 'PREPARING 中斷續跑必須重用已完成的緊急備份');
const preparedAgain = t.prepareRestore_(sourceBackup.backup.backupId, {});
assert.equal(preparedAgain.resumed, true);
assert.equal(copyCount, 2, 'Prepare 續跑不得重複建立緊急備份');

const applied = t.applyRestore_(prepared.operation.operationId);
assert.equal(applied.operation.currentStage, 'SOURCE_RESTORED');
assert.equal(dataRow(t.V81.SHEETS.TRANSACTIONS)[0], 'TX-OLD');
assert.equal(activeSpreadsheet.getSheetByName(t.V81.SHEETS.TRANSACTIONS).getLastRow(), 2);
assert.equal(dataRow(t.V81.SHEETS.ASSETS)[0], '0050');
assert.equal(activeSpreadsheet.getSheetByName(t.V81.SHEETS.ASSETS).formats[0].format, '@');
assert.equal(dataRow(t.V81.SHEETS.CASH_FLOWS)[0], 'CFX-OLD');
assert.equal(activeSpreadsheet.getSheetByName(t.V81.SHEETS.CALCULATION).getLastRow(), 1);
assert.equal(activeSpreadsheet.getSheetByName('備份紀錄').getLastRow(), 3, '備份紀錄不得被來源備份覆蓋');
assert.equal(propertyValues.AUTH_PASSWORD_VERIFIER, 'auth-verifier-sentinel');

context.refreshPricesInternal_ = () => ({ updated: 1, failed: 0 });
context.refreshExchangeRatesInternal_ = () => ({ updated: 2, failed: 0 });
context.rebuildInvestmentStateInternal_ = () => ({ errorCount: 0 });
context.refreshDashboardInternalV82_ = () => ({ refreshed: true });
context.validateSnapshots_ = () => ({ valid: true, errors: [], warnings: [], snapshotCount: 1, detailCount: 1, missingDates: [] });
context.rebuildMissingTrendSnapshotsInternalV82_ = () => ({ missingBefore: 0, missingAfter: 0 });
const finalized = t.finalizeRestore_(prepared.operation.operationId);
assert.equal(finalized.operation.status, 'SUCCESS');
assert.equal(finalized.operation.result, 'SUCCESS');
assert.equal(propertyValues.SYSTEM_MODE, 'NORMAL');
assert.equal(t.restoreStatusV84_().hasUnfinishedOperation, false);
assert.equal(t.settingsMapFromSpreadsheetV84_(activeSpreadsheet).FILE_ROLE, 'PRIMARY');
assert.equal(activeSpreadsheet.getId(), 'primary-id');

context.validateSnapshots_ = realValidateSnapshots;
activeSpreadsheet.getSheetByName(t.V81.SHEETS.TREND).values.push(dataRow(t.V81.SHEETS.TREND).slice());
const snapshotWarningValidation = context.validatePostRestore_(context.readRestoreOperationV84_());
assert.equal(snapshotWarningValidation.valid, true, '快照需完整重建不得回滾已正確恢復的來源資料');
assert.ok(snapshotWarningValidation.warnings.some((warning) => warning.includes('完整重建')));
activeSpreadsheet.getSheetByName(t.V81.SHEETS.TREND).values.pop();
context.validateSnapshots_ = () => ({ valid: true, errors: [], warnings: [], snapshotCount: 1, detailCount: 1, missingDates: [] });

context.refreshPricesInternal_ = () => ({ updated: 0, failed: 1 });
context.refreshExchangeRatesInternal_ = () => { throw new Error('mock fx outage'); };
const warningMaintenance = t.runPostRestoreRebuild_({ warnings: [], options: { refreshPrices: true, refreshFx: true, fullSnapshotRebuild: false, fillMissingSnapshots: false } });
assert.ok(warningMaintenance.warnings.some((warning) => warning.includes('價格')));
assert.ok(warningMaintenance.warnings.some((warning) => warning.includes('匯率')));
context.refreshPricesInternal_ = () => ({ updated: 1, failed: 0 });
context.refreshExchangeRatesInternal_ = () => ({ updated: 2, failed: 0 });

// 第二次還原故意破壞正式表頭，驗證 ROLLBACK_REQUIRED 與同一服務回復緊急備份。
activeSpreadsheet.getSheetByName(t.V81.SHEETS.TRANSACTIONS).values[1][0] = 'TX-PRE-ROLLBACK';
const secondPrepared = t.prepareRestore_(sourceBackup.backup.backupId, {});
assert.equal(copyCount, 3);
const transactionSheet = activeSpreadsheet.getSheetByName(t.V81.SHEETS.TRANSACTIONS);
transactionSheet.values[0][0] = 'BROKEN_ID_HEADER';
assert.throws(() => t.applyRestore_(secondPrepared.operation.operationId), (error) => error.apiCode === 'ROLLBACK_REQUIRED');
assert.equal(propertyValues.SYSTEM_MODE, 'RESTORE_FAILED');
assert.equal(t.restoreStatusV84_().rollbackRequired, true);
transactionSheet.values[0][0] = '交易ID';
const rollbackPrepared = t.rollbackRestore_(secondPrepared.operation.operationId);
assert.equal(rollbackPrepared.operation.rollbackMode, true);
assert.equal(copyCount, 3, '回復不得再建立另一份緊急備份');
const rollbackApplied = t.applyRestore_(secondPrepared.operation.operationId);
assert.equal(rollbackApplied.operation.currentStage, 'SOURCE_RESTORED');
assert.equal(dataRow(t.V81.SHEETS.TRANSACTIONS)[0], 'TX-PRE-ROLLBACK');
const rollbackFinalized = t.finalizeRestore_(secondPrepared.operation.operationId);
assert.equal(rollbackFinalized.operation.status, 'SUCCESS');
assert.equal(rollbackFinalized.operation.rollbackMode, true);
assert.equal(propertyValues.SYSTEM_MODE, 'NORMAL');
assert.equal(activeSpreadsheet.getId(), 'primary-id');
assert.equal(propertyValues.AUTH_PASSWORD_VERIFIER, 'auth-verifier-sentinel');

console.log(JSON.stringify({ ok: true, assertions: 47, copies: copyCount, finalOperation: rollbackFinalized.operation.operationId }, null, 2));
