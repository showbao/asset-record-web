const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeRange {
  constructor(sheet, row, column, rows, columns) {
    this.sheet = sheet; this.row = row; this.column = column; this.rows = rows; this.columns = columns;
  }
  getValues() {
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) => this.sheet.value(this.row + r, this.column + c)));
  }
  setValues(values) {
    values.forEach((row, r) => row.forEach((value, c) => this.sheet.setValue(this.row + r, this.column + c, value)));
    return this;
  }
}

class FakeSheet {
  constructor(name, values = []) { this.name = name; this.values = values.map((row) => row.slice()); this.hidden = false; }
  value(row, column) { return (this.values[row - 1] || [])[column - 1] ?? ''; }
  setValue(row, column, value) {
    while (this.values.length < row) this.values.push([]);
    while (this.values[row - 1].length < column) this.values[row - 1].push('');
    this.values[row - 1][column - 1] = value;
  }
  getName() { return this.name; }
  getDataRange() { return new FakeRange(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  getRange(row, column, rows = 1, columns = 1) { return new FakeRange(this, row, column, rows, columns); }
  getLastRow() {
    for (let index = this.values.length - 1; index >= 0; index--) if (this.values[index].some((value) => value !== '' && value != null)) return index + 1;
    return 0;
  }
  getLastColumn() { return this.values.reduce((max, row) => Math.max(max, row.length), 0); }
  getMaxRows() { return this.values.length; }
  insertRowsAfter(after, count) { this.values.splice(after, 0, ...Array.from({ length: count }, () => [])); }
  isSheetHidden() { return this.hidden; }
  hideSheet() { this.hidden = true; }
  clone() { const sheet = new FakeSheet(this.name, this.values); sheet.hidden = this.hidden; return sheet; }
}

class FakeSpreadsheet {
  constructor(id, name, sheets) { this.id = id; this.name = name; this.sheets = new Map(sheets.map((sheet) => [sheet.name, sheet])); }
  getId() { return this.id; }
  getName() { return this.name; }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) { const sheet = new FakeSheet(name); this.sheets.set(name, sheet); return sheet; }
  clone(id, name) { return new FakeSpreadsheet(id, name, Array.from(this.sheets.values(), (sheet) => sheet.clone())); }
}

const gasDir = path.resolve(__dirname, '..', 'gas');
const source = fs.readdirSync(gasDir).filter((name) => name.endsWith('.gs')).sort()
  .map((name) => fs.readFileSync(path.join(gasDir, name), 'utf8')).join('\n') + `
globalThis.__test = { V81, V84_BACKUP, createFullBackup_, listAvailableBackups_, settingsMapFromSpreadsheetV84_ };
`;

const propertyValues = {};
const properties = {
  getProperty(key) { return Object.hasOwn(propertyValues, key) ? propertyValues[key] : null; },
  setProperty(key, value) { propertyValues[key] = String(value); return this; },
  deleteProperty(key) { delete propertyValues[key]; return this; }
};
let activeSpreadsheet;
const spreadsheets = new Map();
const files = new Map();
const folders = new Map();
let copyCount = 0;
let uuidCount = 0;

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
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => activeSpreadsheet,
    openById(id) { if (!spreadsheets.has(id)) throw new Error('missing spreadsheet'); return spreadsheets.get(id); }
  },
  DriveApp: {
    createFolder(name) {
      const folder = { id: 'folder-1', name, getId() { return this.id; }, getName() { return this.name; }, isTrashed() { return false; } };
      folders.set(folder.id, folder); return folder;
    },
    getFolderById(id) { if (!folders.has(id)) throw new Error('missing folder'); return folders.get(id); },
    getFileById(id) { if (!files.has(id)) throw new Error('missing file'); return files.get(id); }
  }
});
new vm.Script(source, { filename: 'asset-record-v84-flow.gs' }).runInContext(context);
const t = context.__test;

