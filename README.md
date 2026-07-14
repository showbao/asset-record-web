# asset-record-web

「資產記錄」v8.3 的繁體中文靜態操作介面。正式發布來源為 `main/docs`，不需要建置工具或 GitHub Actions。

此公開儲存庫只包含 HTML、CSS、JavaScript 與文件；Apps Script、試算表資料及 API 金鑰不得加入版本控制。

## 本機預覽

將 `docs/config.js` 的 `apiUrl` 設為 staging Web App `/exec` URL，接著用任一靜態 HTTP server 開啟 `docs`。不要直接用 `file://` 測試跨網域行為。

```powershell
npx.cmd serve docs
```

介面支援總覽、趨勢、標的績效、標的 CRUD、交易 CRUD／軟刪除／還原、外部出入金 CRUD／軟刪除／還原，以及每日工作排隊狀態。

## 安全邊界

- API URL 可公開；API 金鑰只由使用者輸入並保存於 `sessionStorage`。
- 所有資料使用 `textContent` 或安全 DOM API 顯示，不把 Sheet 內容注入 `innerHTML`。
- 前端不計算成本、損益、XIRR、實際入出金額或匯率。
- 刪除、還原、停用與維護要求都需要確認。
- 正式環境只能連線到 Apps Script `/exec` deployment。

API 規格見 [API.md](API.md)，部署與回復程序見 [DEPLOYMENT.md](DEPLOYMENT.md)。
