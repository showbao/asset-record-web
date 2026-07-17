(function (root) {
  'use strict';
  var SESSION_KEY = 'assetRecordV85Session';
  var MODE_KEY = 'assetRecordV85Remember';

  function available(storage) {
    try { return Boolean(storage && typeof storage.getItem === 'function'); }
    catch (_error) { return false; }
  }

  function cleanupStorage(storage, allowed) {
    if (!available(storage)) return;
    var remove = [];
    for (var index = 0; index < storage.length; index++) {
      var key = storage.key(index);
      if (key && key.indexOf('assetRecord') === 0 && allowed.indexOf(key) < 0) remove.push(key);
    }
    remove.forEach(function (key) { storage.removeItem(key); });
  }

  function cleanupLegacy() {
    var allowed = [SESSION_KEY, MODE_KEY];
    cleanupStorage(root.sessionStorage, allowed);
    cleanupStorage(root.localStorage, allowed);
  }

  function clear() {
    if (available(root.sessionStorage)) { root.sessionStorage.removeItem(SESSION_KEY); root.sessionStorage.removeItem(MODE_KEY); }
    if (available(root.localStorage)) { root.localStorage.removeItem(SESSION_KEY); root.localStorage.removeItem(MODE_KEY); }
  }

  function save(token, remember) {
    clear();
    var storage = remember ? root.localStorage : root.sessionStorage;
    if (!available(storage)) throw new Error('瀏覽器無法保存登入狀態');
    storage.setItem(SESSION_KEY, String(token || ''));
    storage.setItem(MODE_KEY, remember ? '1' : '0');
  }

  function get() {
    if (available(root.localStorage) && root.localStorage.getItem(SESSION_KEY)) return root.localStorage.getItem(SESSION_KEY) || '';
    if (available(root.sessionStorage)) return root.sessionStorage.getItem(SESSION_KEY) || '';
    return '';
  }

  function rememberMe() {
    return available(root.localStorage) && root.localStorage.getItem(MODE_KEY) === '1';
  }

  cleanupLegacy();
  root.AssetRecordSessionStore = Object.freeze({ save: save, get: get, clear: clear, rememberMe: rememberMe, cleanupLegacy: cleanupLegacy, sessionKey: SESSION_KEY });
})(typeof globalThis !== 'undefined' ? globalThis : this);
