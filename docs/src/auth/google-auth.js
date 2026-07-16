(function (root) {
  'use strict';
  var listeners = [];
  var initialized = false;

  function config() { return root.ASSET_RECORD_CONFIG || {}; }
  function notify(profile) { listeners.slice().forEach(function (listener) { listener(profile); }); }
  function handleCredential(response) {
    try { notify(root.AssetRecordSession.accept(response && response.credential)); }
    catch (error) { notify({ error: error }); }
  }
  function initialize() {
    if (initialized) return;
    if (!config().googleClientId) throw new Error('尚未設定 Google Web Client ID');
    if (!root.google || !root.google.accounts || !root.google.accounts.id) throw new Error('Google Identity Services 尚未載入');
    root.google.accounts.id.initialize({ client_id: config().googleClientId, callback: handleCredential, auto_select: true, cancel_on_tap_outside: false, context: 'signin', itp_support: true, use_fedcm_for_prompt: true });
    var button = document.getElementById('googleSignInButton');
    if (button) root.google.accounts.id.renderButton(button, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 280, locale: 'zh_TW' });
    root.google.accounts.id.prompt();
    initialized = true;
  }
  function onSignedIn(listener) { listeners.push(listener); return function () { listeners = listeners.filter(function (item) { return item !== listener; }); }; }
  function logout() { if (root.google && root.google.accounts && root.google.accounts.id) root.google.accounts.id.disableAutoSelect(); root.AssetRecordSession.clear(); initialized = false; }
  root.AssetRecordGoogleAuth = Object.freeze({ initialize: initialize, onSignedIn: onSignedIn, logout: logout });
})(window);
