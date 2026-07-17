# asset-record-web

「資產記錄」v8.5.0 單人版。正式網站由 `main/docs` 發布，資料與運算留在既有 Google Sheet／Apps Script；不使用 Google 登入、Firebase、外部身分服務或前端框架。

正式網站：https://showbao.github.io/asset-record-web/

## 目錄

- `docs/`：GitHub Pages 靜態前端。
- `gas/`：正式 Sheet 綁定式 Apps Script 原始碼。
- `tests/`：v8.1～v8.5 的安全、API、計算、備份與還原回歸測試。

試算表資料、密碼、衍生值、Session Token、Pepper、舊 API 金鑰、OAuth 憑證與 `.clasp.json` 不得加入版本控制。

## v8.5 重點

- 單一帳號密碼登入；瀏覽器以 PBKDF2-HMAC-SHA256（600,000 次）派生，GAS 再以 Pepper HMAC 驗證。
- 一般 Session 最長 12 小時；私人裝置可選 7 天；伺服器最多保留 5 個有效 Session。
- 五次錯誤後鎖定 15 分鐘，後續可升至 30／60 分鐘。
- 還原、完整歷史重建、變更密碼與登出所有裝置均需 10 分鐘、限 scope 的 Elevated Token。
- 五項主導航、六張首頁卡、兩張趨勢圖、資產配置、最多三條提醒；首頁只呼叫 `dashboard.getOverview`。
- 交易每頁 50 筆，新增／修改使用右側抽屜，寫入後局部刷新。
- 保留 v8.4 備份、差異預覽、中斷續跑、緊急備份與回復流程。

## 測試

```powershell
Get-ChildItem tests -Filter '*.test.js' | Sort-Object Name | ForEach-Object {
  node $_.FullName
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

## 本機預覽

`docs/config.js` 只保存公開的 Apps Script `/exec` URL。以靜態 HTTP server 開啟 `docs`，不要用 `file://` 測試跨網域行為。

```powershell
npx.cmd serve docs
```

前端只負責互動與安全登入；成本、損益、XIRR、匯率、備份與還原均由 GAS 處理。Sheet 內容一律以 `textContent` 或安全 DOM API 顯示，不注入 `innerHTML`。

API 規格見 [API.md](API.md)，分階段部署與回復程序見 [DEPLOYMENT.md](DEPLOYMENT.md)。
