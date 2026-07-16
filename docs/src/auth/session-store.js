(function (root) {
  'use strict';
  var UI_KEY = 'asset-record.ui-session.v840';
  var credential = '';
  var profile = null;

  function decodePayload(token) {
    try {
      var value = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      value += '='.repeat((4 - value.length % 4) % 4);
      return JSON.parse(decodeURIComponent(Array.prototype.map.call(root.atob(value), function (character) { return '%' + ('00' + character.charCodeAt(0).toString(16)).slice(-2); }).join('')));
    } catch (_error) { throw new Error('Google 登入資料格式錯誤'); }
  }

  function accept(idToken) {
    var payload = decodePayload(idToken);
    if (!payload.sub || !payload.email) throw new Error('Google 登入資料缺少必要欄位');
    credential = String(idToken);
    profile = { sub: String(payload.sub), email: String(payload.email), name: payload.name ? String(payload.name) : '', picture: payload.picture ? String(payload.picture) : '', signedInAt: new Date().toISOString() };
    if (root.localStorage) root.localStorage.setItem(UI_KEY, JSON.stringify(profile));
    return getProfile();
  }

  function getProfile() { return profile ? Object.assign({}, profile) : null; }
  function getIdToken() { return credential; }
  function clear() { credential = ''; profile = null; if (root.localStorage) root.localStorage.removeItem(UI_KEY); }
  function previousProfile() { try { return JSON.parse(root.localStorage && root.localStorage.getItem(UI_KEY)) || null; } catch (_error) { return null; } }

  root.AssetRecordSession = Object.freeze({ accept: accept, getProfile: getProfile, getIdToken: getIdToken, clear: clear, previousProfile: previousProfile, uiKey: UI_KEY });
})(window);
