function driveFileMetadataV840_(spreadsheetId) {
  try {
    var file = DriveApp.getFileById(spreadsheetId);
    var activeEmail = cleanTextV840_(Session.getActiveUser().getEmail()).toLowerCase();
    if (!activeEmail) throwGatewayV840_('ACTIVE_USER_UNAVAILABLE', '無法確認目前 Gateway 的 Google 帳號');
    var permission = file.getAccess(activeEmail);
    var editablePermissions = [DriveApp.Permission.OWNER, DriveApp.Permission.EDIT, DriveApp.Permission.ORGANIZER, DriveApp.Permission.FILE_ORGANIZER];
    return {
      id: file.getId(),
      name: file.getName(),
      mimeType: file.getMimeType(),
      trashed: file.isTrashed(),
      capabilities: { canEdit: editablePermissions.indexOf(permission) >= 0 }
    };
  } catch (error) {
    if (error && error.gatewayCode) throw error;
    throwGatewayV840_('SPREADSHEET_ACCESS_DENIED', '目前 Google 帳號無法存取這份試算表');
  }
}

function readSettingsV840_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(V840_GATEWAY.SHEETS.SETTINGS);
  if (!sheet) throwGatewayV840_('NOT_ASSET_RECORD', '找不到「系統設定」分頁');
  var lastRow = Math.max(sheet.getLastRow(), 1);
  var values = sheet.getRange(1, 1, lastRow, Math.min(3, sheet.getMaxColumns())).getValues();
  var settings = {};
  for (var row = 1; row < values.length; row++) {
    var key = cleanTextV840_(values[row][0]);
    if (key && !Object.prototype.hasOwnProperty.call(settings, key)) settings[key] = values[row][1];
  }
  return settings;
}

function writeSettingsV840_(spreadsheet, updates) {
  var sheet = spreadsheet.getSheetByName(V840_GATEWAY.SHEETS.SETTINGS);
  if (!sheet) throwGatewayV840_('NOT_ASSET_RECORD', '找不到「系統設定」分頁');
  var lastRow = Math.max(sheet.getLastRow(), 1);
  var values = sheet.getRange(1, 1, lastRow, 3).getValues();
  if (!values.length || cleanTextV840_(values[0][0]) !== '設定項目') values = [['設定項目', '設定值', '說明']].concat(values.filter(function (row) { return row.some(function (value) { return value !== ''; }); }));
  var indexes = {};
  for (var row = 1; row < values.length; row++) {
    var key = cleanTextV840_(values[row][0]);
    if (key && indexes[key] == null) indexes[key] = row;
  }
  Object.keys(updates || {}).forEach(function (key) {
    if (indexes[key] == null) {
      indexes[key] = values.length;
      values.push([key, updates[key], 'v8.4 Gateway 系統設定']);
    } else values[indexes[key]][1] = updates[key];
  });
  if (sheet.getMaxRows() < values.length) sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
  sheet.getRange(1, 1, values.length, 3).setValues(values);
  return readSettingsV840_(spreadsheet);
}

function recognizedSystemVersionV840_(version) {
  return /^8\.(?:3\.1|4\.0)$/.test(cleanTextV840_(version));
}

function guardSpreadsheetV840_(spreadsheetId, auth, options) {
  options = options || {};
  spreadsheetId = cleanTextV840_(spreadsheetId);
  if (!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId)) throwGatewayV840_('SPREADSHEET_REQUIRED', '請選擇或貼上有效的 Google Sheet');

  var metadata = options.metadata || driveFileMetadataV840_(spreadsheetId);
  if (metadata.trashed) throwGatewayV840_('SPREADSHEET_TRASHED', '這份試算表已在垃圾桶中');
  if (cleanTextV840_(metadata.mimeType) !== 'application/vnd.google-apps.spreadsheet') throwGatewayV840_('NOT_GOOGLE_SHEET', '選取的檔案不是 Google 試算表');
  if (!metadata.capabilities || metadata.capabilities.canEdit !== true) throwGatewayV840_('SPREADSHEET_READ_ONLY', '目前 Google 帳號沒有這份試算表的編輯權限');

  var spreadsheet;
  try { spreadsheet = options.spreadsheet || SpreadsheetApp.openById(spreadsheetId); }
  catch (error) { throwGatewayV840_('SPREADSHEET_ACCESS_DENIED', '目前 Google 帳號無法開啟這份試算表'); }
  var settings = options.settings || readSettingsV840_(spreadsheet);
  if (cleanTextV840_(settings.APP_ID) !== V840_GATEWAY.APP_ID) throwGatewayV840_('NOT_ASSET_RECORD', '這不是資產記錄系統試算表');
  var version = cleanTextV840_(settings.SYSTEM_VERSION || settings.VERSION);
  if (!recognizedSystemVersionV840_(version)) throwGatewayV840_('UNSUPPORTED_VERSION', '無法辨識這份資產記錄的系統版本', { version: version || null });
  if (!options.allowTemplate && cleanTextV840_(settings.FILE_ROLE) !== 'PRODUCTION') {
    throwGatewayV840_('NOT_PRODUCTION_FILE', cleanTextV840_(settings.FILE_ROLE) === 'BACKUP' || booleanV840_(settings.IS_BACKUP, false)
      ? '這是備份檔；請先依還原流程建立新的正式副本'
      : '這份檔案尚未完成首次建置');
  }
  if (!options.allowBackup && booleanV840_(settings.IS_BACKUP, false)) throwGatewayV840_('BACKUP_NOT_ALLOWED', '不得直接連結備份檔');
  if (cleanTextV840_(settings.FILE_ROLE) === 'PRODUCTION' && cleanTextV840_(settings.SPREADSHEET_ID) && cleanTextV840_(settings.SPREADSHEET_ID) !== spreadsheetId) {
    throwGatewayV840_('SPREADSHEET_ID_MISMATCH', '系統設定中的 Spreadsheet ID 與目前檔案不一致');
  }
  return {
    spreadsheet: spreadsheet,
    settings: settings,
    metadata: metadata,
    auth: auth,
    spreadsheetId: spreadsheetId
  };
}

function safeSpreadsheetInfoV840_(context) {
  return {
    spreadsheetId: context.spreadsheetId,
    spreadsheetName: cleanTextV840_(context.metadata.name || context.spreadsheet.getName()),
    appId: cleanTextV840_(context.settings.APP_ID),
    version: cleanTextV840_(context.settings.SYSTEM_VERSION),
    schemaVersion: cleanTextV840_(context.settings.SCHEMA_VERSION),
    setupStatus: cleanTextV840_(context.settings.SETUP_STATUS) || null,
    fileRole: cleanTextV840_(context.settings.FILE_ROLE),
    isBackup: booleanV840_(context.settings.IS_BACKUP, false),
    editable: true
  };
}
