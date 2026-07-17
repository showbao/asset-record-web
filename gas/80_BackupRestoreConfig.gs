var V84_BACKUP = Object.freeze({
  VERSION: '8.5.0',
  SCHEMA_VERSION: '8.5.0',
  FOLDER_NAME: '資產記錄備份',
  LOG_SHEET_NAME: '備份紀錄',
  FILE_ROLE_PRIMARY: 'PRIMARY',
  FILE_ROLE_LEGACY_PRIMARY: 'PRODUCTION',
  FILE_ROLE_BACKUP: 'BACKUP',
  BACKUP_STATUS_ARCHIVE: 'ARCHIVE',
  HANDLER_NAME: 'scheduledDailyJob',
  LOCK_TIMEOUT_MS: 1000,
  NOTE_MAX_LENGTH: 200,
  ELEVATED_TOKEN_TTL_MS: 10 * 60 * 1000,
  RESTORE_BATCH_SIZE: 750,
  SOURCE_SHEETS: Object.freeze(['投資交易', '投資標的', '外部出入金', '投資趨勢快照', '趨勢估值明細']),
  REASON_LABELS: Object.freeze({
    MANUAL: '手動備份',
    BEFORE_BULK_EDIT: '大量修改前',
    BEFORE_IMPORT: '匯入資料前',
    BEFORE_SNAPSHOT_REBUILD: '快照重建前',
    BEFORE_UPGRADE: '系統升級前',
    PRE_RESTORE_EMERGENCY: '還原前緊急備份',
    OTHER: '其他'
  }),
  PROPERTIES: Object.freeze({
    BACKUP_FOLDER_ID: 'BACKUP_FOLDER_ID',
    SYSTEM_MODE: 'SYSTEM_MODE',
    CURRENT_OPERATION_ID: 'CURRENT_OPERATION_ID',
    CURRENT_OPERATION_STAGE: 'CURRENT_OPERATION_STAGE',
    CURRENT_OPERATION_STARTED_AT: 'CURRENT_OPERATION_STARTED_AT',
    CURRENT_OPERATION_BACKUP_ID: 'CURRENT_OPERATION_BACKUP_ID',
    CURRENT_OPERATION_ERROR: 'CURRENT_OPERATION_ERROR',
    LAST_BACKUP_REQUEST_ID: 'V84_LAST_BACKUP_REQUEST_ID',
    LAST_BACKUP_RESULT: 'V84_LAST_BACKUP_RESULT',
    ELEVATED_TOKEN_HASH: 'V84_ELEVATED_TOKEN_HASH',
    ELEVATED_TOKEN_EXPIRES_AT: 'V84_ELEVATED_TOKEN_EXPIRES_AT',
    RESTORE_OPERATION: 'V84_RESTORE_OPERATION',
    RESTORE_OPERATION_ID: 'RESTORE_OPERATION_ID'
  }),
  MODES: Object.freeze({
    NORMAL: 'NORMAL',
    BACKUP_RUNNING: 'BACKUP_RUNNING',
    RESTORE_RUNNING: 'RESTORE_RUNNING',
    RESTORE_FAILED: 'RESTORE_FAILED'
  })
});

var V84_BACKUP_LOG_HEADERS = Object.freeze([
  '備份ID', '檔案ID', '檔案名稱', '建立時間', '備份原因', '使用者備註', '系統版本', '結構版本',
  '正式檔ID', '交易筆數', '標的筆數', '出入金筆數', '快照筆數', '最早交易日', '最晚交易日',
  '快照起始日', '快照最後日', '資料指紋', '驗證狀態', '可用狀態', '建立結果', '錯誤摘要'
]);

// 目前正式「系統設定」採英文設定鍵。尚未存在於正式表的設定不列入白名單。
var RESTORABLE_SETTING_KEYS = Object.freeze(['BASE_CURRENCY']);

