(function (root) {
  'use strict';

  function api() { return root.AssetRecordApi; }

  function getOverview() {
    return api().call('backup.getOverview', { dedupeKey: 'backup-overview' });
  }

  function create(reason, note) {
    return api().call('backup.create', {
      payload: { reason: reason, note: note || '' },
      dedupeKey: 'backup-create'
    });
  }

  function list(includeInvalid) {
    return api().call('backup.list', {
      params: { includeInvalid: Boolean(includeInvalid) },
      dedupeKey: 'backup-list'
    });
  }

  function preview(backupId) {
    return api().call('backup.preview', { params: { backupId: backupId }, dedupeKey: 'backup-preview:' + backupId });
  }

  function validate(backupId) {
    return api().call('backup.validate', { params: { backupId: backupId }, dedupeKey: 'backup-validate:' + backupId });
  }

  function registerLegacy(url) {
    return api().call('backup.registerLegacy', { payload: { url: url }, dedupeKey: 'backup-register-legacy' });
  }

  function restorePreview(backupId) {
    return api().call('restore.preview', { params: { backupId: backupId }, dedupeKey: 'restore-preview:' + backupId });
  }

  function elevate(username, credential) {
    return root.AssetRecordAuthApi.elevate(username, credential, 'restore');
  }

  function prepareRestore(backupId, elevatedToken, options) {
    return api().call('restore.prepare', {
      elevatedToken: elevatedToken,
      payload: { backupId: backupId, options: options || {} },
      dedupeKey: 'restore-prepare'
    });
  }

  function applyRestore(operationId, elevatedToken) {
    return api().call('restore.apply', { elevatedToken: elevatedToken, payload: { operationId: operationId }, dedupeKey: 'restore-apply' });
  }

  function finalizeRestore(operationId, elevatedToken) {
    return api().call('restore.finalize', { elevatedToken: elevatedToken, payload: { operationId: operationId }, dedupeKey: 'restore-finalize' });
  }

  function restoreStatus(operationId) {
    return api().call('restore.status', { params: operationId ? { operationId: operationId } : {}, dedupeKey: 'restore-status' });
  }

  function rollbackRestore(operationId, elevatedToken) {
    return api().call('restore.rollback', {
      elevatedToken: elevatedToken,
      payload: { operationId: operationId },
      dedupeKey: 'restore-rollback'
    });
  }

  root.AssetRecordBackupApi = Object.freeze({
    getOverview: getOverview,
    create: create,
    list: list,
    preview: preview,
    validate: validate,
    registerLegacy: registerLegacy,
    restorePreview: restorePreview,
    elevate: elevate,
    prepareRestore: prepareRestore,
    applyRestore: applyRestore,
    finalizeRestore: finalizeRestore,
    restoreStatus: restoreStatus,
    rollbackRestore: rollbackRestore
  });
})(window);
