function gatewayResponseV840_(success, code, message, data, requestId, warnings) {
  return {
    success: Boolean(success),
    version: V840_GATEWAY.VERSION,
    requestId: cleanTextV840_(requestId),
    data: data == null ? {} : data,
    warnings: warnings || [],
    error: success ? null : { code: cleanTextV840_(code || 'ERROR'), message: cleanTextV840_(message || '操作失敗') }
  };
}

function gatewayExceptionV840_(code, message, details) {
  var error = new Error(message || code);
  error.gatewayCode = code;
  error.details = details || {};
  return error;
}

function throwGatewayV840_(code, message, details) {
  throw gatewayExceptionV840_(code, message, details);
}

function jsonOutputV840_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function isAllowedCallbackOriginV840_(origin) {
  return V840_GATEWAY.ALLOWED_CALLBACK_ORIGINS.indexOf(cleanTextV840_(origin)) >= 0;
}

function isAllowedCallbackUrlV840_(url) {
  return V840_GATEWAY.ALLOWED_CALLBACK_URLS.indexOf(cleanTextV840_(url)) >= 0;
}

function isValidBridgeIdV840_(bridgeId) {
  return /^[A-Za-z0-9._:-]{1,128}$/.test(cleanTextV840_(bridgeId));
}

function safeJsLiteralV840_(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function bridgeClientOutputV840_(callbackOrigin, callbackUrl, bridgeSessionId) {
  callbackOrigin = cleanTextV840_(callbackOrigin);
  callbackUrl = cleanTextV840_(callbackUrl);
  bridgeSessionId = cleanTextV840_(bridgeSessionId);
  if (!isAllowedCallbackOriginV840_(callbackOrigin)) {
    throwGatewayV840_('CALLBACK_ORIGIN_NOT_ALLOWED', '不允許的前端回傳來源');
  }
  if (!isValidBridgeIdV840_(bridgeSessionId)) {
    throwGatewayV840_('INVALID_BRIDGE_ID', 'bridgeSessionId 格式錯誤');
  }
  if (!isAllowedCallbackUrlV840_(callbackUrl) || callbackUrl.indexOf(callbackOrigin + '/') !== 0) {
    throwGatewayV840_('CALLBACK_URL_NOT_ALLOWED', '不允許的前端 relay 網址');
  }
  var safeOrigin = safeJsLiteralV840_(callbackOrigin);
  var safeSessionId = safeJsLiteralV840_(bridgeSessionId);
  var failure = safeJsLiteralV840_(gatewayResponseV840_(false, 'INTERNAL_ERROR', 'Gateway 執行失敗', {}, '', []));
  var html = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Asset Record Gateway</title>' +
    '<style>body{margin:0;background:#f6f1e7;color:#123c2c;font-family:system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}' +
    'main{max-width:30rem;margin:1.5rem;padding:2rem;border:1px solid #c7d2c9;border-radius:1.25rem;background:#fffdf8;box-shadow:0 1rem 3rem #123c2c1a}' +
    'h1{font-family:Georgia,serif;margin:0 0 .75rem}p{line-height:1.7;margin:.4rem 0}</style></head><body>' +
    '<main><h1>私人 Sheet 存取已啟用</h1><p>請保持此視窗開啟，並回到資產記錄頁面繼續。</p><p>此視窗只負責把請求交給你本人執行的 Google Apps Script。</p><p id="bridgeStatus">正在建立安全通道…</p></main>' +
    '<script>"use strict";(function(){var channelName="asset-record-gateway-v840";var callbackOrigin=' + safeOrigin + ';var sessionId=' + safeSessionId + ';var messageChannel=new MessageChannel();var port=messageChannel.port1;' +
    'function send(value){port.postMessage(value);}' +
    'port.addEventListener("message",function(event){var message=event.data;' +
    'if(!message||message.channel!==channelName||message.sessionId!==sessionId||message.type!=="request"||!/^[A-Za-z0-9._:-]{1,128}$/.test(message.bridgeId||""))return;' +
    'google.script.run.withSuccessHandler(function(result){send({channel:channelName,type:"response",sessionId:sessionId,bridgeId:message.bridgeId,result:result});})' +
    '.withFailureHandler(function(){send({channel:channelName,type:"response",sessionId:sessionId,bridgeId:message.bridgeId,result:' + failure + '});})' +
    '.gatewayBridgeCallV840(JSON.stringify(message.request));});port.start();' +
    'window.top.postMessage({channel:channelName,type:"gateway-port",sessionId:sessionId},callbackOrigin,[messageChannel.port2]);' +
    'document.getElementById("bridgeStatus").textContent="安全通道已就緒";})();<\/script></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function allowedKeysV840_(object, allowed, label) {
  Object.keys(object || {}).forEach(function (key) {
    if (allowed.indexOf(key) < 0) throwGatewayV840_('INVALID_REQUEST', (label || '物件') + ' 不支援欄位：' + key);
  });
  return object || {};
}

function paginateV840_(items, params) {
  params = params || {};
  var page = Math.max(1, Math.floor(inputNumberV840_(params.page, 1)));
  var pageSize = Math.max(1, Math.min(V840_GATEWAY.MAX_PAGE_SIZE, Math.floor(inputNumberV840_(params.pageSize, V840_GATEWAY.DEFAULT_PAGE_SIZE))));
  var total = items.length;
  var totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) page = totalPages;
  var start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: page, pageSize: pageSize, total: total, totalPages: totalPages, hasNext: page < totalPages };
}
