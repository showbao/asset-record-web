# 資產記錄 Web API v8.4.0

## 傳輸格式

資料操作一律使用 `POST`，Content-Type 為 `text/plain;charset=UTF-8`，本文最大 100 KB。

```json
{
  "action": "listTransactions",
  "apiKey": "由 Sheet 選單一次性取得",
  "requestId": "瀏覽器 UUID",
  "params": {},
  "payload": {}
}
```

回應固定包含 `success`、`code`、`message`、`data`、`version`、`timestamp`、`requestId`、`warnings`、`error`。業務成功或失敗依 `success` 與 `code` 判斷，不依 HTTP 狀態碼判斷。成功時 `error` 為 `null`；失敗時包含穩定錯誤碼與安全訊息。日期為 `YYYY-MM-DD`，時間包含 `+08:00`。

績效 API 的數值欄位只回傳有限 `number` 或 `null`，日期欄位只回傳 ISO 字串或 `null`。`Date` 不得轉為時間戳記型績效數值；標的績效僅保留單一 `xirr`，對應 Sheet 的「XIRR（年化）」欄。

`GET` 只回傳版本、服務狀態與伺服器時間，不回傳資產資料。

## Actions

| 類別 | Actions |
| --- | --- |
| 標的 | `listAssets`, `getAsset`, `createAsset`, `updateAsset`, `disableAsset` |
| 交易 | `listTransactions`, `getTransaction`, `createTransaction`, `updateTransaction`, `deleteTransaction`, `restoreTransaction` |
| 外部流水 | `listExternalCashFlows`, `getExternalCashFlow`, `createExternalCashFlow`, `updateExternalCashFlow`, `deleteExternalCashFlow`, `restoreExternalCashFlow` |
| 輸出 | `getDashboardSummary`, `getPerformanceList`, `getTrendData` |
| 工作 | `requestRebuild`, `requestMarketRefresh`, `getJobStatus` |
| 備份 | `backup.getOverview`, `backup.create`, `backup.list`, `backup.preview`, `backup.validate`, `backup.registerLegacy` |
| 還原 | `restore.elevate`, `restore.preview`, `restore.prepare`, `restore.apply`, `restore.finalize`, `restore.status`, `restore.rollback` |

### 備份 payload／params

- `backup.create` payload：`reason`, `note`。`note` 最多 200 字。
- `reason`：`MANUAL`, `BEFORE_BULK_EDIT`, `BEFORE_IMPORT`, `BEFORE_SNAPSHOT_REBUILD`, `BEFORE_UPGRADE`, `OTHER`。
- `backup.list` params：`includeInvalid`，預設 `false`。
- `backup.preview`、`backup.validate` params：`backupId`。
- `backup.registerLegacy` payload：`url`，接受 Google Sheet 網址；舊檔只登記為 `LEGACY_UNVERIFIED`，不會自動升級成 `VERIFIED`。

### 還原 payload／params

- `restore.elevate` payload：`credential`，必須是目前有效 API 金鑰；成功回傳 10 分鐘有效的 `elevatedToken`。錯誤只回傳 `REAUTH_REQUIRED`，不洩露原因。
- `restore.preview` params：`backupId`，回傳目前與備份的交易、標的、外部流水、快照及最後日期比較。
- `restore.prepare` payload：`backupId`, `elevatedToken`, `options`；驗證來源、鎖定系統並建立已驗證緊急備份。
- `restore.apply` payload：`operationId`；依欄名分批寫回來源資料、白名單設定並清除衍生輸出。
- `restore.finalize` payload：`operationId`；更新行情與匯率、重算、處理快照、稽核觸發器及完整驗證。
- `restore.status` 可選 params：`operationId`；回傳系統模式、目前階段、是否可續跑及是否必須回復。
- `restore.rollback` payload：`operationId`, `elevatedToken`；將同一工作切換到緊急備份，之後仍依序呼叫 Apply 與 Finalize。

`options` 支援 `restoreBusinessSettings`, `restoreSnapshots`, `refreshPrices`, `refreshFx`, `fillMissingSnapshots`, `fullSnapshotRebuild`, `confirmLegacy`。除 `fullSnapshotRebuild` 與 `confirmLegacy` 外預設皆為 `true`。來源交易、標的、外部流水與衍生重算為固定流程，不能略過。

還原狀態為 `SUCCESS`, `SUCCESS_WITH_WARNINGS`, `FAILED`, `ROLLBACK_REQUIRED`。在 `RESTORE_RUNNING` 或 `RESTORE_FAILED` 時，來源寫入與一般維護 action 會回傳 `SYSTEM_BUSY`；`restore.status`、續跑及回復仍可使用。

列表 action 使用 `page`（預設 1）與 `pageSize`（預設 25、上限 100），並回傳 `items`、`page`、`pageSize`、`total`、`totalPages`、`hasNext`、`meta`。

### 寫入 payload

- 標的：`code`, `name`, `type`, `tradeCurrency`, `navCurrency`, `fundId`, `enabled`, `updatePrice`, `priceSource`, `note`, `fundCategory`
- 交易：`date`, `assetCode`, `type`, `bank`, `quantity`, `price`, `fee`, `actualAmount`, `splitBefore`, `splitAfter`, `note`, `manualAmount`
- 外部流水：`date`, `type`, `amount`, `currency`, `fxRate`, `note`

修改、刪除與還原的 ID 放在 `params.code` 或 `params.id`。交易的成本、損益與非人工實際入出金額由 GAS 計算。

## 穩定錯誤碼

`AUTH_REQUIRED`, `AUTH_INVALID`, `REAUTH_REQUIRED`, `INVALID_JSON`, `INVALID_REQUEST`, `ACTION_NOT_FOUND`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `OVERSELL`, `LOCK_TIMEOUT`, `PAYLOAD_TOO_LARGE`, `SYSTEM_BUSY`, `PRIMARY_FILE_NOT_FOUND`, `NOT_PRIMARY_FILE`, `BACKUP_FOLDER_ERROR`, `BACKUP_COPY_FAILED`, `BACKUP_VALIDATION_FAILED`, `BACKUP_NOT_FOUND`, `BACKUP_FILE_MISSING`, `BACKUP_MODIFIED`, `BACKUP_VERSION_UNSUPPORTED`, `BACKUP_REQUIRED_SHEET_MISSING`, `BACKUP_REQUIRED_HEADER_MISSING`, `EMERGENCY_BACKUP_FAILED`, `RESTORE_ALREADY_RUNNING`, `POST_RESTORE_VALIDATION_FAILED`, `TRIGGER_REPAIR_FAILED`, `ROLLBACK_REQUIRED`, `INTERNAL_ERROR`。

重複排隊回傳成功碼 `ALREADY_PENDING`；重複停用、刪除或還原回傳冪等成功碼，不改寫時間。
