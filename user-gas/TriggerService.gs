function installOrRepairDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === 'dailyAssetMaintenance';
  });
  if (triggers.length === 1) {
    setSettingValues_({ DAILY_JOB_ENABLED: 'TRUE', DAILY_JOB_TIME: '18:30' });
    return { status: 'kept', removed: 0, created: false, handler: 'dailyAssetMaintenance', triggerCount: 1 };
  }
  triggers.forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  var created = ScriptApp.newTrigger('dailyAssetMaintenance')
    .timeBased()
    .atHour(18)
    .nearMinute(30)
    .everyDays(1)
    .inTimezone(V81.TIMEZONE)
    .create();
  var now = nowSheet_();
  setSettingValues_({
    DAILY_JOB_ENABLED: 'TRUE',
    DAILY_JOB_TIME: '18:30',
    TRIGGER_OWNER_EMAIL: activeUserEmailV840_(),
    TRIGGER_CREATED_AT: now
  });
  return { status: triggers.length ? 'recreated' : 'created', removed: triggers.length, created: true, handler: created.getHandlerFunction(), triggerCount: 1, ownerEmail: activeUserEmailV840_(), createdAt: now, scheduledTime: '18:30' };
}

function removeDailyTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'dailyAssetMaintenance') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  setSettingValues_({ DAILY_JOB_ENABLED: 'FALSE' });
  return { removed: removed, handler: 'dailyAssetMaintenance', remaining: 0 };
}

function dailyAssetMaintenance() {
  return scheduledDailyJob();
}

function setJobStateV840_(job, status, fields) {
  var prefix = job === 'market' ? 'MARKET_REFRESH' : 'REBUILD';
  var updates = {};
  updates[prefix + '_STATUS'] = status;
  fields = fields || {};
  if (Object.prototype.hasOwnProperty.call(fields, 'requestedAt')) updates[prefix + '_REQUESTED_AT'] = fields.requestedAt || '';
  if (Object.prototype.hasOwnProperty.call(fields, 'startedAt')) updates[prefix + '_STARTED_AT'] = fields.startedAt || '';
  if (Object.prototype.hasOwnProperty.call(fields, 'finishedAt')) updates[prefix + '_FINISHED_AT'] = fields.finishedAt || '';
  if (Object.prototype.hasOwnProperty.call(fields, 'error')) updates[prefix + '_ERROR'] = cleanText_(fields.error);
  setSettingValues_(updates);
}
