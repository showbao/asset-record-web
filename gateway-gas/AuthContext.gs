function base64UrlBytesV840_(value) {
  try { return Utilities.base64DecodeWebSafe(cleanTextV840_(value)); }
  catch (error) { throwGatewayV840_('AUTH_INVALID', 'Google ID Token 的 Base64URL 格式無效'); }
}

function base64UrlJsonV840_(value) {
  try { return JSON.parse(Utilities.newBlob(base64UrlBytesV840_(value)).getDataAsString('UTF-8')); }
  catch (error) { throwGatewayV840_('AUTH_INVALID', 'Google ID Token 的 JSON 格式無效'); }
}

function unsignedByteV840_(value) {
  return value < 0 ? value + 256 : value;
}

function bytesHexV840_(bytes) {
  return (bytes || []).map(function (value) { return ('0' + unsignedByteV840_(value).toString(16)).slice(-2); }).join('');
}

function bigIntFromBytesV840_(bytes) {
  var hex = bytesHexV840_(bytes);
  return BigInt('0x' + (hex || '0'));
}

function modularPowerV840_(base, exponent, modulus) {
  var result = BigInt(1);
  base %= modulus;
  while (exponent > 0) {
    if (exponent & BigInt(1)) result = result * base % modulus;
    exponent >>= BigInt(1);
    base = base * base % modulus;
  }
  return result;
}

function verifyRsaSha256JwkV840_(signingInput, signatureBytes, jwk) {
  if (!jwk || cleanTextV840_(jwk.kty) !== 'RSA' || cleanTextV840_(jwk.alg) !== 'RS256') return false;
  var modulusBytes = base64UrlBytesV840_(jwk.n);
  var modulus = bigIntFromBytesV840_(modulusBytes);
  var exponent = bigIntFromBytesV840_(base64UrlBytesV840_(jwk.e));
  var signature = bigIntFromBytesV840_(signatureBytes);
  if (signature >= modulus) return false;
  var decodedHex = modularPowerV840_(signature, exponent, modulus).toString(16);
  decodedHex = decodedHex.padStart(modulusBytes.length * 2, '0');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signingInput, Utilities.Charset.UTF_8);
  var digestInfo = '3031300d060960864801650304020105000420' + bytesHexV840_(digest);
  var paddingLength = modulusBytes.length * 2 - digestInfo.length - 6;
  if (paddingLength < 16 || paddingLength % 2 !== 0) return false;
  var expectedHex = '0001' + 'ff'.repeat(paddingLength / 2) + '00' + digestInfo;
  if (decodedHex.length !== expectedHex.length) return false;
  var mismatch = 0;
  for (var index = 0; index < decodedHex.length; index++) mismatch |= decodedHex.charCodeAt(index) ^ expectedHex.charCodeAt(index);
  return mismatch === 0;
}

