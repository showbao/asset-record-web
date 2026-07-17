(function (root) {
  'use strict';

  var overview = null;
  var backups = [];

  function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = String(text);
    return element;
  }

  function displayDate(value) { return value ? String(value).replace('T', ' ').replace('+08:00', '') : '—'; }

  function renderOverview(data) {
    overview = data;
    var target = document.getElementById('backupOverview'); target.replaceChildren();
    [
      ['系統版本', data.systemVersion], ['最後完整更新', displayDate(data.lastFullUpdateAt)], ['最後備份', displayDate(data.lastBackupAt)],
      ['投資交易', data.transactionCount + ' 筆'], ['投資標的', data.assetCount + ' 筆'], ['外部出入金', data.cashFlowCount + ' 筆'], ['歷史快照', data.snapshotCount + ' 筆']
    ].forEach(function (item) {
      var card = node('article', 'backup-stat'); card.append(node('span', '', item[0]), node('strong', '', item[1])); target.appendChild(card);
    });
    document.getElementById('newBackup').disabled = !data.canCreateBackup;
  }

  function statusText(row) {
    if (row.availabilityStatus === 'MISSING') return '檔案遺失';
    if (row.validationStatus === 'VERIFIED') return '可用';
    if (row.validationStatus === 'LEGACY_UNVERIFIED') return '舊版未驗證';
    return '無效';
  }

  function canRestore(row) {
    return row.availabilityStatus === 'AVAILABLE' && (row.validationStatus === 'VERIFIED' || row.validationStatus === 'LEGACY_UNVERIFIED');
  }

  function renderBackups(items) {
    backups = items.slice();
    var target = document.getElementById('backupTable'); target.replaceChildren();
    if (!items.length) { target.appendChild(node('div', 'empty-state', '尚無符合條件的備份')); return; }
    var table = node('table');
    var head = node('thead'); var headRow = node('tr');
    ['日期', '原因', '版本', '交易筆數', '快照日期', '狀態', '操作'].forEach(function (label) { headRow.appendChild(node('th', '', label)); });
    head.appendChild(headRow); table.appendChild(head);
    var body = node('tbody');
    items.forEach(function (row) {
      var tr = node('tr');
      tr.append(node('td', '', displayDate(row.createdAt)), node('td', '', row.reasonLabel || row.reason), node('td', '', row.systemVersion || '—'),
        node('td', 'numeric', row.transactionCount), node('td', '', row.snapshotEndDate ? '至 ' + row.snapshotEndDate : '—'),
        node('td', row.validationStatus === 'VERIFIED' ? 'status-good' : 'status-bad', statusText(row)));
      var actions = node('td', 'row-actions');
      var open = node('a', 'button-link', '查看'); open.href = row.fileUrl; open.target = '_blank'; open.rel = 'noopener'; actions.appendChild(open);
      if (canRestore(row)) {
        var restore = node('button', 'button-link', '還原'); restore.type = 'button';
        restore.addEventListener('click', function () { root.AssetRecordRestoreWizard.open(backups, row.backupId, load); });
        actions.appendChild(restore);
      }
      tr.appendChild(actions); body.appendChild(tr);
    });
    table.appendChild(body); target.appendChild(table);
  }

  async function load() {
    var overviewTarget = document.getElementById('backupOverview');
    overviewTarget.replaceChildren(node('div', 'empty-state', '讀取備份狀態…'));
    try {
      var includeInvalid = document.getElementById('showInvalidBackups').checked;
      var results = await Promise.all([root.AssetRecordBackupApi.getOverview(), root.AssetRecordBackupApi.list(includeInvalid), root.AssetRecordBackupApi.restoreStatus()]);
      renderOverview(results[0].data); renderBackups(results[1].data.items); renderRecovery(results[2].data);
    } catch (error) {
      overviewTarget.replaceChildren(node('div', 'global-error', error && error.message ? error.message : '無法讀取備份狀態'));
      throw error;
    }
  }

  function renderRecovery(status) {
    var target = document.getElementById('restoreRecovery');
    target.replaceChildren();
    var operation = status && status.operation;
    if (!operation || (!status.hasUnfinishedOperation && !status.rollbackRequired)) { target.hidden = true; return; }
    target.hidden = false;
    var copy = node('div');
    copy.append(node('strong', '', status.rollbackRequired ? '上次還原未完成，正式資料目前已鎖定。' : '偵測到尚未完成的還原工作。'),
      node('p', '', '工作 ' + operation.operationId + ' · 階段 ' + operation.currentStage + (operation.error ? ' · ' + operation.error : '')));
    var controls = node('div', 'restore-recovery-actions');
    if (!status.rollbackRequired) {
      var resume = node('button', 'primary', '繼續還原'); resume.type = 'button';
      resume.addEventListener('click', function () { root.AssetRecordRestoreWizard.resume(operation, load); }); controls.appendChild(resume);
    }
    var rollback = node('button', 'danger-button', '回復還原前狀態'); rollback.type = 'button';
    rollback.addEventListener('click', function () { root.AssetRecordRestoreWizard.recover(operation, load); }); controls.appendChild(rollback);
    target.append(copy, controls);
  }

  document.getElementById('newBackup').addEventListener('click', function () {
    if (!overview) return;
    root.AssetRecordBackupWizard.open(overview, load);
  });
  document.getElementById('restoreData').addEventListener('click', function () { root.AssetRecordRestoreWizard.open(backups, '', load); });
  document.getElementById('refreshBackups').addEventListener('click', load);
  document.getElementById('showInvalidBackups').addEventListener('change', load);

  var legacyDialog = document.getElementById('legacyBackupDialog');
  var legacyForm = document.getElementById('legacyBackupForm');
  var legacyUrl = document.getElementById('legacyBackupUrl');
  var legacyError = document.getElementById('legacyBackupError');
  var legacySave = document.getElementById('saveLegacyBackup');
  function closeLegacy() { if (legacyDialog.open) legacyDialog.close(); }
  document.getElementById('addLegacyBackup').addEventListener('click', function () { legacyForm.reset(); legacyError.textContent = ''; legacyDialog.showModal(); });
  document.getElementById('closeLegacyBackup').addEventListener('click', closeLegacy);
  document.getElementById('cancelLegacyBackup').addEventListener('click', closeLegacy);
  legacyForm.addEventListener('submit', async function (event) {
    event.preventDefault(); legacyError.textContent = ''; legacySave.disabled = true;
    try {
      await root.AssetRecordBackupApi.registerLegacy(legacyUrl.value.trim());
      document.getElementById('showInvalidBackups').checked = true;
      closeLegacy(); await load();
    } catch (error) {
      legacyError.textContent = error && error.message ? error.message : '無法加入舊版備份';
    } finally { legacySave.disabled = false; }
  });

  root.AssetRecordBackupRestorePage = Object.freeze({ load: load });
})(window);
