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
