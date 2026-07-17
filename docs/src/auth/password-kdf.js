(function (root) {
  'use strict';
  var encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;

  function base64Url(bytes) {
    var binary = '';
    new Uint8Array(bytes).forEach(function (value) { binary += String.fromCharCode(value); });
    return root.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decodeBase64Url(value) {
    var normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4) normalized += '=';
    var binary = root.atob(normalized); var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function randomToken(byteLength) {
    var value = new Uint8Array(byteLength || 32);
    root.crypto.getRandomValues(value);
    return base64Url(value);
  }

  async function derive(password, parameters) {
    if (!root.crypto || !root.crypto.subtle || !encoder) throw new Error('此瀏覽器不支援安全密碼驗證');
    var material = await root.crypto.subtle.importKey('raw', encoder.encode(String(password || '')), 'PBKDF2', false, ['deriveBits']);
    var bits = await root.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: decodeBase64Url(parameters.salt), iterations: Number(parameters.iterations) }, material, 256);
    return base64Url(bits);
  }

  root.AssetRecordPasswordKdf = Object.freeze({ derive: derive, randomToken: randomToken, base64Url: base64Url, decodeBase64Url: decodeBase64Url });
})(typeof globalThis !== 'undefined' ? globalThis : this);
