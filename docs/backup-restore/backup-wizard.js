(function (root) {
  'use strict';

  var dialog;
  var body;
  var actions;
  var errorBox;
  var state = { step: 1, overview: null, reason: 'MANUAL', note: '', result: null, onComplete: null };

  var reasonOptions = [
    ['MANUAL', '一般手動備份'],
    ['BEFORE_BULK_EDIT', '大量修改前'],
    ['BEFORE_IMPORT', '匯入資料前'],
    ['BEFORE_SNAPSHOT_REBUILD', '歷史快照重建前'],
    ['BEFORE_UPGRADE', '系統升級前'],
    ['OTHER', '其他']
  ];

  function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = String(text);
    return element;
  }

  function button(label, className, handler) {
    var element = node('button', className, label);
    element.type = 'button';
    element.addEventListener('click', handler);
    return element;
  }

  function value(value) { return value == null || value === '' ? '—' : String(value).replace('T', ' ').replace('+08:00', ''); }

  function setHeader(title) {
    document.getElementById('backupWizardStep').textContent = '步驟 ' + state.step + ' / 5';
    document.getElementById('backupWizardTitle').textContent = title;
    errorBox.textContent = '';
  }

  function renderStatusGrid() {
    var grid = node('dl', 'wizard-summary');
    [
      ['目前系統版本', state.overview.systemVersion],
      ['最後完整更新時間', value(state.overview.lastFullUpdateAt)],
      ['最後備份時間', value(state.overview.lastBackupAt)],
      ['投資交易筆數', state.overview.transactionCount],
      ['投資標的筆數', state.overview.assetCount],
      ['外部出入金筆數', state.overview.cashFlowCount],
      ['歷史快照筆數', state.overview.snapshotCount]
    ].forEach(function (item) { grid.append(node('dt', '', item[0]), node('dd', '', item[1])); });
    return grid;
  }

  function renderStepOne() {
    state.step = 1; setHeader('目前狀態'); body.replaceChildren(renderStatusGrid()); actions.replaceChildren(
      button('取消', 'ghost', close),
      button('下一步', 'primary', function () { renderStepTwo(); })
    );
  }

  function renderStepTwo() {
    state.step = 2; setHeader('選擇備份原因'); body.replaceChildren();
    var list = node('fieldset', 'reason-list');
    list.appendChild(node('legend', '', '這次為什麼建立備份？'));
    reasonOptions.forEach(function (option) {
      var label = node('label', 'reason-option');
      var input = document.createElement('input');
      input.type = 'radio'; input.name = 'backupReason'; input.value = option[0]; input.checked = state.reason === option[0];
      label.append(input, node('span', '', option[1])); list.appendChild(label);
    });
    var noteLabel = node('label', 'note-field', '備註（最多 200 字）');
    var note = document.createElement('textarea'); note.id = 'backupNote'; note.maxLength = 200; note.rows = 3; note.value = state.note;
    noteLabel.appendChild(note); body.append(list, noteLabel);
    actions.replaceChildren(button('上一步', 'ghost', renderStepOne), button('下一步', 'primary', function () {
      var selected = body.querySelector('input[name=backupReason]:checked');
      state.reason = selected ? selected.value : 'MANUAL'; state.note = note.value.trim(); renderStepThree();
    }));
  }

  function renderStepThree() {
    state.step = 3; setHeader('確認內容'); body.replaceChildren();
    body.appendChild(node('p', 'wizard-lead', '即將建立一份完整 Google Sheet 副本。'));
    var list = node('ul', 'check-list');
    ['所有可見與隱藏分頁', '所有資料、公式與格式', '資料驗證與圖表', 'Named Range 與隱藏狀態', '歷史快照', '當時的 GAS 副本'].forEach(function (item) {
      list.appendChild(node('li', '', '✓ ' + item));
    });
    body.append(list, node('p', 'wizard-notice', '備份完成後，正式系統不會切換到備份檔。'));
    actions.replaceChildren(button('取消', 'ghost', close), button('確認建立備份', 'primary', execute));
  }

  function progressList(activeIndex, failed) {
    var list = node('ol', 'progress-list');
    ['鎖定系統', '檢查正式檔', '建立完整副本', '標記備份檔', '驗證備份', '寫入備份紀錄', '完成'].forEach(function (label, index) {
      var className = index < activeIndex ? 'done' : index === activeIndex ? (failed ? 'failed' : 'active') : '';
      list.appendChild(node('li', className, label));
    });
    return list;
  }

  async function execute() {
    state.step = 4; setHeader('執行備份'); body.replaceChildren(progressList(2, false)); actions.replaceChildren();
    try {
      var response = await root.AssetRecordBackupApi.create(state.reason, state.note);
      state.result = response.data;
      renderStepFive();
      if (typeof state.onComplete === 'function') state.onComplete();
    } catch (error) {
      body.replaceChildren(progressList(4, true));
      errorBox.textContent = error && error.message ? error.message : '備份失敗';
      actions.replaceChildren(button('關閉', 'ghost', close), button('重試', 'primary', renderStepThree));
    }
  }

  function renderStepFive() {
    state.step = 5; setHeader('備份成功'); body.replaceChildren();
    var backup = state.result.backup;
    var grid = node('dl', 'wizard-summary');
    [
      ['名稱', backup.fileName], ['系統版本', backup.systemVersion], ['投資交易', backup.transactionCount + ' 筆'],
      ['投資標的', backup.assetCount + ' 筆'], ['外部出入金', backup.cashFlowCount + ' 筆'],
      ['歷史快照', backup.snapshotCount + ' 筆'], ['驗證狀態', backup.validationStatus === 'VERIFIED' ? '通過' : backup.validationStatus]
    ].forEach(function (item) { grid.append(node('dt', '', item[0]), node('dd', '', item[1])); });
    body.appendChild(grid);
    var open = button('開啟備份檔', '', function () { root.open(backup.fileUrl, '_blank', 'noopener'); });
    actions.replaceChildren(open, button('返回系統設定', 'primary', close));
  }

  function close() { if (dialog && dialog.open) dialog.close(); }

  function open(overview, onComplete) {
    dialog = document.getElementById('backupWizardDialog'); body = document.getElementById('backupWizardBody');
    actions = document.getElementById('backupWizardActions'); errorBox = document.getElementById('backupWizardError');
    state = { step: 1, overview: overview, reason: 'MANUAL', note: '', result: null, onComplete: onComplete };
    renderStepOne(); dialog.showModal();
  }

  document.getElementById('closeBackupWizard').addEventListener('click', close);
  document.getElementById('backupWizardForm').addEventListener('submit', function (event) { event.preventDefault(); });
  root.AssetRecordBackupWizard = Object.freeze({ open: open, close: close });
})(window);
