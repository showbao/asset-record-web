const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const gasDir = path.resolve(__dirname, '..', 'gas');
const gasFiles = fs.readdirSync(gasDir).filter((name) => name.endsWith('.gs')).sort();
const source = gasFiles.map((name) => fs.readFileSync(path.join(gasDir, name), 'utf8')).join('\n') + `
globalThis.__test = {
  V81,
  dateKey_,
  expectedTrendDatesV82_,
  sampleLevelV82_,
  computeInvestmentStateCore_,
  resolveHistoricalPriceV82_,
  computeInvestmentCashV82_,
  rollingSixMonthCutoffV82_,
  portfolioXirrV82_,
  trendDatesForMonthV82_
};`;

const context = vm.createContext({
  console,
  Utilities: {
    formatDate(date, timezone, format) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date(date)).map((part) => [part.type, part.value]));
      const day = `${parts.year}-${parts.month}-${parts.day}`;
      return format === 'yyyy-MM-dd' ? day : `${day} ${parts.hour}:${parts.minute}:${parts.second}`;
    }
  }
});
new vm.Script(source, { filename: 'asset-record-v82.gs' }).runInContext(context);
const t = context.__test;

const samples = t.expectedTrendDatesV82_('2024-01-01', '2026-07-14').map(t.dateKey_);
assert.equal(samples.length, 91);
assert.ok(samples.includes('2024-02-29'));
assert.ok(samples.includes('2026-07-10'));
assert.ok(!samples.includes('2026-07-20'));
assert.equal(t.sampleLevelV82_('2024-02-29'), '月底');
assert.equal(t.sampleLevelV82_('2024-02-28'), '');

const assets = [{ 標的代號: 'TEST', 標的名稱: '測試', 標的類型: 'tw_stock', 交易幣別: 'TWD', 淨值幣別: 'TWD', 是否啟用: true }];
const transactions = [
  { 交易ID: 'T1', 日期: '2024-01-01', 標的代號: 'TEST', 交易類型: 'buy', 數量: 10, 實際入出金額: 1000 },
  { 交易ID: 'T2', 日期: '2025-01-01', 標的代號: 'TEST', 交易類型: 'buy', 數量: 20, 實際入出金額: 2200 }
];
const cutoffState = t.computeInvestmentStateCore_(assets, transactions, [], [], '2024-12-31')[0];
assert.equal(cutoffState.quantity, 10);
assert.equal(cutoffState.remainingCostTrade, 1000);

function cacheRow(value, date, source = 'yahoo:TWD=X') {
  return { 數值: value, 資料日期: date, 幣別: 'TWD', 資料來源: source, 是否估算: false };
}
function fundContext(map) {
  return { cache: { map }, priceCacheMap: {} };
}

const twdFund = { 標的代號: 'FSI028', 標的類型: 'fund', 交易幣別: 'TWD', 淨值幣別: 'TWD' };
const twdFundTransactions = [
  { 交易ID: 'TX-BUY', 日期: '2024-03-01', 標的代號: 'FSI028', 交易類型: 'buy', 單價: 15, 交易幣別: 'TWD' },
  { 交易ID: 'TX-DIV', 日期: '2024-04-01', 標的代號: 'FSI028', 交易類型: 'dividend', 單價: 0, 交易幣別: 'TWD' }
];
const twdPrice = t.resolveHistoricalPriceV82_(twdFund, twdFundTransactions, '2024-04-20', fundContext({}));
assert.equal(twdPrice.value, 15);
assert.equal(twdPrice.source, 'transaction_price:TX-BUY');
assert.equal(twdPrice.estimated, true);

const usdFund = { 標的代號: '019002', 標的類型: 'fund', 交易幣別: 'TWD', 淨值幣別: 'USD' };
const usdTransactions = [{ 交易ID: 'TX-USD', 日期: '2024-03-01', 標的代號: '019002', 交易類型: 'buy', 單價: 262.4, 交易幣別: 'TWD' }];
const fxMap = {
  'FX|USD/TWD|2024-03-01': cacheRow(32.8, '2024-03-01'),
  'FX|USD/TWD|2024-04-20': cacheRow(33.2, '2024-04-19')
};
const usdPrice = t.resolveHistoricalPriceV82_(usdFund, usdTransactions, '2024-04-20', fundContext(fxMap));
assert.ok(Math.abs(usdPrice.value - 8) < 1e-12);
assert.equal(usdPrice.date, '2024-03-01');
assert.equal(usdPrice.source, 'transaction_price_fx_derived:TX-USD');
assert.equal(usdPrice.estimated, true);
assert.equal(t.resolveHistoricalPriceV82_(usdFund, usdTransactions, '2024-04-20', fundContext({})), null);

const cashTransactions = [
  { 交易ID: 'B', 日期: '2024-01-02', 交易類型: 'buy', 實際入出金額: 400, 交易幣別: 'TWD' },
  { 交易ID: 'S', 日期: '2024-01-03', 交易類型: 'sell', 實際入出金額: 100, 交易幣別: 'TWD' },
  { 交易ID: 'D', 日期: '2024-01-04', 交易類型: 'dividend', 實際入出金額: 20, 交易幣別: 'TWD' },
  { 交易ID: 'A', 日期: '2024-01-05', 交易類型: 'adjustment', 實際入出金額: -5, 交易幣別: 'TWD' }
];
const cashFlows = [
  { 流水ID: 'I', 日期: '2024-01-01', 類型: '入金', 金額_TWD: 1000 },
  { 流水ID: 'O', 日期: '2024-01-05', 類型: '出金', 金額_TWD: 50 }
];
const cash = t.computeInvestmentCashV82_(cashTransactions, cashFlows, '2024-01-31', fundContext({}));
assert.equal(cash.externalNetTwd, 950);
assert.equal(cash.transactionCashTwd, -285);
assert.equal(cash.cashTwd, 665);

assert.equal(t.rollingSixMonthCutoffV82_('2026-07-10'), '2026-01-10');
assert.equal(t.rollingSixMonthCutoffV82_('2024-08-31'), '2024-02-29');
const xirr = t.portfolioXirrV82_([{ 日期: '2025-01-01', 類型: '入金', 金額_TWD: 100 }], 110, '2026-01-01');
assert.ok(xirr > 0.09 && xirr < 0.11);

const july = t.trendDatesForMonthV82_('2026-07', '2026-07-14').map(t.dateKey_);
assert.equal(JSON.stringify(july), JSON.stringify(['2026-07-10']));

console.log(JSON.stringify({ ok: true, assertions: 25, sampleCount: samples.length }, null, 2));
