const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const gasDir = path.resolve(__dirname, '..', 'gas');
const gasFiles = fs.readdirSync(gasDir).filter((name) => name.endsWith('.gs')).sort();
assert.deepEqual(gasFiles, [
  '00_Config.gs',
  '10_Core.gs',
  '20_DataService.gs',
  '30_TransactionService.gs',
  '40_MarketDataService.gs',
  '50_PortfolioEngine.gs',
  '60_TrendDashboard.gs',
  '70_Api.gs',
  '70_AuthConfig.gs',
  '71_AuthService.gs',
  '72_SessionService.gs',
  '73_AuthApi.gs',
  '74_ApiV85.gs',
  '80_BackupRestoreConfig.gs',
  '80_System.gs',
  '81_BackupService.gs',
  '82_RestoreService.gs',
  '83_BackupRestoreValidation.gs',
  '84_BackupRestoreApi.gs'
]);

const source = gasFiles.map((name) => fs.readFileSync(path.join(gasDir, name), 'utf8')).join('\n') + `
globalThis.__test = {
  V81,
  computeActualAmount_,
  replayQuantities_,
  validateNoOversell_,
  xirr_,
  computeInvestmentStateCore_,
  parseYahooResponse_,
  parseFundRichResponse_,
  validateTransaction_
};`;

const context = vm.createContext({
  console,
  Utilities: {
    formatDate(date, timezone, format) {
      const iso = new Date(date).toISOString();
      return format === 'yyyy-MM-dd' ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
    }
  }
});
new vm.Script(source, { filename: 'asset-record-v81.gs' }).runInContext(context);
const t = context.__test;

assert.equal(t.computeActualAmount_({ type: 'buy', quantity: 2, price: 10, fee: 1 }), 21);
assert.equal(t.computeActualAmount_({ type: 'sell', quantity: 2, price: 10, fee: 1 }), 19);

const historicalOversell = t.validateNoOversell_([
  { 交易ID: 'T1', 日期: '2025-01-01', 標的代號: '0050', 交易類型: 'sell', 數量: 1 },
  { 交易ID: 'T2', 日期: '2025-02-01', 標的代號: '0050', 交易類型: 'buy', 數量: 1 }
]);
assert.equal(historicalOversell.valid, false);
assert.equal(historicalOversell.errors[0].code, 'HISTORICAL_OVERSELL');
assert.equal(t.validateNoOversell_([{ 交易ID: 'T1', 日期: '2025-01-01', 標的代號: '0050', 交易類型: 'sell', 數量: 1, 刪除時間: '2025-02-01' }]).valid, true);

const assets = [{
  標的代號: 'FUND', 標的名稱: '測試基金', 標的類型: 'fund', 交易幣別: 'TWD', 淨值幣別: 'USD', 是否啟用: true
}];
const transactions = [
  { 交易ID: 'T1', 日期: '2025-01-01', 標的代號: 'FUND', 交易類型: 'buy', 數量: 10, 實際入出金額: 100 },
  { 交易ID: 'T2', 日期: '2025-02-01', 標的代號: 'FUND', 交易類型: 'buy', 數量: 10, 實際入出金額: 200 },
  { 交易ID: 'T3', 日期: '2025-03-01', 標的代號: 'FUND', 交易類型: 'sell', 數量: 5, 實際入出金額: 150 },
  { 交易ID: 'T4', 日期: '2025-04-01', 標的代號: 'FUND', 交易類型: 'dividend', 數量: 0, 實際入出金額: 10 },
  { 交易ID: 'T5', 日期: '2025-05-01', 標的代號: 'FUND', 交易類型: 'stock_dividend', 數量: 1, 實際入出金額: 0 },
  { 交易ID: 'T6', 日期: '2025-06-01', 標的代號: 'FUND', 交易類型: 'split', 分割前股數: 1, 分割後股數: 2, 數量: 0, 實際入出金額: 0 }
];
const state = t.computeInvestmentStateCore_(
  assets,
  transactions,
  [{ 標的代號: 'FUND', 最新價格: 20, 淨值幣別: 'USD', 價格日期: '2025-06-30', 最後成功時間: '2025-06-30 18:00:00' }],
  [{ 幣別組合: 'TWD/TWD', 匯率: 1 }, { 幣別組合: 'USD/TWD', 匯率: 30 }],
  '2025-06-30'
)[0];
assert.equal(state.quantity, 32);
assert.equal(state.soldCostTrade, 75);
assert.equal(state.realizedTrade, 75);
assert.equal(state.dividendTrade, 10);
assert.equal(state.marketTwd, 19200);
assert.equal(state.status, '正常');

