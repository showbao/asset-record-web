# 部署與回復

## GitHub Pages

1. 建立公開儲存庫 `asset-record-web`，預設分支 `main`。
2. 將本目錄內容推送到 `main`。
3. 在 `docs/config.js` 填入正式 Apps Script Web App `/exec` URL；不得填入金鑰。
4. Repository Settings → Pages → Deploy from a branch，選擇 `main` 與 `/docs`。
5. 從實際 Pages 網域輸入一次性金鑰，驗證 POST 經 `script.googleusercontent.com` 重新導向後仍可讀取。

正式切換前需在桌面與手機寬度驗證全部必要操作，以及未授權、錯誤金鑰、超賣、軟刪除／還原與待重算警告。

## 金鑰輪替

從 Sheet 選單執行「輪替 Web API 金鑰」。新金鑰只顯示一次；舊金鑰立即失效。關閉所有已登入 Pages 分頁後，用新金鑰重新登入。不要將金鑰貼進 issue、commit、日誌或部署紀錄。

## 回復

- 驗收前：停用 Pages、刪除 Web App deployment、輪替金鑰，還原 v8.2 程式與部署前 Sheet 副本。
- 已有新交易：只回復程式與 Web deployment，保留正式原始表資料；必要時從備份單獨還原「持倉明細」。
- 回復後執行 `installV82()`、`validatePhase1()` 與 `validatePhase2()`，確認仍只有一個 `scheduledDailyJob`。
