function validateSetupV840_(context) {
  var checks = [];
  function check(name, ok, details) { checks.push({ name: name, ok: Boolean(ok), details: details == null ? null : details }); }
  var settings = readSettingsV840_(context.spreadsheet);
  check('APP_ID 正確', cleanTextV840_(settings.APP_ID) === V840_GATEWAY.APP_ID, settings.APP_ID);
  check('系統版本可辨識', recognizedSystemVersionV840_(settings.SYSTEM_VERSION), settings.SYSTEM_VERSION);
  check('建置狀態 READY', cleanTextV840_(settings.SETUP_STATUS) === 'READY', settings.SETUP_STATUS);
  check('正式檔且非備份', cleanTextV840_(settings.FILE_ROLE) === 'PRODUCTION' && !booleanV840_(settings.IS_BACKUP, false), { fileRole: settings.FILE_ROLE, isBackup: settings.IS_BACKUP });
  check('Spreadsheet ID 相符', cleanTextV840_(settings.SPREADSHEET_ID) === context.spreadsheetId, settings.SPREADSHEET_ID);
  var requiredSheets = Object.keys(V840_GATEWAY.SHEETS).map(function (key) { return V840_GATEWAY.SHEETS[key]; });
  var missingSheets = requiredSheets.filter(function (name) { return !context.spreadsheet.getSheetByName(name); });
  check('必要分頁完整', missingSheets.length === 0, missingSheets);
  [['投資標的', V840_GATEWAY.HEADERS.ASSETS], ['投資交易', V840_GATEWAY.HEADERS.TRANSACTIONS], ['外部出入金', V840_GATEWAY.HEADERS.CASH_FLOWS], ['標的績效', V840_GATEWAY.HEADERS.PERFORMANCE], ['投資趨勢快照', V840_GATEWAY.HEADERS.TREND]].forEach(function (entry) {
    try { tableV840_(context, entry[0], entry[1], null); check(entry[0] + '表頭完整', true); }
    catch (error) { check(entry[0] + '表頭完整', false, error.details || error.message); }
  });
  var performanceSheet = context.spreadsheet.getSheetByName(V840_GATEWAY.SHEETS.PERFORMANCE);
  var performanceHeaders = performanceSheet ? performanceSheet.getRange(1, 1, 1, performanceSheet.getLastColumn()).getValues()[0].map(cleanTextV840_) : [];
  check('單一 XIRR（年化）欄', performanceHeaders.filter(function (header) { return header === 'XIRR（年化）'; }).length === 1 && performanceHeaders.indexOf('XIRR') < 0, performanceHeaders);
  var errors = checks.filter(function (item) { return !item.ok; });
  return { success: errors.length === 0, version: V840_GATEWAY.VERSION, checkCount: checks.length, errorCount: errors.length, checks: checks };
}

function validateGatewayIsolationV840_(auth, context) {
  return {
    authenticatedSubPresent: Boolean(auth && auth.sub),
    authenticatedEmailMatchesActiveUser: Boolean(auth && auth.email && cleanTextV840_(auth.email).toLowerCase() === cleanTextV840_(auth.activeEmail).toLowerCase()),
    spreadsheetOpenedAsActiveUser: true,
    spreadsheetEditableByActiveUser: Boolean(context.metadata && context.metadata.capabilities && context.metadata.capabilities.canEdit === true),
    centralUserDirectoryUsed: false,
    tokenPersisted: false
  };
}
