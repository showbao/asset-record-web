(function (root) {
  'use strict';

  var dialog;
  var body;
  var actions;
  var errorBox;
  var closeButton;
  var state = {};

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

  function value(input) { return input == null || input === '' ? '—' : String(input).replace('T', ' ').replace('+08:00', ''); }

  function setHeader(step, title, customStep) {
    state.step = step;
    document.getElementById('restoreWizardStep').textContent = customStep || ('步驟 ' + step + ' / 4');
    document.getElementById('restoreWizardTitle').textContent = title;
    errorBox.textContent = '';
  }

  function setBusy(busy) {
    closeButton.disabled = Boolean(busy);
    Array.prototype.forEach.call(actions.querySelectorAll('button'), function (item) { item.disabled = Boolean(busy); });
  }

  function restorable(item) {
    return item.availabilityStatus === 'AVAILABLE' && (item.validationStatus === 'VERIFIED' || item.validationStatus === 'LEGACY_UNVERIFIED');
  }

  function renderSelection() {
    setHeader(1, '選擇備份'); body.replaceChildren();
    var items = (state.backups || []).filter(restorable);
    if (!items.length) {
      body.appendChild(node('div', 'empty-state', '目前沒有可還原的備份。請先建立並驗證一份備份。'));
      actions.replaceChildren(button('關閉', 'ghost', close)); return;
    }
    var list = node('fieldset', 'restore-choice-list'); list.appendChild(node('legend', '', '選擇要恢復的資料時間點'));
    items.forEach(function (item) {
      var label = node('label', 'restore-choice');
      var input = document.createElement('input'); input.type = 'radio'; input.name = 'restoreBackup'; input.value = item.backupId;
      input.checked = state.backupId ? item.backupId === state.backupId : false;
      var details = node('span'); details.append(node('strong', '', value(item.createdAt)), node('small', '', (item.reasonLabel || item.reason) + ' · ' + item.transactionCount + ' 筆交易 · ' + (item.snapshotEndDate || '無快照日期')));
      if (item.validationStatus === 'LEGACY_UNVERIFIED') details.appendChild(node('em', 'legacy-badge', '舊版未驗證'));
      label.append(input, details); list.appendChild(label);
    });
    body.appendChild(list);
    actions.replaceChildren(button('取消', 'ghost', close), button('下一步', 'primary', function () {
      var selected = body.querySelector('input[name=restoreBackup]:checked');
      if (!selected) { errorBox.textContent = '請先選擇一份備份'; return; }
      state.backupId = selected.value; loadPreview();
    }));
  }

  async function loadPreview() {
    setHeader(2, '比對目前資料與備份');
    body.replaceChildren(node('div', 'empty-state', '正在驗證備份並讀取摘要…')); actions.replaceChildren();
    try {
      var response = await root.AssetRecordBackupApi.restorePreview(state.backupId);
      state.preview = response.data;
      if (state.preview.snapshotRebuildRecommended) state.options.restoreSnapshots = false;
      renderComparison();
    } catch (error) {
      body.replaceChildren(node('div', 'global-error', error && error.message ? error.message : '無法讀取備份'));
      actions.replaceChildren(button('上一步', 'ghost', renderSelection), button('重試', 'primary', loadPreview));
    }
  }

  function renderComparison() {
    setHeader(2, '比對目前資料與備份'); body.replaceChildren();
    var table = node('table', 'restore-comparison');
    var head = node('thead'); var headerRow = node('tr');
    ['資料', '目前正式檔', '還原後'].forEach(function (label) { headerRow.appendChild(node('th', '', label)); });
    head.appendChild(headerRow); table.appendChild(head);
    var rows = node('tbody');
    state.preview.comparison.forEach(function (item) {
      var tr = node('tr'); tr.append(node('td', '', item.label), node('td', 'numeric', value(item.current)), node('td', 'numeric restore-target', value(item.backup))); rows.appendChild(tr);
    });
    table.appendChild(rows);
    body.append(table, node('p', 'wizard-danger', state.preview.warning));
    actions.replaceChildren(button('上一步', 'ghost', renderSelection), button('下一步', 'primary', renderOptions));
  }

  function checkOption(key, label, help, disabled) {
    var wrapper = node('label', 'restore-option');
    var input = document.createElement('input'); input.type = 'checkbox'; input.dataset.option = key; input.checked = state.options[key]; input.disabled = Boolean(disabled);
    var copy = node('span'); copy.append(node('strong', '', label), node('small', '', help)); wrapper.append(input, copy); return wrapper;
  }

  function renderOptions() {
    setHeader(2, '選擇還原範圍'); body.replaceChildren();
    var fixed = node('div', 'restore-fixed-options');
    fixed.appendChild(node('strong', '', '固定執行'));
    var fixedList = node('ul', 'check-list');
    ['恢復投資交易、投資標的與外部出入金', '清理暫存與衍生輸出', '重新計算現金、持倉、績效、XIRR 與投資總覽'].forEach(function (label) { fixedList.appendChild(node('li', '', '✓ ' + label)); });
    fixed.appendChild(fixedList); body.appendChild(fixed);
    var list = node('div', 'restore-options');
    list.append(
      checkOption('restoreBusinessSettings', '恢復業務設定', '只恢復白名單內的基準幣別；API 金鑰與系統身分不會被覆蓋。'),
      checkOption('restoreSnapshots', '恢復歷史快照', state.preview.snapshotRebuildRecommended ? '此舊版備份缺少快照分頁，不能直接恢復；可另選完整重建。' : '包含投資趨勢快照與趨勢估值明細。', state.preview.snapshotRebuildRecommended),
      checkOption('refreshPrices', '重新整理價格／淨值', '外部來源失敗時會保留可用快取並顯示警告。'),
      checkOption('refreshFx', '重新整理匯率', '外部來源失敗時會保留可用快取並顯示警告。'),
      checkOption('fillMissingSnapshots', '補建缺漏快照', '依目前批次上限補建缺少的歷史取樣點。'),
      checkOption('fullSnapshotRebuild', '啟動完整快照重建', '資料量大時可能需要由排程續跑。')
    );
    body.appendChild(list);
    if (state.preview.snapshotRebuildRecommended) body.appendChild(node('p', 'wizard-notice', '此備份可恢復交易、標的與外部出入金，但歷史快照需要另行完整重建。完整重建仍預設不勾選。'));
    if (state.preview.requiresLegacyConfirmation) {
      var legacy = node('label', 'legacy-confirm'); var checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = 'confirmLegacyRestore';
      legacy.append(checkbox, node('span', '', '我了解這是舊版未驗證備份，且缺少的新欄位會留白。')); body.appendChild(legacy);
    }
    actions.replaceChildren(button('上一步', 'ghost', renderComparison), button('下一步', 'primary', function () {
      Array.prototype.forEach.call(body.querySelectorAll('[data-option]'), function (input) { state.options[input.dataset.option] = input.checked; });
      state.options.confirmLegacy = Boolean(state.preview.requiresLegacyConfirmation && document.getElementById('confirmLegacyRestore').checked);
      if (state.preview.requiresLegacyConfirmation && !state.options.confirmLegacy) { errorBox.textContent = '舊版備份必須勾選額外確認'; return; }
      renderReauthentication(false);
    }));
  }

  function renderReauthentication(forRollback) {
    setHeader(3, forRollback ? '驗證後回復' : '再次驗證密碼', forRollback ? '回復 1 / 3' : null); body.replaceChildren();
    body.appendChild(node('p', 'wizard-lead', forRollback ? '回復會使用系統自動建立的「還原前緊急備份」。' : '還原是高權限操作，請再次輸入目前的原始密碼。'));
    var usernameLabel = node('label', 'reauth-field', '登入帳號'); var username = document.createElement('input'); username.autocomplete = 'username'; username.required = true; usernameLabel.appendChild(username);
    var label = node('label', 'reauth-field', '目前密碼');
    var input = document.createElement('input'); input.type = 'password'; input.autocomplete = 'current-password'; input.spellcheck = false; label.appendChild(input); body.append(usernameLabel, label);
    actions.replaceChildren(button('取消', 'ghost', close), button('驗證', 'primary', async function () {
      if (!username.value.trim() || !input.value) { errorBox.textContent = '請輸入帳號與目前密碼'; return; }
      setBusy(true);
      try {
        var password = input.value; var response = await root.AssetRecordBackupApi.elevate(username.value.trim(), password); password = ''; input.value = ''; state.elevatedToken = response.data.elevatedToken;
        if (forRollback) executeRollback(); else if (state.resumePrepare) executePrepareResume(); else renderConfirmation();
      } catch (error) { errorBox.textContent = error && error.message ? error.message : '驗證失敗'; setBusy(false); }
    }));
  }

  function renderConfirmation() {
    setHeader(3, '最後確認'); body.replaceChildren();
    body.append(node('p', 'wizard-danger', '這會以備份內容取代目前正式來源資料。系統會先建立並驗證還原前緊急備份，失敗時可用它回復。'));
    var label = node('label', 'confirm-restore-field', '請輸入「還原」以確認');
    var input = document.createElement('input'); input.type = 'text'; input.autocomplete = 'off'; label.appendChild(input); body.appendChild(label);
    actions.replaceChildren(button('取消', 'ghost', close), button('開始還原', 'danger-button', function () {
      if (input.value.trim() !== '還原') { errorBox.textContent = '請正確輸入「還原」'; return; }
      executeNewRestore();
    }));
    setBusy(false);
  }

  function progressList(activeIndex, failed, rollbackMode) {
    var labels = rollbackMode ? ['驗證緊急備份', '準備回復', '寫回來源資料', '重建衍生資料', '完整驗證', '解除系統鎖定'] : ['驗證來源備份', '建立還原前緊急備份', '寫回來源資料', '重建衍生資料', '完整驗證', '解除系統鎖定'];
    var list = node('ol', 'progress-list');
    labels.forEach(function (label, index) { list.appendChild(node('li', index < activeIndex ? 'done' : index === activeIndex ? (failed ? 'failed' : 'active') : '', label)); });
    return list;
  }

  function showProgress(index, rollbackMode) {
    setHeader(4, rollbackMode ? '正在回復還原前狀態' : '正在還原資料', rollbackMode ? '回復 2 / 3' : null);
    body.replaceChildren(progressList(index, false, rollbackMode)); actions.replaceChildren(); setBusy(true);
  }

  function rememberOperation(response) {
    if (response && response.data && response.data.operation) state.operation = response.data.operation;
    return state.operation;
  }

  async function executeNewRestore() {
    try {
      showProgress(0, false);
      var prepared = await root.AssetRecordBackupApi.prepareRestore(state.backupId, state.elevatedToken, state.options); rememberOperation(prepared);
      showProgress(2, false);
      var applied = await root.AssetRecordBackupApi.applyRestore(state.operation.operationId, state.elevatedToken); rememberOperation(applied);
      showProgress(3, false);
      var finalized = await root.AssetRecordBackupApi.finalizeRestore(state.operation.operationId, state.elevatedToken); rememberOperation(finalized);
      renderSuccess(finalized.data);
    } catch (error) { handleFailure(error, false); }
  }

  async function executePrepareResume() {
    try {
      showProgress(0, false);
      var prepared = await root.AssetRecordBackupApi.prepareRestore(state.operation.sourceBackupId, state.elevatedToken, state.operation.options || {}); rememberOperation(prepared);
      await executeFromOperation(false);
    } catch (error) { handleFailure(error, false); }
  }

  async function executeFromOperation(rollbackMode) {
    try {
      var stage = state.operation.currentStage;
      if (stage === 'PREPARED' || stage === 'APPLYING') {
        showProgress(2, rollbackMode);
        var applied = await root.AssetRecordBackupApi.applyRestore(state.operation.operationId, state.elevatedToken); rememberOperation(applied);
      }
      if (state.operation.currentStage === 'SOURCE_RESTORED' || ['FINALIZING', 'VALIDATING'].indexOf(stage) >= 0) {
        showProgress(3, rollbackMode);
        var finalized = await root.AssetRecordBackupApi.finalizeRestore(state.operation.operationId, state.elevatedToken); rememberOperation(finalized); renderSuccess(finalized.data, rollbackMode); return;
      }
      if (state.operation.status === 'SUCCESS') renderSuccess({ operation: state.operation }, rollbackMode);
    } catch (error) { handleFailure(error, rollbackMode); }
  }

  async function executeRollback() {
    try {
      showProgress(0, true);
      var response = await root.AssetRecordBackupApi.rollbackRestore(state.operation.operationId, state.elevatedToken); rememberOperation(response);
      await executeFromOperation(true);
    } catch (error) { handleFailure(error, true); }
  }

  function operationFromError(error) {
    return error && error.data && (error.data.operation || (error.data.data && error.data.data.operation));
  }

  function handleFailure(error, rollbackMode) {
    var failedOperation = operationFromError(error); if (failedOperation) state.operation = failedOperation;
    setHeader(4, rollbackMode ? '回復未完成' : '還原未完成', rollbackMode ? '回復 3 / 3' : null);
    body.replaceChildren(progressList(3, true, rollbackMode)); errorBox.textContent = error && error.message ? error.message : '還原流程失敗';
    var buttons = [button('關閉並查看狀態', 'ghost', function () { close(); complete(); })];
    if (state.operation && state.operation.emergencyBackupId && !rollbackMode) buttons.push(button('回復還原前狀態', 'danger-button', function () { renderReauthentication(true); }));
    actions.replaceChildren.apply(actions, buttons); setBusy(false);
  }

  function renderSuccess(result, rollbackMode) {
    state.operation = result.operation || state.operation;
    setHeader(6, rollbackMode ? '已回復還原前狀態' : '資料還原完成', rollbackMode ? '回復 3 / 3' : null); body.replaceChildren();
    var lead = rollbackMode ? '正式資料已使用緊急備份回復，系統鎖定已解除。' : (state.operation.result === 'SUCCESS_WITH_WARNINGS' ? '資料已還原，部分維護項目有警告。' : '來源資料、衍生資料與核心驗證均已完成。');
    body.appendChild(node('p', 'wizard-lead', lead));
    if (state.operation.warnings && state.operation.warnings.length) {
      var warnings = node('ul', 'restore-warning-list'); state.operation.warnings.forEach(function (warning) { warnings.appendChild(node('li', '', warning)); }); body.appendChild(warnings);
    }
    actions.replaceChildren(button('返回備份與還原', 'primary', function () { close(); complete(); })); setBusy(false);
  }

  function complete() { if (typeof state.onComplete === 'function') state.onComplete(); }
  function close() { if (dialog && dialog.open && !closeButton.disabled) dialog.close(); }

  function initialize() {
    dialog = document.getElementById('restoreWizardDialog'); body = document.getElementById('restoreWizardBody');
    actions = document.getElementById('restoreWizardActions'); errorBox = document.getElementById('restoreWizardError'); closeButton = document.getElementById('closeRestoreWizard');
  }

  function open(backups, backupId, onComplete) {
    initialize();
    state = { step: 1, backups: backups || [], backupId: backupId || '', preview: null, elevatedToken: '', operation: null, onComplete: onComplete,
      options: { restoreBusinessSettings: true, restoreSnapshots: true, refreshPrices: true, refreshFx: true, fillMissingSnapshots: true, fullSnapshotRebuild: false, confirmLegacy: false } };
    closeButton.disabled = false; renderSelection(); dialog.showModal();
  }

  function resume(operation, onComplete) {
    initialize(); state = { operation: operation, onComplete: onComplete, options: operation.options || {}, resumePrepare: operation.currentStage === 'PREPARING' }; closeButton.disabled = false; dialog.showModal();
    if (state.resumePrepare) renderReauthentication(false); else executeFromOperation(Boolean(operation.rollbackMode));
  }

  function recover(operation, onComplete) {
    initialize(); state = { operation: operation, onComplete: onComplete, options: operation.options || {} }; closeButton.disabled = false; renderReauthentication(true); dialog.showModal();
  }

  document.getElementById('closeRestoreWizard').addEventListener('click', close);
  document.getElementById('restoreWizardForm').addEventListener('submit', function (event) { event.preventDefault(); });
  root.AssetRecordRestoreWizard = Object.freeze({ open: open, resume: resume, recover: recover, close: close });
})(window);