function row(headers, values) { return headers.map((header) => Object.hasOwn(values, header) ? values[header] : ''); }
const primarySheets = [
  new FakeSheet(t.V81.SHEETS.TRANSACTIONS, [t.V81.HEADERS.TRANSACTIONS, row(t.V81.HEADERS.TRANSACTIONS, { 交易ID: 'TX-1', 日期: '2026-07-01', 標的代號: '0050' })]),
  new FakeSheet(t.V81.SHEETS.ASSETS, [t.V81.HEADERS.ASSETS, row(t.V81.HEADERS.ASSETS, { 標的代號: '0050', 標的名稱: '元大台灣50' })]),
  new FakeSheet(t.V81.SHEETS.CASH_FLOWS, [t.V81.HEADERS.CASH_FLOWS, row(t.V81.HEADERS.CASH_FLOWS, { 流水ID: 'CFX-1', 日期: '2026-07-01' })]),
  new FakeSheet(t.V81.SHEETS.TREND, [t.V81.HEADERS.TREND, row(t.V81.HEADERS.TREND, { 取樣日期: '2026-07-10', 取樣級距: '10日' })]),
  new FakeSheet(t.V81.SHEETS.TREND_DETAIL, [t.V81.HEADERS.TREND_DETAIL, row(t.V81.HEADERS.TREND_DETAIL, { 取樣日期: '2026-07-10', 標的代號: '0050' })]),
  new FakeSheet(t.V81.SHEETS.SETTINGS, [['設定項目', '設定值', '說明'], ['SYSTEM_VERSION', '8.5.0', ''], ['SCHEMA_VERSION', '8.5.0', ''], ['FILE_ROLE', 'PRIMARY', '']])
];
activeSpreadsheet = new FakeSpreadsheet('primary-id', '資產記錄', primarySheets);
spreadsheets.set(activeSpreadsheet.id, activeSpreadsheet);
files.set('primary-id', fileObject('primary-id', '資產記錄', (name) => {
  copyCount += 1;
  const id = `backup-file-${copyCount}`;
  const copy = activeSpreadsheet.clone(id, name); spreadsheets.set(id, copy);
  const file = fileObject(id, name); files.set(id, file); return file;
}));

const first = t.createFullBackup_('MANUAL', '流程測試', 'request-1');
assert.equal(first.validation.valid, true, JSON.stringify(first.validation.errors));
assert.equal(first.backup.validationStatus, 'VERIFIED');
assert.equal(first.backup.transactionCount, 1);
assert.equal(copyCount, 1);
const copiedSpreadsheet = spreadsheets.get(first.backup.fileId);
assert.equal(t.settingsMapFromSpreadsheetV84_(activeSpreadsheet).FILE_ROLE, 'PRIMARY');
assert.equal(t.settingsMapFromSpreadsheetV84_(copiedSpreadsheet).FILE_ROLE, 'BACKUP');
assert.equal(t.settingsMapFromSpreadsheetV84_(copiedSpreadsheet).BACKUP_STATUS, 'ARCHIVE');
assert.equal(activeSpreadsheet.getSheetByName('備份紀錄').isSheetHidden(), true);
assert.equal(activeSpreadsheet.getSheetByName('備份紀錄').getLastRow(), 2);

const duplicate = t.createFullBackup_('MANUAL', '流程測試', 'request-1');
assert.equal(duplicate.backup.backupId, first.backup.backupId);
assert.equal(copyCount, 1, '相同 requestId 不得建立第二份副本');

let listed = t.listAvailableBackups_({ includeInvalid: false });
assert.equal(listed.length, 1);
assert.equal(listed[0].availabilityStatus, 'AVAILABLE');
files.get(first.backup.fileId).trashed = true;
listed = t.listAvailableBackups_({ includeInvalid: false });
assert.equal(listed.length, 1);
assert.equal(listed[0].availabilityStatus, 'MISSING');
assert.equal(activeSpreadsheet.getSheetByName('備份紀錄').getLastRow(), 2, '更新狀態不得新增重複紀錄');

files.get('primary-id').makeCopy = (name) => {
  copyCount += 1;
  const id = `backup-file-${copyCount}`;
  const corruptCopy = activeSpreadsheet.clone(id, name);
  corruptCopy.sheets.delete(t.V81.SHEETS.TREND_DETAIL);
  spreadsheets.set(id, corruptCopy);
  const file = fileObject(id, name); files.set(id, file); return file;
};
assert.throws(
  () => t.createFullBackup_('BEFORE_UPGRADE', '故意製造驗證失敗', 'request-2'),
  (error) => error.apiCode === 'BACKUP_VALIDATION_FAILED'
);
assert.equal(copyCount, 2);
assert.equal(activeSpreadsheet.getSheetByName('備份紀錄').getLastRow(), 3);
const failedLog = activeSpreadsheet.getSheetByName('備份紀錄').values[2];
const logHeaders = activeSpreadsheet.getSheetByName('備份紀錄').values[0];
assert.equal(failedLog[logHeaders.indexOf('驗證狀態')], 'INVALID');
assert.equal(failedLog[logHeaders.indexOf('建立結果')], 'FAILED');
assert.equal(propertyValues.SYSTEM_MODE, 'NORMAL');
assert.equal(t.settingsMapFromSpreadsheetV84_(activeSpreadsheet).FILE_ROLE, 'PRIMARY');

console.log(JSON.stringify({ ok: true, assertions: 23, backupId: first.backup.backupId, fileId: first.backup.fileId }, null, 2));
