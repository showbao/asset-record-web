(function (root) {
  'use strict';
  var onSuccess = null;
  function byId(id) { return document.getElementById(id); }
  function setBusy(busy) { var button = byId('loginSubmit'); button.disabled = busy; button.textContent = busy ? '安全登入中…' : '登入'; }
  function show() { byId('appView').hidden = true; byId('loginView').hidden = false; byId('loginPassword').value = ''; byId('loginUsername').focus(); }
  function hide() { byId('loginView').hidden = true; byId('appView').hidden = false; }
  function errorMessage(error) {
    if (error && error.code === 'AUTH_NOT_CONFIGURED') return '尚未設定登入帳密，請至 Google Sheet 的「資產記錄 V8.5.0」選單完成設定。';
    if (error && error.code === 'AUTH_LOCKED') return '帳號或密碼錯誤，請稍後再試。';
    return '帳號或密碼錯誤，請稍後再試。';
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); byId('loginError').textContent = '';
    var passwordInput = byId('loginPassword'); var password = passwordInput.value;
    try {
      await root.AssetRecordAuthApi.login(byId('loginUsername').value, password, byId('rememberMe').checked);
      password = ''; passwordInput.value = ''; hide(); if (onSuccess) await onSuccess();
    } catch (error) { password = ''; passwordInput.value = ''; byId('loginError').textContent = errorMessage(error); }
    finally { setBusy(false); }
  }
  function init(handler) {
    onSuccess = handler;
    byId('loginForm').addEventListener('submit', submit);
    byId('toggleLoginPassword').addEventListener('click', function () { var input = byId('loginPassword'); input.type = input.type === 'password' ? 'text' : 'password'; this.textContent = input.type === 'password' ? '顯示' : '隱藏'; });
  }
  root.AssetRecordLoginPage = Object.freeze({ init: init, show: show, hide: hide });
})(typeof globalThis !== 'undefined' ? globalThis : this);
