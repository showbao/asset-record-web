(function (root) {
  'use strict';
  function api() { return root.AssetRecordApi; }
  function kdf() { return root.AssetRecordPasswordKdf; }
  function store() { return root.AssetRecordSessionStore; }

  async function status() { return api().call('auth.status', { sessionToken: '', dedupeKey: 'auth-status' }); }
  async function begin(username) { return api().call('auth.begin', { sessionToken: '', payload: { username: String(username || '').trim() }, dedupeKey: 'auth-begin' }); }

  async function login(username, password, rememberMe) {
    var beginResult = await begin(username);
    var secret = String(password || '');
    var derivedKey = await kdf().derive(secret, beginResult.data);
    secret = '';
    var candidate = kdf().randomToken(32);
    try {
      var result = await api().call('auth.login', { sessionToken: '', payload: { username: String(username || '').trim(), derivedKey: derivedKey, sessionTokenCandidate: candidate, rememberMe: Boolean(rememberMe) }, dedupeKey: 'auth-login' });
      derivedKey = '';
      store().save(candidate, Boolean(rememberMe));
      candidate = '';
      return result;
    } catch (error) { derivedKey = ''; candidate = ''; throw error; }
  }

  async function getSession() { return api().call('auth.getSession', { dedupeKey: 'auth-session' }); }
  async function logout() {
    try { if (store().get()) await api().call('auth.logout', { dedupeKey: 'auth-logout' }); }
    finally { store().clear(); api().invalidate(); }
  }

  async function elevate(username, password, scope) {
    var beginResult = await begin(username);
    var secret = String(password || '');
    var derivedKey = await kdf().derive(secret, beginResult.data);
    secret = '';
    var candidate = kdf().randomToken(32);
    try {
      var result = await api().call('auth.elevate', { payload: { username: String(username || '').trim(), derivedKey: derivedKey, elevatedTokenCandidate: candidate, scope: scope }, dedupeKey: 'auth-elevate:' + scope });
      derivedKey = '';
      result.data.elevatedToken = candidate;
      return result;
    } catch (error) { derivedKey = ''; candidate = ''; throw error; }
  }

  async function logoutAll(elevatedToken) {
    try { return await api().call('auth.logoutAll', { elevatedToken: elevatedToken, dedupeKey: 'auth-logout-all' }); }
    finally { store().clear(); api().invalidate(); }
  }

  async function changePassword(elevatedToken, username, newPassword) {
    var parameters = await begin(username);
    var salt = kdf().randomToken(24);
    var secret = String(newPassword || '');
    var derivedKey = await kdf().derive(secret, { salt: salt, iterations: parameters.data.iterations });
    secret = '';
    try {
      var result = await api().call('auth.changePassword', {
        elevatedToken: elevatedToken,
        payload: { username: String(username || '').trim(), salt: salt, algorithm: parameters.data.algorithm, iterations: parameters.data.iterations, derivedKey: derivedKey },
        dedupeKey: 'auth-change-password'
      });
      derivedKey = ''; salt = ''; store().clear(); api().invalidate(); return result;
    } catch (error) { derivedKey = ''; salt = ''; throw error; }
  }

  root.AssetRecordAuthApi = Object.freeze({ status: status, begin: begin, login: login, getSession: getSession, logout: logout, elevate: elevate, logoutAll: logoutAll, changePassword: changePassword });
})(typeof globalThis !== 'undefined' ? globalThis : this);