var V84_BACKUP_ERROR_CODES = Object.freeze([
  'AUTH_REQUIRED', 'REAUTH_REQUIRED', 'SYSTEM_BUSY', 'PRIMARY_FILE_NOT_FOUND', 'NOT_PRIMARY_FILE',
  'BACKUP_FOLDER_ERROR', 'BACKUP_COPY_FAILED', 'BACKUP_VALIDATION_FAILED', 'BACKUP_NOT_FOUND',
  'BACKUP_FILE_MISSING', 'BACKUP_MODIFIED', 'BACKUP_VERSION_UNSUPPORTED',
  'BACKUP_REQUIRED_SHEET_MISSING', 'BACKUP_REQUIRED_HEADER_MISSING', 'EMERGENCY_BACKUP_FAILED',
  'RESTORE_ALREADY_RUNNING', 'RESTORE_SOURCE_WRITE_FAILED', 'PRICE_UPDATE_WARNING', 'FX_UPDATE_WARNING',
  'SNAPSHOT_REBUILD_REQUIRED', 'POST_RESTORE_VALIDATION_FAILED', 'TRIGGER_REPAIR_FAILED', 'ROLLBACK_REQUIRED'
]);

var V84_RESTORE_DEFAULT_OPTIONS = Object.freeze({
  restoreBusinessSettings: true,
  restoreSnapshots: true,
  refreshPrices: true,
  refreshFx: true,
  fillMissingSnapshots: true,
  fullSnapshotRebuild: false,
  confirmLegacy: false
});

var V84_RESTORE_STAGES = Object.freeze({
  PREPARING: 'PREPARING',
  PREPARED: 'PREPARED',
  APPLYING: 'APPLYING',
  SOURCE_RESTORED: 'SOURCE_RESTORED',
  FINALIZING: 'FINALIZING',
  VALIDATING: 'VALIDATING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED'
});

function backupRestoreErrorV84_(code, message, details) {
  var error = new Error(message || code);
  error.apiCode = code;
  error.details = details || {};
  return error;
}

function throwBackupRestoreErrorV84_(code, message, details) {
  throw backupRestoreErrorV84_(code, message, details);
}

function backupRequiredHeadersV84_() {
  var required = {};
  required[V81.SHEETS.TRANSACTIONS] = V81.HEADERS.TRANSACTIONS;
  required[V81.SHEETS.ASSETS] = V81.HEADERS.ASSETS;
  required[V81.SHEETS.CASH_FLOWS] = V81.HEADERS.CASH_FLOWS;
  required[V81.SHEETS.TREND] = V81.HEADERS.TREND;
  required[V81.SHEETS.TREND_DETAIL] = V81.HEADERS.TREND_DETAIL;
  required[V81.SHEETS.SETTINGS] = ['設定項目', '設定值'];
  return required;
}

// 舊版備份允許缺少後續新增的非核心欄位；實際寫回時會依目前正式表頭對應，缺欄留白。
function restoreRequiredHeadersV84_() {
  var required = {};
  required[V81.SHEETS.TRANSACTIONS] = ['交易ID', '日期', '標的代號', '交易類型'];
  required[V81.SHEETS.ASSETS] = ['標的代號', '標的名稱', '標的類型', '交易幣別', '淨值幣別'];
  required[V81.SHEETS.CASH_FLOWS] = ['流水ID', '日期', '類型', '金額', '幣別'];
  required[V81.SHEETS.TREND] = ['取樣日期', '取樣級距', '投資淨資產_TWD'];
  required[V81.SHEETS.TREND_DETAIL] = ['取樣日期', '標的代號', '持有數量', '市值_TWD'];
  required[V81.SHEETS.SETTINGS] = ['設定項目', '設定值'];
  return required;
}

function restoreRequiredSheetNamesV84_() {
  return [V81.SHEETS.TRANSACTIONS, V81.SHEETS.ASSETS, V81.SHEETS.CASH_FLOWS, V81.SHEETS.SETTINGS];
}

function backupReasonLabelV84_(reason) {
  return V84_BACKUP.REASON_LABELS[cleanText_(reason)] || V84_BACKUP.REASON_LABELS.OTHER;
}

function backupFileUrlV84_(fileId) {
  return cleanText_(fileId) ? 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(cleanText_(fileId)) + '/edit' : '';
}
