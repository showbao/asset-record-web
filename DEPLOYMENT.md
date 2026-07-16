# 部署與回復

正式 Pages：`https://showbao.github.io/asset-record-web/`

v8.4.0 Gateway Web App 與 Google Web Client ID 在 staging 驗證完成前不得填入正式 `main/docs/config.js`。

## GitHub Pages

1. 建立公開儲存庫 `asset-record-web`，預設分支 `main`。
2. 將本目錄內容推送到 `main`。
3. 建立 Google Web OAuth Client，將 Pages 與 staging origin 加入 Authorized JavaScript origins。
4. 將 `gateway-gas/` 部署為 Web App：Execute as `USER_ACCESSING`、Access `ANYONE`，並把相同 Client ID 存入 Gateway Script Property `GOOGLE_WEB_CLIENT_ID`。
5. 建立並清理 `資產記錄_空白範本_v8.4`，確認範本包含 `user-gas/` 的完整綁定式程式且沒有個人資料或觸發器。
6. 在 `docs/config.js` 填入 Gateway `/exec` URL、Google Web Client ID 與範本 `/copy` URL；不得填入 Token、Spreadsheet ID 或任何使用者資料。
7. Repository Settings → Pages → Deploy from a branch，選擇 `main` 與 `/docs`。
8. 以兩個互不共享 Sheet 的帳號完成 A／B 隔離驗證後才可發布正式版。

## Apps Script 同步

首次發布需由管理者在本機完成一次 Google 授權；不得把 clasp 憑證提交到 Repository。

```powershell
npx.cmd --yes @google/clasp login
```

Gateway 是獨立 Apps Script 專案：

```powershell
Set-Location gateway-gas
npx.cmd --yes @google/clasp create --type standalone --title "資產記錄 Gateway v8.4"
npx.cmd --yes @google/clasp push
```

空白範本先由正式 Sheet 建立隔離副本，將名稱精確改成 `資產記錄_空白範本_v8.4`，再從副本的「擴充功能 → Apps Script → 專案設定」取得 Script ID。於 `user-gas/.clasp.json` 暫時填入該 ID 後執行：

```powershell
Set-Location user-gas
npx.cmd --yes @google/clasp push
```

同步後在該範本的 Apps Script 編輯器手動執行 `prepareBlankTemplateV840()`，確認回傳 `success=true`、三張原始表與快取／趨勢筆數皆為 0、`triggerCount=0`，才可設定為「知道連結者可檢視」並使用 `/copy` URL。執行完成後刪除本機 `.clasp.json`；此檔已由 `.gitignore` 排除。

部署 Gateway 前須在 Script Property 設定 `GOOGLE_WEB_CLIENT_ID`，並建立 Web App deployment：

- Execute as：`User accessing the web app`
- Who has access：`Anyone`
- URL：只使用正式 `/exec`，不得把 `/dev` 放入 Pages 設定

最後將 Gateway `/exec` URL、同一個 Google Web Client ID、範本 `/copy` URL 寫入 `docs/config.js`，再執行 A／B 實測。任何 OAuth Token、clasp 憑證、使用者 Spreadsheet ID 均不得寫入該檔。

正式切換前需在桌面與手機寬度驗證 Google 登入、未授權、錯誤帳號、唯讀 Sheet、一般試算表、備份檔、超賣、軟刪除／還原與待重算警告。

## 回復

- 驗收前：停止 v8.4 Gateway deployment，將 Pages 指回 v8.3.1 tag，保留既有正式 Sheet。
- 已有新交易：只回復程式與 deployment，不覆蓋「投資標的」、「投資交易」或「外部出入金」。
- 需要回到舊架構時，使用第一階段前備份與 tag `v8.3.1-pre-v8.4.0-20260716`；不得把空白範本覆蓋到正式 Sheet。
