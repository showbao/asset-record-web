(function (root) {
  'use strict';
  async function restore(onAuthenticated) {
    root.AssetRecordApi.onAuthFailure(function () { root.AssetRecordSessionStore.clear(); root.AssetRecordLoginPage.show(); });
    if (!root.AssetRecordSessionStore.get()) { root.AssetRecordLoginPage.show(); return false; }
    try { var result = await root.AssetRecordAuthApi.getSession(); root.AssetRecordLoginPage.hide(); await onAuthenticated(result.data || {}); return true; }
    catch (_error) { root.AssetRecordSessionStore.clear(); root.AssetRecordLoginPage.show(); return false; }
  }
  root.AssetRecordAuthGuard = Object.freeze({ restore: restore });
})(typeof globalThis !== 'undefined' ? globalThis : this);