function googleJwksV840_(forceRefresh) {
  var cache = CacheService.getScriptCache();
  var cached = !forceRefresh && cache.get('GOOGLE_OIDC_JWKS_V840');
  if (cached) {
    try { return JSON.parse(cached); } catch (ignore) {}
  }
  var response = UrlFetchApp.fetch(V840_GATEWAY.GOOGLE_JWKS_URL, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throwGatewayV840_('AUTH_KEY_FETCH_FAILED', '暫時無法取得 Google 公開簽章金鑰');
  var jwks;
  try { jwks = JSON.parse(response.getContentText()); } catch (error) { throwGatewayV840_('AUTH_KEY_FETCH_FAILED', 'Google 公開簽章金鑰格式無效'); }
  if (!jwks || !Array.isArray(jwks.keys) || !jwks.keys.length) throwGatewayV840_('AUTH_KEY_FETCH_FAILED', 'Google 公開簽章金鑰為空');
  cache.put('GOOGLE_OIDC_JWKS_V840', JSON.stringify(jwks), 21600);
  return jwks;
}

function configuredGoogleClientIdV840_() {
  var clientId = cleanTextV840_(PropertiesService.getScriptProperties().getProperty('GOOGLE_WEB_CLIENT_ID'));
  if (!clientId) throwGatewayV840_('AUTH_NOT_CONFIGURED', 'Gateway 尚未設定 Google Web Client ID');
  return clientId;
}

function verifyGoogleIdTokenV840_(token, options) {
  options = options || {};
  token = cleanTextV840_(token);
  if (!token || token.length > 8192) throwGatewayV840_('AUTH_REQUIRED', '需要有效的 Google ID Token');
  var parts = token.split('.');
  if (parts.length !== 3) throwGatewayV840_('AUTH_INVALID', 'Google ID Token 結構無效');
  var header = base64UrlJsonV840_(parts[0]);
  var payload = base64UrlJsonV840_(parts[1]);
  if (cleanTextV840_(header.alg) !== 'RS256' || !cleanTextV840_(header.kid)) throwGatewayV840_('AUTH_INVALID', 'Google ID Token 簽章演算法無效');
  var jwks = options.jwks || googleJwksV840_(false);
  var key = jwks.keys.filter(function (candidate) { return cleanTextV840_(candidate.kid) === cleanTextV840_(header.kid); })[0];
  if (!key && !options.jwks) {
    jwks = googleJwksV840_(true);
    key = jwks.keys.filter(function (candidate) { return cleanTextV840_(candidate.kid) === cleanTextV840_(header.kid); })[0];
  }
  if (!key || !verifyRsaSha256JwkV840_(parts[0] + '.' + parts[1], base64UrlBytesV840_(parts[2]), key)) throwGatewayV840_('AUTH_INVALID', 'Google ID Token 簽章驗證失敗');

  var audience = cleanTextV840_(options.clientId || configuredGoogleClientIdV840_());
  var issuers = ['accounts.google.com', 'https://accounts.google.com'];
  var nowSeconds = options.nowSeconds == null ? Math.floor(Date.now() / 1000) : Number(options.nowSeconds);
  if (cleanTextV840_(payload.aud) !== audience) throwGatewayV840_('AUTH_INVALID', 'Google ID Token audience 不符');
  if (issuers.indexOf(cleanTextV840_(payload.iss)) < 0) throwGatewayV840_('AUTH_INVALID', 'Google ID Token issuer 不符');
  if (!isFinite(Number(payload.exp)) || Number(payload.exp) <= nowSeconds - 30) throwGatewayV840_('AUTH_EXPIRED', 'Google 登入已過期，請重新登入');
  if (payload.iat != null && Number(payload.iat) > nowSeconds + 300) throwGatewayV840_('AUTH_INVALID', 'Google ID Token 簽發時間無效');
  if (!cleanTextV840_(payload.sub)) throwGatewayV840_('AUTH_INVALID', 'Google ID Token 缺少 sub');
  if (!cleanTextV840_(payload.email) || !booleanV840_(payload.email_verified, false)) throwGatewayV840_('AUTH_INVALID', 'Google 帳號 Email 尚未驗證');

  var activeEmail = cleanTextV840_(options.activeEmail != null ? options.activeEmail : Session.getActiveUser().getEmail()).toLowerCase();
  if (!activeEmail) throwGatewayV840_('ACTIVE_USER_UNAVAILABLE', '無法確認目前執行 Gateway 的 Google 帳號');
  if (activeEmail !== cleanTextV840_(payload.email).toLowerCase()) throwGatewayV840_('AUTH_ACCOUNT_MISMATCH', 'Google 登入帳號與 Gateway 授權帳號不一致');
  return {
    sub: cleanTextV840_(payload.sub),
    email: cleanTextV840_(payload.email),
    name: cleanTextV840_(payload.name) || null,
    picture: cleanTextV840_(payload.picture) || null,
    activeEmail: activeEmail
  };
}

function authContextV840_(request, options) {
  return verifyGoogleIdTokenV840_(request && request.idToken, options);
}
