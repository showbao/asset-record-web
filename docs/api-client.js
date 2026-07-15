(function (root, factory) {
  var exported = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else root.AssetRecordApi = exported;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var KEY_NAME = 'assetRecordV83ApiKey';
  var pending = new Set();

  function ApiError(code, message, data) {
    this.name = 'ApiError';
    this.code = code || 'INTERNAL_ERROR';
    this.message = message || '操作失敗';
    this.data = data || {};
    if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError);
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function storage() {
    if (!root.sessionStorage) throw new ApiError('SESSION_UNAVAILABLE', '瀏覽器無法使用工作階段儲存空間');
    return root.sessionStorage;
  }

  function saveKey(value) {
    var input = String(value || '').trim();
    // The Sheet dialog contains the token followed by usage instructions. If
    // the user copies the whole dialog, keep only the generated 256-bit token.
    var token = input.match(/arv83_[0-9a-f]{96}/i);
    var key = token ? token[0] : input;
    if (!key) throw new ApiError('AUTH_REQUIRED', '請輸入 API 金鑰');
    storage().setItem(KEY_NAME, key);
  }

  function getKey() { return storage().getItem(KEY_NAME) || ''; }
  function clearKey() { storage().removeItem(KEY_NAME); }

  function apiUrl() {
    var value = root.ASSET_RECORD_CONFIG && root.ASSET_RECORD_CONFIG.apiUrl;
    if (!value) throw new ApiError('CONFIG_REQUIRED', '尚未設定 GAS Web App API URL');
    return String(value);
  }

  function uuid() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  async function call(action, options) {
    options = options || {};
    var requestId = uuid();
    var dedupeKey = options.dedupeKey || action;
    if (pending.has(dedupeKey)) throw new ApiError('REQUEST_IN_PROGRESS', '相同操作正在處理中');
    pending.add(dedupeKey);
    try {
      var response = await root.fetch(apiUrl(), {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          action: action,
          apiKey: getKey(),
          requestId: requestId,
          params: options.params || {},
          payload: options.payload || {}
        })
      });
      var text = await response.text();
      var result;
      try { result = JSON.parse(text); }
      catch (_error) { throw new ApiError('INVALID_RESPONSE', 'API 回應不是有效 JSON'); }
      if (!result || typeof result.success !== 'boolean') throw new ApiError('INVALID_RESPONSE', 'API 回應格式不完整');
      if (!result.success) throw new ApiError(result.code, result.message, result.data);
      return result;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('NETWORK_ERROR', error && error.message ? error.message : '無法連線到 API');
    } finally {
      pending.delete(dedupeKey);
    }
  }

  return Object.freeze({ ApiError: ApiError, saveKey: saveKey, getKey: getKey, clearKey: clearKey, call: call, keyName: KEY_NAME });
});
