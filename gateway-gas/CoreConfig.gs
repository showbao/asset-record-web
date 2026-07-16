var V840_GATEWAY = Object.freeze({
  VERSION: '8.4.0',
  SCHEMA_VERSION: '8.4.0',
  APP_ID: 'ASSET_RECORD',
  TIMEZONE: 'Asia/Taipei',
  MAX_PAYLOAD_BYTES: 102400,
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
  LOCK_TIMEOUT_MS: 30000,
  EPSILON: 1e-8,
  GOOGLE_JWKS_URL: 'https://www.googleapis.com/oauth2/v3/certs',
  SHEETS: Object.freeze({
    DASHBOARD: '投資總覽',
    PERFORMANCE: '標的績效',
    TRANSACTIONS: '投資交易',
    ASSETS: '投資標的',
    CASH_FLOWS: '外部出入金',
    SETTINGS: '系統設定',
    TREND: '投資趨勢快照'
  }),
  HEADERS: Object.freeze({
    ASSETS: ['標的代號', '標的名稱', '標的類型', '交易幣別', '淨值幣別', '基金ID', '是否啟用', '是否更新淨值', '價格來源', '建立時間', '更新時間', '備註', '基金屬性'],
    TRANSACTIONS: ['交易ID', '日期', '標的代號', '標的名稱', '標的類型', '交易幣別', '淨值幣別', '交易類型', '交易銀行', '數量', '單價', '手續費', '實際入出金額', '分割前股數', '分割後股數', '備註', '建立時間', '更新時間', '刪除時間', '資料來源', '匯入批次ID', '原始入出帳戶', '帳戶ID', '帳戶名稱', '人工金額標誌'],
    CASH_FLOWS: ['流水ID', '日期', '類型', '金額', '幣別', '換算匯率', '金額_TWD', '備註', '建立時間', '更新時間', '刪除時間'],
    PERFORMANCE: ['類別', '標的代號', '標的名稱', '狀態', '持有數量', '目前市值_TWD', '剩餘成本_TWD', '歷史售出成本_TWD', '歷史售出收入_TWD', '已實現損益_TWD', '未實現損益_TWD', '累積股息_TWD', '累積總損益_TWD', '累積交易報酬率', '目前資產占比', '損益貢獻度', '首次交易日', '最後交易日', '更新時間', '平均成本', '目前價格', '價格日期', '資產占比', '整體投資報酬率', 'XIRR（年化）'],
    TREND: ['取樣日期', '取樣級距', '台股市值_TWD', '美股市值_TWD', '基金市值_TWD', '投資部位市值_TWD', '投資池現金_TWD', '投資淨資產_TWD', '累積外部淨投入_TWD', '累積投資成果_TWD', '估算標的數', '是否含估算', '更新時間', '最近六個月日期', '最近六個月淨資產', '最近六個月外部淨投入', '資料狀態', '缺漏標的數', '錯誤訊息']
  }),
  ASSET_TYPES: Object.freeze(['tw_stock', 'us_stock', 'fund']),
  TRANSACTION_TYPES: Object.freeze(['buy', 'sell', 'dividend', 'stock_dividend', 'split', 'reverse_split', 'adjustment']),
  CASH_FLOW_TYPES: Object.freeze(['入金', '出金']),
  CURRENCIES: Object.freeze(['TWD', 'USD', 'JPY'])
});

function cleanTextV840_(value) {
  return value == null ? '' : String(value).trim();
}

function booleanV840_(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value == null || value === '') return Boolean(fallback);
  var text = cleanTextV840_(value).toUpperCase();
  if (['TRUE', '1', 'YES', 'Y'].indexOf(text) >= 0) return true;
  if (['FALSE', '0', 'NO', 'N'].indexOf(text) >= 0) return false;
  return Boolean(fallback);
}

function inputNumberV840_(value, fallback) {
  if (value == null || value === '') return fallback;
  if (value instanceof Date || (typeof value === 'object' && value !== null)) return fallback;
  var number = typeof value === 'number' ? value : Number(cleanTextV840_(value).replace(/,/g, ''));
  return isFinite(number) ? number : fallback;
}

function numberOrNullV840_(value) {
  if (value instanceof Date || (typeof value === 'object' && value !== null)) return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  var text = value.trim();
  if (!text || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  var number = Number(text);
  return isFinite(number) ? number : null;
}

function dateValueV840_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return new Date(value.getTime());
  if (typeof value === 'number' && isFinite(value)) return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  if (value == null || value === '') return null;
  var text = cleanTextV840_(value).replace(/\//g, '-');
  var date = new Date(text.length === 10 ? text + 'T00:00:00+08:00' : text);
  return isNaN(date.getTime()) ? null : date;
}

function isoDateV840_(value) {
  var date = dateValueV840_(value);
  return date ? Utilities.formatDate(date, V840_GATEWAY.TIMEZONE, 'yyyy-MM-dd') : null;
}

function isoDateTimeV840_(value) {
  var date = dateValueV840_(value);
  return date ? Utilities.formatDate(date, V840_GATEWAY.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX") : null;
}

function nowV840_() {
  return Utilities.formatDate(new Date(), V840_GATEWAY.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function roundV840_(value, digits) {
  if (!isFinite(value)) return null;
  var scale = Math.pow(10, digits == null ? 8 : digits);
  return Math.round((value + Number.EPSILON) * scale) / scale;
}