const xirr = t.xirr_([{ date: '2025-01-01', amount: -100 }, { date: '2026-01-01', amount: 110 }]);
assert.ok(xirr > 0.09 && xirr < 0.11);
assert.equal(t.xirr_([{ date: '2025-01-01', amount: 100 }]), null);

const fakeResponse = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
const yahoo = t.parseYahooResponse_(fakeResponse(200, {
  chart: { result: [{ meta: { regularMarketPrice: 123.45, regularMarketTime: 1750000000, currency: 'TWD' }, timestamp: [1750000000], indicators: { quote: [{ close: [123] }] } }] }
}), { assetCode: '0050', symbol: '0050.TW', requestedSource: 'auto', currency: 'TWD' });
assert.equal(yahoo.success, true);
assert.equal(yahoo.actualSource, 'yahoo:0050.TW');
assert.equal(yahoo.price, 123.45);

const yahooFallback = t.parseYahooResponse_(fakeResponse(200, {
  chart: { result: [{ meta: { regularMarketPrice: null, currency: 'USD' }, timestamp: [1750000000, 1750086400], indicators: { quote: [{ close: [10, 11] }] } }] }
}), { assetCode: 'VOO', symbol: 'VOO', requestedSource: 'auto', currency: 'USD' });
assert.equal(yahooFallback.price, 11);

const fund = t.parseFundRichResponse_(fakeResponse(200, {
  data: [{ tablebox: [{ fundId: '019002', price: '8.7391', currency: 'USD', transdate: '2026/07/13' }] }]
}), { assetCode: '019002', fundId: '019002', requestedSource: 'auto', currency: 'USD' });
assert.equal(fund.success, true);
assert.equal(fund.price, 8.7391);
assert.equal(fund.priceDate, '2026-07-13');

const fundNotFound = t.parseFundRichResponse_(fakeResponse(200, { data: [{ fundId: 'OTHER', price: '1' }] }), {
  assetCode: '019002', fundId: '019002', requestedSource: 'auto', currency: 'USD'
});
assert.equal(fundNotFound.status, 'NOT_FOUND');

assert.throws(() => t.validateTransaction_({
  日期: new Date(), 標的代號: 'X', 交易類型: 'adjustment', 數量: 1, 實際入出金額: 10, 人工金額標誌: true, 備註: 'test'
}), /數量必須為 0/);

const forbidden = [
  [/\binv[2-7]\b/i, 'inv2-inv7'],
  [/\bonEdit\s*\(/, 'onEdit'],
  [/GOOGLEFINANCE/i, 'GOOGLEFINANCE'],
  [/\.appendRow\s*\(/, 'appendRow'],
  [/\.setValue\s*\(/, 'setValue'],
  [/\.getValue\s*\(/, 'getValue'],
  [/Utilities\.sleep\s*\(/, 'sleep'],
  [/SpreadsheetApp\.flush\s*\(/, 'flush']
];
for (const [pattern, label] of forbidden) assert.equal(pattern.test(source), false, `forbidden pattern: ${label}`);

console.log(JSON.stringify({ ok: true, gasFiles, assertions: 30 }, null, 2));
