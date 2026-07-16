# v8.4.0 隱私說明

- 每位使用者擁有自己的 Google Sheet、綁定式 GAS、觸發器與 Drive 備份。
- 管理者不需要也不應取得使用者 Sheet 權限。
- Gateway 以目前存取 Web App 的 Google 使用者執行，每次請求都重新驗證 ID Token 與 Sheet 編輯權限。
- 不建立中央使用者資料庫、Spreadsheet ID 對照表或管理者資產索引。
- Google ID Token 只存在頁面記憶體；不保存 Refresh Token、Access Token、Google 密碼或 Drive 內容。
- 本機只保存非敏感的顯示資料與目前使用者的 Spreadsheet ID。
