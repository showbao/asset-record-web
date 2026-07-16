# asset-record-web

「資產記錄」v8.4.0 的私人多使用者架構。正式發布來源為 `main/docs`，不需要前端建置工具。

正式網站：https://showbao.github.io/asset-record-web/

Repository 同時保存 GitHub Pages、共用 Gateway GAS 與空白範本的綁定式 User GAS；不保存任何人的試算表資料、Google Token 或中央使用者清單。

## 本機預覽

將 `docs/config.js` 的 `gatewayUrl`、`googleClientId` 與 `templateCopyUrl` 設為開發環境值，再用任一靜態 HTTP server 開啟 `docs`。不要直接用 `file://` 測試跨網域行為。

```powershell
npx.cmd serve docs
```

介面支援總覽、趨勢、標的績效、標的 CRUD、交易 CRUD／軟刪除／還原、外部出入金 CRUD／軟刪除／還原，以及每日工作排隊狀態。

## 目錄

- `docs/`：Google Identity Services 登入、私人 Sheet 連線與日常操作介面。
- `gateway-gas/`：以「存取網頁應用程式的使用者」執行的共用 Gateway。
- `user-gas/`：隨空白範本複製的綁定式 GAS 與固定維護入口。
- `tests/`：身分、連線、隔離與回歸測試。

## 安全邊界

- 完全不使用 API key 或會員代碼；Gateway 驗證 Google ID Token 的簽章與標準 claims。
- ID Token 只保存在目前頁面的記憶體，不寫入 localStorage、sessionStorage、Sheet、日誌或 Script Properties。
- 每個 Google `sub` 的 Spreadsheet ID 只保存在該瀏覽器的 `asset-record.connection.<sub>`。
- Gateway 每次用目前 Google 帳號開啟指定私人 Sheet，並確認 Drive `canEdit`；不使用管理者權限繞過。
- 所有資料使用 `textContent` 或安全 DOM API 顯示，不把 Sheet 內容注入 `innerHTML`。
- 前端不計算成本、損益、XIRR、實際入出金額或匯率。
- 刪除、還原、停用與維護要求都需要確認。
- 正式環境只能連線到 Apps Script `/exec` deployment。

API 規格見 [API.md](API.md)，部署與回復程序見 [DEPLOYMENT.md](DEPLOYMENT.md)。
