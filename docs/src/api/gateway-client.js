(function (root) {
  'use strict';
  var pending = new Set();
  var activeConnection = null;

  function ApiError(code, message, data) { this.name = 'ApiError'; this.code = code || 'INTERNAL_ERROR'; this.message = message || '發生未預期的錯誤'; this.data = data || {}; if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError); }
  ApiError.prototype = Object.create(Error.prototype); ApiError.prototype.constructor = ApiError;
  function gatewayUrl() { var value = root.ASSET_RECORD_CONFIG && root.ASSET_RECORD_CONFIG.gatewayUrl; if (!value) throw new ApiError('CONFIG_REQUIRED', '尚未設定 Gateway URL'); return String(value); }
  function uuid() { return root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }
  function setConnection(connection) { activeConnection = connection || null; }
  function getConnection() { return activeConnection ? Object.assign({}, activeConnection) : null; }

  async function call(action, options) {
    options = options || {}; var idToken = root.AssetRecordSession.getIdToken();
    if (!idToken) throw new ApiError('AUTH_REQUIRED', '請先使用 Google 帳號登入');
    var spreadsheetId = options.spreadsheetId || (activeConnection && activeConnection.spreadsheetId);
    if (!spreadsheetId) throw new ApiError('SPREADSHEET_REQUIRED', '請先連結自己的資產記錄 Sheet');
    var dedupeKey = options.dedupeKey || action; if (pending.has(dedupeKey)) throw new ApiError('REQUEST_IN_PROGRESS', '相同操作仍在處理中'); pending.add(dedupeKey);
    try {
      var response = await root.fetch(gatewayUrl(), { method: 'POST', redirect: 'follow', credentials: 'include', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({
        action: action, idToken: idToken, spreadsheetId: spreadsheetId, clientVersion: '8.4.0', requestId: uuid(), params: options.params || {}, payload: options.payload || {}
      }) });
      var text = await response.text(); var result; try { result = JSON.parse(text); } catch (_error) {
        if (/^\s*</.test(text)) throw new ApiError('GATEWAY_AUTH_REQUIRED', '請先按「啟用私人 Sheet 存取」，在 Google 頁面完成授權後再試一次');
        throw new ApiError('INVALID_RESPONSE', 'Gateway 回應不是有效 JSON');
      }
      if (!result || typeof result.success !== 'boolean') throw new ApiError('INVALID_RESPONSE', 'Gateway 回應格式錯誤');
      if (!result.success) throw new ApiError(result.error && result.error.code, result.error && result.error.message, result.data);
      return result;
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('NETWORK_ERROR', error && error.message ? error.message : '無法連線 Gateway'); }
    finally { pending.delete(dedupeKey); }
  }
  root.AssetRecordApi = Object.freeze({ ApiError: ApiError, call: call, setConnection: setConnection, getConnection: getConnection });
})(window);
