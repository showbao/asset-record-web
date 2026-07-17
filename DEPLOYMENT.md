# 部署與回復

正式 Pages：`https://showbao.github.io/asset-record-web/`

正式 Apps Script Web App：`https://script.google.com/macros/s/AKfycbwFgZfrzNI-dGwoDuaGBGlVh5QVAsviPbC_TPkhZfejiPFaSEAbBVpNrcdHLOnS7bIa/exec`

## GitHub Pages

1. 建立公開儲存庫 `asset-record-web`，預設分支 `main`。
2. 將本目錄內容推送到 `main`。
3. 在 `docs/config.js` 填入正式 Apps Script Web App `/exec` URL；不得填入金鑰。
4. Repository Settings → Pages → Deploy from a branch，選擇 `main` 與 `/docs`。
5. 從實際 Pages 網域輸入一次性金鑰，驗證 POST 經 `script.googleusercontent.com` 重新導向後仍可讀取。

2026-07-15 已確認錯誤金鑰可由正式 Pages 網域穩定讀取為 `AUTH_INVALID`，不是 CORS 或網路錯誤。

正式切換前需在桌面與手機寬度驗證全部必要操作，以及未授權、錯誤金鑰、超賣、軟刪除／還原與待重算警告。

## v8.4.0 GAS 與備份／還原更新

1. 將 v8.4.0 GAS 檔案更新到目前正式 Sheet 的原綁定式專案，不建立另一個專案。
2. 以 Sheet 擁有者執行 `installV84()`，接受新增的 Google Drive 與跨試算表 OAuth 權限。
3. 更新目前 Web App deployment 的程式版本，保留 deployment ID 與 `/exec` URL。
4. 從 Pages 登入後開啟「備份與還原」，先確認狀態摘要，再建立一份 `MANUAL` 備份。
5. 確認副本位於「資產記錄備份」、名稱含秒數、`FILE_ROLE=BACKUP`、清單狀態為 `VERIFIED`，且正式 Sheet ID 不變。
6. 以測試備份開啟還原精靈，確認差異預覽、再次輸入目前 API 金鑰、輸入「還原」與 Prepare／Apply／Finalize 全部成功。
7. 驗證完成後正式 Sheet ID、deployment ID、`/exec` URL、API 金鑰末四碼與 `scheduledDailyJob` 均未改變，且受管理每日觸發器正好一個。

若還原頁顯示未完成工作：`PREPARED`／`SOURCE_RESTORED` 可按「繼續還原」；`ROLLBACK_REQUIRED` 必須再次驗證後按「回復還原前狀態」。不要手動解除 Script Properties 鎖，也不要把緊急備份直接改成正式檔。

完整歷史快照重建採批次游標。Finalize 顯示快照警告時，正式來源資料仍已安全恢復；後續由唯一每日排程續跑，直到警告解除。

若建立備份失敗，不得切換正式檔或修改 Pages API URL。先檢查 GAS 授權、`BACKUP_FOLDER_ID`、Drive 空間及「備份紀錄」錯誤摘要。

## 金鑰輪替

從 Sheet 選單執行「輪替 Web API 金鑰」。新金鑰只顯示一次；舊金鑰立即失效。關閉所有已登入 Pages 分頁後，用新金鑰重新登入。不要將金鑰貼進 issue、commit、日誌或部署紀錄。

## 回復

- 資料還原失敗：保持目前正式 Sheet 與 deployment，不切換檔案；在「備份與還原」使用該工作的「回復還原前狀態」，讓同一 Restore Service 寫回緊急備份、重算並驗證。
- 要回到某個已驗證資料時間點：從備份清單啟動正常還原精靈。不要手動還原「持倉計算」或其他衍生分頁。
- 只回復程式：確認沒有 `RESTORE_RUNNING`／`RESTORE_FAILED` 工作後，將原綁定式 GAS 與原 Web App deployment 更新為先前已驗證版本；保留 deployment ID、`/exec` URL、正式 Spreadsheet ID 與 API 金鑰。
- Pages 回復：回復先前靜態版本，`docs/config.js` 仍指向同一 `/exec` URL；不需要刪除 deployment 或建立新 URL。
- 回復後執行相應版本的安裝／驗證函式，確認正式來源筆數、API 讀取、XIRR 型態與唯一 `scheduledDailyJob`。
