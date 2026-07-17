# 資產記錄 Web API v8.5.0

## 傳輸格式

資料操作一律使用 `POST` 與 `text/plain;charset=UTF-8`，本文上限 100 KB。除 `auth.status`、`auth.begin`、`auth.login` 外，所有 action 都必須帶有效 Session Token。

```json
{
  "action": "transactions.list",
  "sessionToken": "RAW_SESSION_TOKEN",
  "elevatedToken": "只有高風險操作才傳",
  "requestId": "瀏覽器 UUID",
  "params": {},
  "payload": {}
}
```

回應固定包含 `success`、`code`、`message`、`data`、`version`、`timestamp`、`requestId`、`warnings`、`error`。`GET` 只回傳服務版本與伺服器時間。

## 登入

1. `auth.begin` 以帳號取得 PBKDF2 演算法、Salt、迭代次數與密碼版本；不存在的帳號也回傳同型假參數。
2. 前端以 Web Crypto PBKDF2／SHA-256 派生 256-bit 值，並產生 256-bit Session Token Candidate。
3. `auth.login` 傳送帳號、短暫衍生值、Candidate 與 `rememberMe`。GAS 只保存加上 Pepper 的驗證值與 Session Token HMAC。
4. `auth.getSession` 在頁面恢復時向伺服器驗證；`auth.logout` 撤銷目前 Session。
5. `auth.elevate` 再次驗證原始密碼，簽發 10 分鐘且限 scope 的 Elevated Token。
6. `auth.logoutAll`、`auth.changePassword` 都需要 Elevated Token；成功後所有 Session 失效。

Session 未勾保持登入時最長 12 小時，勾選後最長 7 天；伺服器最多保存 5 個有效 Session。連續五次驗證失敗會鎖定 15 分鐘，後續最高 60 分鐘。

## Actions

| 類別 | Actions |
| --- | --- |
| 公開登入 | `auth.status`, `auth.begin`, `auth.login` |
| Session | `auth.getSession`, `auth.logout`, `auth.elevate`, `auth.logoutAll`, `auth.changePassword` |
| 首頁／系統 | `dashboard.getOverview`, `system.getStatus` |
| 標的 | `instruments.list`, `listAssets`, `getAsset`, `createAsset`, `updateAsset`, `disableAsset` |
| 交易 | `transactions.list`, `transactions.create`, `transactions.update`, `transactions.delete`, `transactions.restore` |
| 外部流水 | `cashflows.list`, `cashflows.create`, `cashflows.update`, `cashflows.delete`, `cashflows.restore` |
| 維護 | `system.requestMarketRefresh`, `snapshots.rebuildAll` |
| 備份 | `backup.getOverview`, `backup.create`, `backup.list`, `backup.preview`, `backup.validate`, `backup.registerLegacy` |
| 還原 | `restore.preview`, `restore.prepare`, `restore.apply`, `restore.finalize`, `restore.status`, `restore.rollback` |

既有 v8.3 action 名稱在遷移期維持相容，但前端只使用上述 v8.5 名稱。`snapshots.rebuildAll`、還原、變更密碼及登出所有裝置都需符合 action scope 的 Elevated Token。

## 分頁與效能

- 交易與資金流水前端固定每頁 50 筆；標的每頁 40 筆。
- 列表回傳 `items`、`page`、`pageSize`、`total`、`totalPages`、`hasNext`、`meta`。
- `dashboard.getOverview` 一次回傳 `summary`、`longTermTrend`、`sixMonthTrend`、`allocation`、`alerts`、`systemStatus`。
- `dashboard.getOverview` 可用 `params.summaryOnly=true` 做寫入後局部刷新。
- 長期與六個月趨勢由 GAS 一次讀取後最多各取樣 180 點。

## 備份與還原

- `backup.create` payload：`reason`, `note`。`reason` 允許 `MANUAL`, `BEFORE_BULK_EDIT`, `BEFORE_IMPORT`, `BEFORE_SNAPSHOT_REBUILD`, `BEFORE_UPGRADE`, `OTHER`。
- `backup.preview`、`backup.validate` params：`backupId`。
- `restore.preview` params：`backupId`。
- `restore.prepare` payload：`backupId`, `options`；Elevated Token 放在 request 頂層。
- `restore.apply`、`restore.finalize`、`restore.rollback` payload：`operationId`；Elevated Token 放在 request 頂層。
- `restore.status` 可選 params：`operationId`。

還原不覆蓋 AUTH Script Properties、Session、GAS 程式、Deployment 或觸發器。完成 `restore.finalize` 後，該 Elevated Token 立即撤銷。

## 安全錯誤碼

常用登入錯誤碼：`AUTH_REQUIRED`, `AUTH_NOT_CONFIGURED`, `AUTH_INVALID_CREDENTIALS`, `AUTH_LOCKED`, `AUTH_SESSION_EXPIRED`, `AUTH_SESSION_REVOKED`, `AUTH_ELEVATION_REQUIRED`, `AUTH_ELEVATION_EXPIRED`, `AUTH_LEGACY_DISABLED`。

其餘業務錯誤沿用穩定碼：`INVALID_JSON`, `INVALID_REQUEST`, `ACTION_NOT_FOUND`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `OVERSELL`, `PAYLOAD_TOO_LARGE`, `SYSTEM_BUSY`, `BACKUP_VALIDATION_FAILED`, `ROLLBACK_REQUIRED`, `INTERNAL_ERROR` 等。
