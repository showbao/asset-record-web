(function (root) {
  'use strict';
  function keyFor(sub) { if (!sub) throw new Error('尚未登入 Google 帳號'); return 'asset-record.connection.' + sub; }
  function extractSpreadsheetId(value) {
    var text = String(value || '').trim();
    var match = text.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/) || text.match(/^([A-Za-z0-9_-]{20,})$/);
    return match ? match[1] : '';
  }
  function load(sub) { try { return JSON.parse(root.localStorage.getItem(keyFor(sub))) || null; } catch (_error) { return null; } }
  function save(sub, info) {
    var current = load(sub) || {};
    var connection = { spreadsheetId: String(info.spreadsheetId), spreadsheetName: String(info.spreadsheetName || '資產記錄'), connectedAt: current.connectedAt || new Date().toISOString(), lastVerifiedAt: new Date().toISOString() };
    root.localStorage.setItem(keyFor(sub), JSON.stringify(connection)); return connection;
  }
  function clear(sub) { root.localStorage.removeItem(keyFor(sub)); }
  root.AssetRecordConnection = Object.freeze({ keyFor: keyFor, extractSpreadsheetId: extractSpreadsheetId, load: load, save: save, clear: clear });
})(window);
