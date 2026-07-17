const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.argv[2] || 8766);
const root = path.resolve(__dirname, '..', 'asset-record-web', 'docs');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function sendJson(response, data) {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  response.end(JSON.stringify({ success: true, code: 'OK', message: '', version: '8.4.0', requestId: 'mock', data }));
}

let restoreOperation = null;

function mockData(action, request) {
  if (action === 'getJobStatus') return { system: { needsRecalc: false }, marketRefresh: {}, rebuild: {} };
  if (action === 'getDashboardSummary') return { summary: { allocation: {}, netAssetTwd: 0 }, meta: { needsRecalc: false } };
  if (action === 'getTrendData') return { items: [] };
  if (action === 'backup.getOverview') return {
    systemVersion: '8.4.0', schemaVersion: '8.4.0', lastFullUpdateAt: '2026-07-17T07:31:00+08:00',
    lastBackupAt: '2026-07-17T10:30:00+08:00', transactionCount: 431, assetCount: 18,
    cashFlowCount: 27, snapshotCount: 94, systemMode: 'NORMAL', canCreateBackup: true,
    checks: { primarySpreadsheet: true, settingsSheet: true, sourceSheets: true }
  };
  if (action === 'backup.list') return { items: [{
    backupId: 'BKP-MOCK', fileId: 'mock', fileName: '資產記錄_備份_20260717_103000_v8.4.0_手動備份',
    fileUrl: '#', createdAt: '2026-07-17T10:30:00+08:00', reason: 'MANUAL', reasonLabel: '手動備份',
    systemVersion: '8.4.0', transactionCount: 431, assetCount: 18, cashFlowCount: 27, snapshotCount: 94,
    snapshotEndDate: '2026-07-10', validationStatus: 'VERIFIED', availabilityStatus: 'AVAILABLE', result: 'SUCCESS'
  }] };
  if (action === 'backup.create') return { backup: {
    backupId: 'BKP-MOCK-NEW', fileName: '資產記錄_備份_20260717_104500_v8.4.0_手動備份', fileUrl: '#',
    systemVersion: '8.4.0', transactionCount: 431, assetCount: 18, cashFlowCount: 27, snapshotCount: 94,
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
  if (action === 'restore.elevate') return { elevatedToken: 'elevated_mock', expiresAt: '2026-07-17T11:00:00+08:00', expiresInSeconds: 600 };
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
}).listen(port, '127.0.0.1', () => console.log(`v8.4 UI test server: http://127.0.0.1:${port}`));
