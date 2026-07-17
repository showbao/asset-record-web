const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const gasDir = path.resolve(__dirname, '..', 'gas');
const source = fs.readdirSync(gasDir).filter((name) => name.endsWith('.gs')).sort()
  .map((name) => fs.readFileSync(path.join(gasDir, name), 'utf8')).join('\n') + `
globalThis.__test = {
  V81,
  isDateValueV831_,
  cleanNullableNumberV831_,
  performanceToApiV83_,
  performanceNumberFormatsV831_,
  validateV831PerformanceAndApi,
  installV831,
  installV83
};`;

const context = vm.createContext({
  console,
  Utilities: {
    formatDate(value, _timezone, format) {
      const iso = new Date(value).toISOString();
      if (format === 'yyyy-MM-dd') return iso.slice(0, 10);
      if (format.includes("'T'")) return iso.slice(0, 19) + '+08:00';
      return iso.slice(0, 19).replace('T', ' ');
    }
  }
});
new vm.Script(source, { filename: 'asset-record-v831.gs' }).runInContext(context);
const t = context.__test;

assert.equal(t.V81.VERSION, '8.4.0');
assert.equal(t.V81.SCHEMA_VERSION, '8.4.0');
assert.equal(t.V81.HEADERS.PERFORMANCE_REQUIRED.filter((header) => header === 'XIRR（年化）').length, 1);
assert.equal(t.V81.HEADERS.PERFORMANCE_REQUIRED.includes('XIRR'), false);
assert.equal(typeof t.installV831, 'function');
assert.equal(typeof t.installV83, 'function');
assert.equal(typeof t.validateV831PerformanceAndApi, 'function');

const date = new Date('2026-07-15T00:00:00+08:00');
assert.equal(t.isDateValueV831_(date), true);
assert.equal(t.cleanNullableNumberV831_(date), null);
assert.equal(t.cleanNullableNumberV831_(NaN), null);
assert.equal(t.cleanNullableNumberV831_(Infinity), null);
assert.equal(t.cleanNullableNumberV831_(-Infinity), null);
assert.equal(t.cleanNullableNumberV831_(null), null);
assert.equal(t.cleanNullableNumberV831_(''), null);
assert.equal(t.cleanNullableNumberV831_('2026-07-15'), null);
assert.equal(t.cleanNullableNumberV831_('12.5'), 12.5);
assert.equal(t.cleanNullableNumberV831_('-0.25'), -0.25);
assert.equal(t.cleanNullableNumberV831_(0.1636), 0.1636);

const datePoisoned = {
  類別: '台股', 標的代號: 'TEST', 標的名稱: '測試', 狀態: '持有中',
  持有數量: date, 目前市值_TWD: date, 剩餘成本_TWD: date,
  已實現損益_TWD: date, 未實現損益_TWD: date, 累積股息_TWD: date,
  累積總損益_TWD: date, 累積交易報酬率: date, 目前資產占比: date,
  損益貢獻度: date, 首次交易日: date, 最後交易日: date, 更新時間: date,
  平均成本: date, 目前價格: date, 價格日期: date, 'XIRR（年化）': date
};
const mapped = t.performanceToApiV83_(datePoisoned);
for (const key of ['holdingQuantity', 'marketValueTwd', 'remainingCostTwd', 'realizedPnlTwd', 'unrealizedPnlTwd', 'dividendsTwd', 'totalPnlTwd', 'transactionReturn', 'assetWeight', 'pnlContribution', 'averageCost', 'currentPrice', 'xirr']) {
  assert.equal(mapped[key], null, `${key} must reject Date`);
}
assert.equal(mapped.priceDate, '2026-07-14');
assert.deepEqual(Object.keys(mapped).filter((key) => /xirr/i.test(key)), ['xirr']);

assert.deepEqual(JSON.parse(JSON.stringify(t.performanceNumberFormatsV831_())), {
  平均成本: '#,##0.########',
  目前價格: '#,##0.########',
  價格日期: 'yyyy-mm-dd',
  資產占比: '0.00%',
  整體投資報酬率: '0.00%',
  'XIRR（年化）': '0.00%'
});

const format = require(path.resolve(__dirname, '..', 'docs', 'ui-format.js'));
assert.equal(format.percentText(NaN), '—');
assert.equal(format.percentText(Infinity), '—');
assert.equal(format.percentText(-Infinity), '—');
assert.equal(format.percentText(null), '—');
assert.equal(format.percentText('0.1'), '—');
assert.notEqual(format.percentText(-0.2813348913828088), '—');
assert.equal(format.assetTypeText('tw_stock'), '台股');
assert.equal(format.assetTypeText('us_stock'), '美股');
assert.equal(format.transactionTypeText('stock_dividend'), '股票股利');
assert.match(format.currencyText(12.5, 'USD'), /USD/);

const apiSource = fs.readFileSync(path.join(gasDir, '70_Api.gs'), 'utf8');
assert.equal(/cleanNullableNumberV831_[\s\S]*?getTime\s*\(/.test(apiSource.slice(apiSource.indexOf('function cleanNullableNumberV831_'), apiSource.indexOf('function cleanNullableNumberV83_'))), false);
assert.equal(/(?:原幣|TWD|本輪|終身)[_（( ]*XIRR|XIRR[_（( ]*(?:原幣|TWD|本輪|終身)/.test(source), false);
assert.equal(/V81\.VERSION === '8\.3\.1' && V81\.SCHEMA_VERSION === '8\.3\.1'/.test(apiSource), false);
assert.match(apiSource, /\['8\.3\.1', '8\.4\.0'\]\.indexOf\(V81\.VERSION\)/);
const validationSource = apiSource.slice(apiSource.indexOf('function validateV831PerformanceAndApi'), apiSource.indexOf('function runPhase3ValidationV83_'));
assert.match(validationSource, /LAST_VALIDATION_STATUS: result\.success \? 'PASS' : 'FAIL'/);
assert.match(validationSource, /LAST_VALIDATION_STATUS: 'ERROR'/);
const systemSource = fs.readFileSync(path.join(gasDir, '80_System.gs'), 'utf8');
assert.match(systemSource, /\['8\.2\.0', '8\.3\.0', '8\.3\.1', '8\.4\.0'\]\.indexOf\(V81\.VERSION\)/);

console.log(JSON.stringify({ ok: true, assertions: 50, version: t.V81.VERSION }, null, 2));
