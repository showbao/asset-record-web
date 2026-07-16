function onOpen() {
  SpreadsheetApp.getUi().createMenu('資產記錄')
    .addItem('開啟 GitHub 系統', 'openAssetRecordWebV840_')
    .addItem('首次建置', 'firstTimeSetup')
    .addSeparator()
    .addItem('立即更新', 'refreshAllCurrentData')
    .addItem('驗證資料', 'validateSystem')
    .addItem('建立備份', 'createManualBackup')
    .addItem('修復每日自動更新', 'installOrRepairDailyTrigger')
    .addItem('系統資訊', 'showSystemInfoV840_')
    .addToUi();
}

function openAssetRecordWebV840_() {
  var html = HtmlService.createHtmlOutput('<script>window.open("https://showbao.github.io/asset-record-web/", "_blank");google.script.host.close();</script>').setWidth(120).setHeight(60);
  SpreadsheetApp.getUi().showModalDialog(html, '開啟資產記錄');
}

function showSystemInfoV840_() {
  var health = getSystemHealth();
  SpreadsheetApp.getUi().alert('資產記錄系統資訊', JSON.stringify(health.data, null, 2), SpreadsheetApp.getUi().ButtonSet.OK);
  return health;
}
