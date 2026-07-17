(function (root, factory) {
  var exported = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else root.AssetRecordApi = exported;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var pending = new Set();
  var cache = new Map();
  var authFailureHandler = null;

  function ApiError(code, message, data) {
    this.name = 'ApiError';
    this.code = code || 'INTERNAL_ERROR';
    this.message = message || '操作失敗';
    this.data = data || {};
    if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError);
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function apiUrl() {
    var value = root.ASSET_RECORD_CONFIG && root.ASSET_RECORD_CONFIG.apiUrl;
    if (!value) throw new ApiError('CONFIG_REQUIRED', '系統連線設定不完整');
    return String(value);
  }

  function uuid() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    var bytes = new Uint8Array(16);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (value) { return ('0' + value.toString(16)).slice(-2); }).join('');
  }

  function sessionToken() {
    return root.AssetRecordSessionStore ? root.AssetRecordSessionStore.get() : '';
  }

  function isAuthFailure(code) {
    return ['AUTH_REQUIRED', 'AUTH_SESSION_EXPIRED', 'AUTH_SESSION_REVOKED', 'AUTH_PASSWORD_VERSION_MISMATCH'].indexOf(code) >= 0;
  }

  async function request(action, options) {
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
          sessionToken: options.sessionToken === undefined ? sessionToken() : options.sessionToken,
          elevatedToken: options.elevatedToken || '',
          requestId: requestId,
          params: options.params || {},
          payload: options.payload || {}
        })
      });
      var text = await response.text();
      var result;
      try { result = JSON.parse(text); }
      catch (_error) { throw new ApiError('INVALID_RESPONSE', '系統回應格式不完整'); }
      if (!result || typeof result.success !== 'boolean') throw new ApiError('INVALID_RESPONSE', '系統回應格式不完整');
      if (!result.success) {
        var apiError = new ApiError(result.code, result.message, result.data);
        if (isAuthFailure(apiError.code) && authFailureHandler) authFailureHandler(apiError);
        throw apiError;
      }
      return result;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('NETWORK_ERROR', '目前無法連線，請稍後再試');
    } finally {
      pending.delete(dedupeKey);
    }
  }

  async function call(action, options) {
    options = options || {};
    var ttl = Number(options.cacheTtl) || 0;
    var cacheKey = options.cacheKey || action + '|' + JSON.stringify(options.params || {}) + '|' + JSON.stringify(options.payload || {});
    var cached = cache.get(cacheKey);
    if (ttl > 0 && cached && Date.now() - cached.savedAt < ttl) return cached.value;
    var result = await request(action, options);
    if (ttl > 0) cache.set(cacheKey, { savedAt: Date.now(), value: result });
    return result;
  }

  function invalidate(prefix) {
    if (!prefix) { cache.clear(); return; }
    cache.forEach(function (_value, key) { if (key.indexOf(prefix) >= 0) cache.delete(key); });
  }

  function onAuthFailure(handler) { authFailureHandler = typeof handler === 'function' ? handler : null; }

  return Object.freeze({ ApiError: ApiError, call: call, invalidate: invalidate, onAuthFailure: onAuthFailure, uuid: uuid });
});
