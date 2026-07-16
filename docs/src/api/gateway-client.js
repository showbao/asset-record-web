(function (root) {
  'use strict';
  var pending = new Set();
  var activeConnection = null;
  var bridgeWindow = null;
  var bridgeSessionId = '';
  var bridgeReady = false;
  var bridgeReadyWaiters = [];
  var bridgeResponses = new Map();
  var BRIDGE_CHANNEL = 'asset-record-gateway-v840';
  var BRIDGE_WINDOW_NAME = 'asset-record-gateway-v840';
  var BRIDGE_BUILD = '8.4.0-phase1g';

  function ApiError(code, message, data) { this.name = 'ApiError'; this.code = code || 'INTERNAL_ERROR'; this.message = message || '發生未預期的錯誤'; this.data = data || {}; if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError); }
  ApiError.prototype = Object.create(Error.prototype); ApiError.prototype.constructor = ApiError;
  function gatewayUrl() { var value = root.ASSET_RECORD_CONFIG && root.ASSET_RECORD_CONFIG.gatewayUrl; if (!value) throw new ApiError('CONFIG_REQUIRED', '尚未設定 Gateway URL'); return String(value); }
  function uuid() { return root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }
  function setConnection(connection) { activeConnection = connection || null; }
  function getConnection() { return activeConnection ? Object.assign({}, activeConnection) : null; }

  function callbackUrl() {
    var url = new URL('bridge-relay.html', root.location.href);
    url.hash = '';
    url.search = '';
    url.searchParams.set('v', BRIDGE_BUILD);
    return url.href;
  }

  function rejectReadyWaiters(error) {
    var waiters = bridgeReadyWaiters.splice(0);
    waiters.forEach(function (waiter) { root.clearTimeout(waiter.timeoutId); waiter.reject(error); });
  }

  function rejectBridgeResponses(error) {
    bridgeResponses.forEach(function (response) {
      root.clearTimeout(response.timeoutId);
      response.reject(error);
    });
    bridgeResponses.clear();
  }

  function onBridgeMessage(event) {
    var data = event.data;
    if (!bridgeWindow || bridgeWindow.closed) return;
    if (event.origin !== root.location.origin || event.source !== bridgeWindow) return;
    if (!data || data.channel !== BRIDGE_CHANNEL || data.sessionId !== bridgeSessionId) return;
    if (data.type === 'ready') {
      bridgeReady = true;
      var waiters = bridgeReadyWaiters.splice(0);
      waiters.forEach(function (waiter) { root.clearTimeout(waiter.timeoutId); waiter.resolve(); });
      return;
    }
    if (data.type !== 'response' || !data.bridgeId) return;
    var response = bridgeResponses.get(data.bridgeId);
    if (!response) return;
    bridgeResponses.delete(data.bridgeId);
    root.clearTimeout(response.timeoutId);
    response.resolve(data.result);
  }

  function authorizeGateway() {
    gatewayUrl();
    var profile = root.AssetRecordSession && root.AssetRecordSession.getProfile();
    if (!profile || !profile.email) throw new ApiError('AUTH_REQUIRED', '請先使用 Google 帳號登入');
    bridgeReady = false;
    bridgeSessionId = 'session-' + uuid();
    var reopenedError = new ApiError('GATEWAY_REOPENED', 'Gateway 視窗正在重新開啟');
    rejectReadyWaiters(reopenedError);
    rejectBridgeResponses(reopenedError);
    var relayHash = 'session=' + encodeURIComponent(bridgeSessionId) + '&account=' + encodeURIComponent(String(profile.email).trim().toLowerCase());
    bridgeWindow = root.open(callbackUrl() + '#' + relayHash, BRIDGE_WINDOW_NAME, 'popup,width=540,height=680');
    if (!bridgeWindow) throw new ApiError('POPUP_BLOCKED', '瀏覽器封鎖了 Gateway 視窗，請允許此網站開啟彈出式視窗');
    return true;
  }

  function waitForBridge() {
    if (!bridgeWindow || bridgeWindow.closed) {
      return Promise.reject(new ApiError('GATEWAY_AUTH_REQUIRED', '請先按「啟用私人 Sheet 存取」，並保持 Gateway 視窗開啟'));
    }
    if (bridgeReady) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var waiter = { resolve: resolve, reject: reject, timeoutId: null };
      waiter.timeoutId = root.setTimeout(function () {
        var index = bridgeReadyWaiters.indexOf(waiter);
        if (index >= 0) bridgeReadyWaiters.splice(index, 1);
        reject(new ApiError('GATEWAY_AUTH_REQUIRED', 'Gateway 尚未完成授權，請確認 Gateway 視窗仍保持開啟'));
      }, 45000);
      bridgeReadyWaiters.push(waiter);
    });
  }

  function postThroughBridge(request) {
    return waitForBridge().then(function () {
      return new Promise(function (resolve, reject) {
        var bridgeId = 'bridge-' + uuid();
        var timeoutId = root.setTimeout(function () {
          bridgeResponses.delete(bridgeId);
          reject(new ApiError('GATEWAY_TIMEOUT', 'Gateway 回應逾時，請重試一次'));
        }, 45000);
        bridgeResponses.set(bridgeId, { resolve: resolve, reject: reject, timeoutId: timeoutId });
        bridgeWindow.postMessage({ channel: BRIDGE_CHANNEL, type: 'request', sessionId: bridgeSessionId, bridgeId: bridgeId, request: request }, root.location.origin);
      });
    });
  }

  async function call(action, options) {
    options = options || {}; var idToken = root.AssetRecordSession.getIdToken();
    if (!idToken) throw new ApiError('AUTH_REQUIRED', '請先使用 Google 帳號登入');
    var spreadsheetId = options.spreadsheetId || (activeConnection && activeConnection.spreadsheetId);
    if (!spreadsheetId) throw new ApiError('SPREADSHEET_REQUIRED', '請先連結自己的資產記錄 Sheet');
    var dedupeKey = options.dedupeKey || action; if (pending.has(dedupeKey)) throw new ApiError('REQUEST_IN_PROGRESS', '相同操作仍在處理中'); pending.add(dedupeKey);
    try {
      var result = await postThroughBridge({
        action: action, idToken: idToken, spreadsheetId: spreadsheetId, clientVersion: '8.4.0', requestId: uuid(), params: options.params || {}, payload: options.payload || {}
      });
      if (!result || typeof result.success !== 'boolean') throw new ApiError('INVALID_RESPONSE', 'Gateway 回應格式錯誤');
      if (!result.success) throw new ApiError(result.error && result.error.code, result.error && result.error.message, result.data);
      return result;
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('NETWORK_ERROR', error && error.message ? error.message : '無法連線 Gateway'); }
    finally { pending.delete(dedupeKey); }
  }
  root.addEventListener('message', onBridgeMessage);
  root.AssetRecordApi = Object.freeze({ ApiError: ApiError, call: call, authorizeGateway: authorizeGateway, setConnection: setConnection, getConnection: getConnection });
})(window);
