const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.argv[2] || 8766);
const root = path.resolve(__dirname, '..', 'docs');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function sendJson(response, data) {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  response.end(JSON.stringify({ success: true, code: 'OK', message: '', version: '8.5.0', requestId: 'mock', data }));
}

let restoreOperation = null;

function mockData(action, request) {
  if (action === 'auth.status') return { configured: true, mode: 'DUAL', algorithm: 'PBKDF2-HMAC-SHA256', locked: false, version: '8.5.0' };
  if (action === 'auth.begin') return { algorithm: 'PBKDF2-HMAC-SHA256', salt: 'MDEyMzQ1Njc4OWFiY2RlZg', iterations: 200000, passwordVersion: 1 };
  if (action === 'auth.login') return { sessionId: 'mock-session', expiresAt: '2026-07-24T12:00:00+08:00', rememberMe: Boolean(request.payload.rememberMe) };
  if (action === 'auth.getSession') return { sessionId: 'mock-session', username: 'mockuser', expiresAt: '2026-07-24T12:00:00+08:00', rememberMe: false };
  if (action === 'auth.elevate') return { elevatedId: 'mock-elevated', scope: request.payload.scope, elevatedToken: 'mock-elevated-token', expiresAt: '2026-07-17T11:00:00+08:00', expiresInSeconds: 600 };
  if (action === 'auth.logout' || action === 'auth.logoutAll' || action === 'auth.changePassword') return {};
  if (action === 'dashboard.getOverview') return {
    summary: { netAssetTwd: 5260000, externalNetContributionTwd: 4100000, totalPnlTwd: 1160000, cashTwd: 380000, totalReturn: 0.2829, xirr: 0.1372 },
    longTermTrend: [{ date: '2023-01-01', netAssetTwd: 1200000, externalNetContributionTwd: 1100000 }, { date: '2024-01-01', netAssetTwd: 2500000, externalNetContributionTwd: 2200000 }, { date: '2025-01-01', netAssetTwd: 3900000, externalNetContributionTwd: 3300000 }, { date: '2026-07-17', netAssetTwd: 5260000, externalNetContributionTwd: 4100000 }],
    sixMonthTrend: [{ date: '2026-02-01', netAssetTwd: 4550000, externalNetContributionTwd: 3900000 }, { date: '2026-04-01', netAssetTwd: 4730000, externalNetContributionTwd: 3950000 }, { date: '2026-06-01', netAssetTwd: 5010000, externalNetContributionTwd: 4050000 }, { date: '2026-07-17', netAssetTwd: 5260000, externalNetContributionTwd: 4100000 }],
    allocation: [{ label: '台股', valueTwd: 2600000 }, { label: '美股', valueTwd: 1550000 }, { label: '基金', valueTwd: 730000 }, { label: '現金', valueTwd: 380000 }],
    alerts: [{ level: 'warning', message: '0050 的價格日期已超過三日，請排入市場更新。' }],
    systemStatus: { updatedAt: '2026-07-17T07:31:00+08:00', oldestPriceDate: '2026-07-14', needsRecalc: false, dailyEnabled: true, dailyStatus: 'PASS', lastDailyRunAt: '2026-07-17T07:31:00+08:00', systemMode: 'NORMAL' }
  };
  if (action === 'transactions.list') return { items: [{ id: 'TX-1', date: '2026-07-16', assetCode: '0050', type: 'buy', quantity: 10, price: 198.5, actualAmount: -1985, tradeCurrency: 'TWD', deletedAt: null, note: '定期投入' }], page: 1, pageSize: 50, total: 1, totalPages: 1, hasNext: false, meta: { needsRecalc: false } };
  if (action === 'instruments.list') return {
    assets: { items: [{ code: '0050', name: '元大台灣50', type: 'tw_stock', tradeCurrency: 'TWD', navCurrency: 'TWD', updatePrice: true, priceSource: 'TWSE', enabled: true }], page: 1, pageSize: 40, total: 1, totalPages: 1, hasNext: false, meta: { needsRecalc: false } },
    performance: { items: [{ category: '台股', code: '0050', name: '元大台灣50', status: '持有中', currentPrice: 198.5, priceDate: '2026-07-16', marketValueTwd: 1985000, totalPnlTwd: 335000, transactionReturn: 0.203, xirr: 0.152 }], page: 1, pageSize: 40, total: 1, totalPages: 1, hasNext: false },
    meta: { needsRecalc: false }
  };
  if (action === 'cashflows.list') return { items: [{ id: 'CF-1', date: '2026-07-01', type: '入金', amount: 50000, currency: 'TWD', amountTwd: 50000, deletedAt: null, note: '每月投入' }], page: 1, pageSize: 50, total: 1, totalPages: 1, hasNext: false, meta: { needsRecalc: false } };
  if (action === 'system.getStatus') return { version: '8.5.0', schemaVersion: '8.5.0', auth: { configured: true, mode: 'DUAL', locked: false, lockedUntil: null, activeSessions: 1, maximumSessions: 5 }, jobs: { daily: { enabled: true, time: '07:30', lastRunAt: '2026-07-17T07:31:00+08:00', status: 'PASS' }, marketRefresh: { status: 'idle', finishedAt: '2026-07-17T07:31:00+08:00', error: null }, rebuild: { status: 'idle', finishedAt: '2026-07-17T07:31:00+08:00' }, needsRecalc: false, systemMode: 'NORMAL', trendCursor: {} }, meta: { needsRecalc: false, lastValidationAt: '2026-07-17T07:35:00+08:00', lastValidationStatus: 'PASS' } };
  if (action === 'getJobStatus') return { system: { needsRecalc: false }, marketRefresh: {}, rebuild: {} };
  if (action === 'getDashboardSummary') return { summary: { allocation: {}, netAssetTwd: 0 }, meta: { needsRecalc: false } };
  if (action === 'getTrendData') return { items: [] };
  if (action === 'backup.getOverview') return {
    systemVersion: '8.5.0', schemaVersion: '8.5.0', lastFullUpdateAt: '2026-07-17T07:31:00+08:00',
    lastBackupAt: '2026-07-17T10:30:00+08:00', transactionCount: 431, assetCount: 18,
    cashFlowCount: 27, snapshotCount: 94, systemMode: 'NORMAL', canCreateBackup: true,
    checks: { primarySpreadsheet: true, settingsSheet: true, sourceSheets: true }
  };
  if (action === 'backup.list') return { items: [{
    backupId: 'BKP-MOCK', fileId: 'mock', fileName: '資產記錄_備份_20260717_103000_v8.5.0_手動備份',
    fileUrl: '#', createdAt: '2026-07-17T10:30:00+08:00', reason: 'MANUAL', reasonLabel: '手動備份',
    systemVersion: '8.5.0', transactionCount: 431, assetCount: 18, cashFlowCount: 27, snapshotCount: 94,
    snapshotEndDate: '2026-07-10', validationStatus: 'VERIFIED', availabilityStatus: 'AVAILABLE', result: 'SUCCESS'
  }] };
  if (action === 'backup.create') return { backup: {
    backupId: 'BKP-MOCK-NEW', fileName: '資產記錄_備份_20260717_104500_v8.5.0_手動備份', fileUrl: '#',
    systemVersion: '8.5.0', transactionCount: 431, assetCount: 18, cashFlowCount: 27, snapshotCount: 94,
    validationStatus: 'VERIFIED'
  }, validation: { valid: true, errors: [], checks: [] } };
  if (action === 'restore.status') return { systemMode: restoreOperation && restoreOperation.status === 'RUNNING' ? 'RESTORE_RUNNING' : 'NORMAL', operation: restoreOperation, hasUnfinishedOperation: Boolean(restoreOperation && restoreOperation.status === 'RUNNING'), rollbackRequired: false };
  if (action === 'restore.preview') return {
    backup: mockData('backup.list').items[0], legacy: false, requiresLegacyConfirmation: false,
    current: { transactionCount: 436, assetCount: 19, cashFlowCount: 29, snapshotCount: 95 },
    comparison: [
      { key: 'transactions', label: '投資交易', current: 436, backup: 431 },
      { key: 'assets', label: '投資標的', current: 19, backup: 18 },
      { key: 'cashFlows', label: '外部出入金', current: 29, backup: 27 },
      { key: 'snapshots', label: '快照筆數', current: 95, backup: 94 },
      { key: 'lastTransactionDate', label: '最後交易日', current: '2026-07-17', backup: '2026-07-15' },
      { key: 'lastSnapshotDate', label: '最後快照日', current: '2026-07-17', backup: '2026-07-10' }
    ],
    warning: '還原後，備份建立時間之後新增或修改的正式資料將被取代。系統會先建立還原前緊急備份。'
  };
  if (action === 'restore.prepare') {
    restoreOperation = { operationId: 'RST-MOCK', sourceBackupId: request.payload.backupId, emergencyBackupId: 'BKP-EMERGENCY', currentStage: 'PREPARED', status: 'RUNNING', result: null, warnings: [], completedSheets: [], rollbackMode: false, options: request.payload.options };
    return { operation: restoreOperation, emergencyBackup: { backupId: 'BKP-EMERGENCY', validationStatus: 'VERIFIED' } };
  }
  if (action === 'restore.apply') {
    restoreOperation.currentStage = 'SOURCE_RESTORED'; restoreOperation.completedSheets = ['投資交易', '投資標的', '外部出入金', '投資趨勢快照', '趨勢估值明細'];
    return { operation: restoreOperation, writes: [] };
  }
  if (action === 'restore.finalize') {
    restoreOperation.currentStage = 'SUCCESS'; restoreOperation.status = 'SUCCESS'; restoreOperation.result = 'SUCCESS';
    return { operation: restoreOperation, validation: { valid: true, errors: [], warnings: [] } };
  }
  return {};
}

http.createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/mock') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (_error) {}
      sendJson(response, mockData(parsed.action, parsed));
    });
    return;
  }
  if (request.url === '/config.js') {
    response.writeHead(200, { 'Content-Type': types['.js'] });
    response.end("window.ASSET_RECORD_CONFIG = Object.freeze({ apiUrl: 'http://127.0.0.1:" + port + "/mock' });");
    return;
  }
  const pathname = decodeURIComponent((request.url || '/').split('?')[0]);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`v8.5 UI test server: http://127.0.0.1:${port}`));
