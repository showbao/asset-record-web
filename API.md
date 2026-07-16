# 資產記錄 Gateway API v8.4.0

## 傳輸格式

資料操作一律使用 `POST`，Content-Type 為 `text/plain;charset=UTF-8`，本文最大 100 KB。

```json
{
  "action": "listTransactions",
  "idToken": "Google Identity Services ID Token（僅在記憶體）",
  "spreadsheetId": "目前使用者自己的正式 Sheet ID",
  "clientVersion": "8.4.0",
  "requestId": "瀏覽器 UUID",
  "params": {},
  "payload": {}
}
```

回應固定包含 `success`、`version`、`requestId`、`data`、`warnings`、`error`。錯誤碼與訊息位於 `error.code`、`error.message`。日期為 `YYYY-MM-DD`，時間包含時區。

Gateway 驗證 ID Token 的 RSA-SHA256 簽章、`aud`、`iss`、`exp`、`iat`、`sub`、Email 驗證狀態，並要求 Token Email 與 Web App 的 active user 相同。Token 不被持久保存。

績效 API 的數值欄位只回傳有限 `number` 或 `null`，日期欄位只回傳 ISO 字串或 `null`。`Date` 不得轉為時間戳記型績效數值；標的績效僅保留單一 `xirr`，對應 Sheet 的「XIRR（年化）」欄。

`GET` 只回傳版本、服務狀態與伺服器時間，不回傳資產資料。

## Actions

| 類別 | Actions |
| --- | --- |
| 連線／建置 | `verifySpreadsheet`, `getSystemStatus`, `initializeNewSystem`, `validateSetup` |
| 標的 | `listAssets`, `getAsset`, `createAsset`, `updateAsset`, `disableAsset` |
| 交易 | `listTransactions`, `getTransaction`, `createTransaction`, `updateTransaction`, `deleteTransaction`, `restoreTransaction` |
| 外部流水 | `listExternalCashFlows`, `getExternalCashFlow`, `createExternalCashFlow`, `updateExternalCashFlow`, `deleteExternalCashFlow`, `restoreExternalCashFlow` |
| 輸出 | `getDashboardSummary`, `getPerformanceList`, `getTrendData` |
| 工作 | `requestRebuild`, `requestMarketRefresh`, `getJobStatus` |

列表 action 使用 `page`（預設 1）與 `pageSize`（預設 25、上限 100），並回傳 `items`、`page`、`pageSize`、`total`、`totalPages`、`hasNext`、`meta`。

### 寫入 payload

- 標的：`code`, `name`, `type`, `tradeCurrency`, `navCurrency`, `fundId`, `enabled`, `updatePrice`, `priceSource`, `note`, `fundCategory`
- 交易：`date`, `assetCode`, `type`, `bank`, `quantity`, `price`, `fee`, `actualAmount`, `splitBefore`, `splitAfter`, `note`, `manualAmount`
- 外部流水：`date`, `type`, `amount`, `currency`, `fxRate`, `note`

修改、刪除與還原的 ID 放在 `params.code` 或 `params.id`。交易的成本、損益與非人工實際入出金額由 GAS 計算。

## 穩定錯誤碼

`AUTH_REQUIRED`, `AUTH_INVALID`, `AUTH_EXPIRED`, `AUTH_ACCOUNT_MISMATCH`, `ACTIVE_USER_UNAVAILABLE`, `SPREADSHEET_REQUIRED`, `SPREADSHEET_ACCESS_DENIED`, `SPREADSHEET_READ_ONLY`, `NOT_GOOGLE_SHEET`, `NOT_ASSET_RECORD`, `NOT_PRODUCTION_FILE`, `BACKUP_NOT_ALLOWED`, `INVALID_JSON`, `INVALID_REQUEST`, `ACTION_NOT_FOUND`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `OVERSELL`, `LOCK_TIMEOUT`, `PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`。

匯入、備份中心與版本升級 Actions 在 v8.4.0 明確回傳 `FEATURE_NOT_AVAILABLE`，依序於 v8.4.1、v8.4.2、v8.5.0 開放。
