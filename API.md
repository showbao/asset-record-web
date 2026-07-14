# 資產記錄 Web API v8.3

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

回應固定包含 `success`、`code`、`message`、`data`、`version`、`timestamp`、`requestId`。業務成功或失敗依 `success` 與 `code` 判斷，不依 HTTP 狀態碼判斷。日期為 `YYYY-MM-DD`，時間包含 `+08:00`。

`GET` 只回傳版本、服務狀態與伺服器時間，不回傳資產資料。

## Actions

| 類別 | Actions |
| --- | --- |
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

`AUTH_REQUIRED`, `AUTH_INVALID`, `INVALID_JSON`, `INVALID_REQUEST`, `ACTION_NOT_FOUND`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `OVERSELL`, `LOCK_TIMEOUT`, `PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`。

重複排隊回傳成功碼 `ALREADY_PENDING`；重複停用、刪除或還原回傳冪等成功碼，不改寫時間。
