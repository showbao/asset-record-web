# v8.5 部署與回復

正式 Pages：https://showbao.github.io/asset-record-web/

正式 Apps Script Web App：https://script.google.com/macros/s/AKfycbwFgZfrzNI-dGwoDuaGBGlVh5QVAsviPbC_TPkhZfejiPFaSEAbBVpNrcdHLOnS7bIa/exec

v8.5 必須沿用既有 Spreadsheet ID、綁定式 Script ID、Deployment ID 與 `/exec` URL，不得另建 Google Cloud API、OAuth Client、Apps Script 專案或正式 Sheet。

## 1. 發布前

1. 對正式 Sheet 建立並驗證一份 `BEFORE_UPGRADE` 備份。
2. 匯出目前正式 GAS 原始碼與 deployment/version 資訊到不進版控的本機備份。
3. 確認 Git 工作樹差異只包含本次 v8.5 修改。
4. 執行全部 Node 回歸測試，確認安全、XIRR、交易、快照、備份與還原測試全數通過。

## 2. DUAL 過渡

1. 將 v8.5 GAS 推送到原綁定式專案，建立不可變版本，並更新原 deployment。
2. 以 Sheet 擁有者執行 `installV85()`；安裝器先設為 `AUTH_MODE=DUAL`。
3. 從 Sheet 選單「資產記錄 V8.5.0 → 設定／重設網頁登入帳密」私下設定帳號與至少 8 字元密碼；仍建議使用 15 字元以上密碼或長詞組。密碼不得貼入聊天、issue、commit 或日誌。
4. 發布 v8.5 Pages 後，驗證帳密登入、12 小時 Session、7 天 Session、登出、五次錯誤鎖定、解除鎖定、最多 5 個 Session 與所有資料 API。
5. 驗證還原、完整歷史重建、變更密碼與登出所有裝置都會要求再次輸入密碼，且 scope 不可互用。
6. 驗證桌面與手機版五項導航、六張首頁卡、兩張趨勢圖、交易抽屜、50 筆分頁、局部刷新與延遲載入。

DUAL 期間舊金鑰只作緊急回復手段，前端不得傳送或保存舊金鑰。

## 3. PASSWORD_SESSION 正式切換

完整驗收後才執行：

1. 執行 `finalizePasswordSessionMigrationV85()`，切換 `AUTH_MODE=PASSWORD_SESSION` 並刪除舊金鑰 Properties。
2. 確認未登入資料 API 回傳 `AUTH_REQUIRED`，傳舊金鑰回傳 `AUTH_LEGACY_DISABLED`。
3. 從 GAS 移除舊金鑰常數、雜湊、輪替、驗證與 DUAL fallback 程式，再建立最終不可變版本並更新同一 deployment。
4. 搜尋 Repository 與瀏覽器 Storage，確認無舊金鑰欄位、變數、硬編碼或隱藏後門。
5. 再跑完整回歸、正式 API smoke test、備份建立、還原演練、XIRR 型態與唯一 `scheduledDailyJob` 驗證。

未完成上述安全、效能、備份還原與完整驗證前，不得宣告 v8.5 正式完成。

## 4. GitHub Pages

正式發布來源固定為 `main/docs`；`docs/config.js` 只能含公開 `/exec` URL。Pages 不需要 GitHub Actions 或建置步驟。合併後從實際 Pages 網域驗證 POST 重新導向、登入、Session 恢復及受保護 API。

## 5. 回復

- 程式回復：只回復原綁定式 GAS 與原 deployment 的先前已驗證版本；保留 Spreadsheet ID、Script ID、Deployment ID 與 `/exec` URL。
- Pages 回復：回復先前靜態版本，`docs/config.js` 仍指向同一 `/exec` URL。
- 資料回復：使用「備份與還原」精靈；不要手動切換正式檔或覆蓋衍生分頁。
- `PREPARED`／`SOURCE_RESTORED` 可續跑；`ROLLBACK_REQUIRED` 需再次驗證密碼後回復還原前狀態。
- 若 v8.5 登入尚未設定或驗證失敗，在 DUAL 期可先回復 v8.4 Pages；不要建立新 deployment URL。

回復後執行對應版本安裝／驗證函式，確認來源筆數、API、XIRR、備份狀態、AUTH Properties 未被資料還原覆蓋，且受管理每日觸發器正好一個。
