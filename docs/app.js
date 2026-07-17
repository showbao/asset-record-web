(function () {
  'use strict';

  var api = window.AssetRecordApi;
  var auth = window.AssetRecordAuthApi;
  var uiFormat = window.AssetRecordUiFormat;
  var state = { view: 'overview', page: { instruments: 1, transactions: 1, cashflows: 1 }, editor: null, overview: null, instruments: [], username: '', reauth: null, changePasswordToken: '' };
  var money = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
  var decimal = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 6 });

  function byId(id) { return document.getElementById(id); }
  function node(tag, className, text) { var element = document.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = String(text); return element; }
  function svgNode(tag, attributes) { var element = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.keys(attributes || {}).forEach(function (key) { element.setAttribute(key, String(attributes[key])); }); return element; }
  function valueOrDash(value, formatter) { return value == null || value === '' ? '—' : (formatter || String)(value); }
  function moneyText(value) { return valueOrDash(value, function (number) { return 'NT$ ' + money.format(number); }); }
  function percentText(value) { return uiFormat.percentText(value); }
  function currencyText(value, currency) { return uiFormat.currencyText(value, currency); }
  function dateTimeText(value) { return value ? String(value).replace('T', ' ').replace('+08:00', '').replace('Z', '') : '—'; }
  function errorMessage(error) { return error && error.message ? error.message : '操作失敗'; }
  function setSync(text) { byId('syncState').textContent = text; }
  function showError(error) { var box = byId('globalError'); box.textContent = errorMessage(error); box.hidden = false; setSync('發生錯誤'); }
  function clearError() { byId('globalError').hidden = true; byId('globalError').textContent = ''; }
  function applyMeta(meta) { if (meta) byId('recalcWarning').hidden = !meta.needsRecalc; }
  function setButtonBusy(button, busy, label) { if (!button) return; if (busy) button.dataset.originalText = button.textContent; button.disabled = busy; button.textContent = busy ? (label || '處理中…') : (button.dataset.originalText || button.textContent); }

  function paramsFromForm(form) {
    var params = {};
    new FormData(form).forEach(function (value, key) { var text = String(value).trim(); if (text !== '') params[key] = text; });
    return params;
  }

  function actionButton(label, className, handler) { var button = node('button', className, label); button.type = 'button'; button.addEventListener('click', handler); return button; }

  function renderTable(containerId, columns, rows, actions) {
    var container = byId(containerId); container.replaceChildren();
    if (!rows.length) { container.appendChild(node('div', 'empty-state', '沒有符合條件的資料')); return; }
    var table = node('table'); var head = node('thead'); var headRow = node('tr');
    columns.forEach(function (column) { headRow.appendChild(node('th', '', column.label)); });
    if (actions) headRow.appendChild(node('th', '', '操作')); head.appendChild(headRow); table.appendChild(head);
    var body = node('tbody');
    rows.forEach(function (row) {
      var tr = node('tr');
      columns.forEach(function (column) { var value = column.format ? column.format(row[column.key], row) : valueOrDash(row[column.key]); var cell = node('td', column.numeric ? 'numeric' : '', value); cell.dataset.label = column.label; tr.appendChild(cell); });
      if (actions) { var cell = node('td'); cell.dataset.label = '操作'; var group = node('div', 'row-actions'); actions(row).forEach(function (button) { group.appendChild(button); }); cell.appendChild(group); tr.appendChild(cell); }
      body.appendChild(tr);
    });
    table.appendChild(body); container.appendChild(table);
  }

  function renderPager(containerId, data, onPage) {
    var container = byId(containerId); container.replaceChildren();
    container.appendChild(node('span', 'muted', '第 ' + data.page + ' / ' + data.totalPages + ' 頁，共 ' + data.total + ' 筆'));
    var buttons = node('div'); var previous = actionButton('上一頁', 'ghost', function () { onPage(data.page - 1); }); previous.disabled = data.page <= 1;
    var next = actionButton('下一頁', 'ghost', function () { onPage(data.page + 1); }); next.disabled = !data.hasNext; buttons.append(previous, next); container.appendChild(buttons);
  }

  function renderMetrics(summary) {
    var cards = [
      ['投資淨資產', moneyText(summary.netAssetTwd)], ['累計外部淨投入', moneyText(summary.externalNetContributionTwd)],
      ['累計投資損益', moneyText(summary.totalPnlTwd)], ['投資池現金', moneyText(summary.cashTwd)],
      ['整體報酬率', percentText(summary.totalReturn)], ['投資組合 XIRR', percentText(summary.xirr)]
    ];
    var target = byId('metricCards'); target.replaceChildren();
    cards.forEach(function (item) { var card = node('article', 'metric-card'); card.append(node('span', 'label', item[0]), node('strong', '', item[1])); target.appendChild(card); });
  }

  function renderAllocation(items, netAsset) {
    var target = byId('allocationList'); target.replaceChildren();
    (items || []).forEach(function (item) {
      var ratio = netAsset > 0 && item.valueTwd != null ? Math.max(0, item.valueTwd / netAsset) : 0;
      var row = node('div', 'allocation-row'); row.appendChild(node('span', '', item.label));
      var track = node('div', 'allocation-track'); var fill = node('div', 'allocation-fill'); fill.style.width = Math.min(100, ratio * 100) + '%'; track.appendChild(fill); row.appendChild(track);
      row.appendChild(node('span', '', item.valueTwd == null ? '—' : percentText(ratio))); target.appendChild(row);
    });
  }

  function renderTrend(chartId, rows) {
    var chart = byId(chartId); chart.replaceChildren();
    var points = (rows || []).filter(function (row) { return row.netAssetTwd != null && row.externalNetContributionTwd != null; });
    if (points.length < 2) { var empty = svgNode('text', { x: 380, y: 150, 'text-anchor': 'middle', class: 'chart-label' }); empty.textContent = '趨勢資料不足'; chart.appendChild(empty); return; }
    var values = []; points.forEach(function (row) { values.push(row.netAssetTwd, row.externalNetContributionTwd); });
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values); if (min === max) max = min + 1;
    var left = 58, right = 738, top = 24, bottom = 260;
    for (var grid = 0; grid <= 4; grid++) { var y = top + (bottom - top) * grid / 4; chart.appendChild(svgNode('line', { x1: left, x2: right, y1: y, y2: y, class: 'chart-grid' })); var label = svgNode('text', { x: left - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-label' }); label.textContent = money.format(max - (max - min) * grid / 4); chart.appendChild(label); }
    function linePath(key) { return points.map(function (row, index) { var x = left + (right - left) * index / (points.length - 1); var y = bottom - (row[key] - min) / (max - min) * (bottom - top); return (index ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2); }).join(' '); }
    chart.appendChild(svgNode('path', { d: linePath('netAssetTwd'), class: 'chart-net' })); chart.appendChild(svgNode('path', { d: linePath('externalNetContributionTwd'), class: 'chart-contribution' }));
    var start = svgNode('text', { x: left, y: 286, class: 'chart-label' }); start.textContent = points[0].date; chart.appendChild(start); var end = svgNode('text', { x: right, y: 286, 'text-anchor': 'end', class: 'chart-label' }); end.textContent = points[points.length - 1].date; chart.appendChild(end);
  }

  function renderAlerts(alerts) {
    var target = byId('alertList'); target.replaceChildren();
    if (!alerts || !alerts.length) { target.appendChild(node('div', 'alert-item success', '目前沒有需要處理的問題。')); return; }
    alerts.slice(0, 3).forEach(function (alert) { target.appendChild(node('div', 'alert-item ' + (alert.level || 'warning'), alert.message)); });
  }

  function renderSystemStatus(status) {
    var normal = !status.needsRecalc && status.dailyEnabled && ['PASS', 'SUCCESS'].indexOf(status.dailyStatus) >= 0;
    byId('systemStatusBar').textContent = '資料更新：' + (normal ? '正常' : '需留意') + '｜最後更新：' + dateTimeText(status.updatedAt) + '｜每日排程：' + (status.dailyEnabled ? (status.dailyStatus || '已啟用') : '未啟用');
  }

  function applyOverview(data, summaryOnly) {
    state.overview = summaryOnly && state.overview ? Object.assign({}, state.overview, { summary: data.summary, alerts: data.alerts, systemStatus: data.systemStatus }) : data;
    renderMetrics(data.summary); renderAllocation(summaryOnly && state.overview ? state.overview.allocation : data.allocation, data.summary.netAssetTwd); renderAlerts(data.alerts); renderSystemStatus(data.systemStatus); applyMeta({ needsRecalc: data.systemStatus.needsRecalc });
    if (!summaryOnly) { renderTrend('longTermTrendChart', data.longTermTrend); renderTrend('sixMonthTrendChart', data.sixMonthTrend); }
  }

  async function loadOverview(force) {
    setSync('讀取總覽…'); clearError(); if (force) api.invalidate('dashboard-overview');
    try { var result = await api.call('dashboard.getOverview', { cacheTtl: 45000, cacheKey: 'dashboard-overview', dedupeKey: 'dashboard-overview' }); applyOverview(result.data, false); setSync('已更新'); }
    catch (error) { showError(error); }
  }

  async function refreshOverviewSummary() {
    api.invalidate('dashboard-overview');
    try { var result = await api.call('dashboard.getOverview', { params: { summaryOnly: true }, dedupeKey: 'dashboard-summary-refresh' }); applyOverview(result.data, true); }
    catch (error) { showError(error); }
  }

  async function loadTransactions(page) {
    state.page.transactions = page || state.page.transactions; setSync('讀取交易…'); clearError();
    try {
      var params = paramsFromForm(byId('transactionFilters')); params.page = state.page.transactions; params.pageSize = 50;
      var result = await api.call('transactions.list', { params: params, dedupeKey: 'transactions' }); applyMeta(result.data.meta);
      renderTable('transactionTable', [
        { key: 'date', label: '日期' }, { key: 'assetCode', label: '標的' }, { key: 'type', label: '類型', format: uiFormat.transactionTypeText },
        { key: 'quantity', label: '數量', numeric: true, format: function (value) { return valueOrDash(value, decimal.format); } },
        { key: 'price', label: '單價', numeric: true, format: function (value, row) { return currencyText(value, row.tradeCurrency); } },
        { key: 'actualAmount', label: '實際入出金額', numeric: true, format: function (value, row) { return currencyText(value, row.tradeCurrency); } },
        { key: 'deletedAt', label: '狀態', format: function (value) { return value ? '已刪除' : '有效'; } }, { key: 'note', label: '備註' }
      ], result.data.items, function (row) {
        if (row.deletedAt) return [actionButton('還原', '', function () { confirmAction('確定還原這筆交易？', 'transactions.restore', { id: row.id }, loadTransactions, 'transactions'); })];
        return [actionButton('修改', '', function () { openEditor('transaction', 'update', row); }), actionButton('刪除', 'danger', function () { confirmAction('確定刪除這筆交易？此動作需要再次確認。', 'transactions.delete', { id: row.id }, loadTransactions, 'transactions'); })];
      });
      renderPager('transactionPager', result.data, loadTransactions); setSync('已更新');
    } catch (error) { showError(error); }
  }

  async function loadInstruments(page) {
    state.page.instruments = page || state.page.instruments; setSync('讀取投資標的…'); clearError();
    try {
      var params = paramsFromForm(byId('instrumentFilters')); params.page = state.page.instruments; params.pageSize = 40;
      var result = await api.call('instruments.list', { params: params, dedupeKey: 'instruments' });
      state.instruments = result.data.assets.items || []; applyMeta(result.data.meta);
      renderTable('performanceTable', [
        { key: 'category', label: '類別' }, { key: 'code', label: '代號' }, { key: 'name', label: '名稱' }, { key: 'status', label: '狀態' },
        { key: 'currentPrice', label: '目前價格', numeric: true, format: function (value) { return valueOrDash(value, decimal.format); } }, { key: 'priceDate', label: '價格日期' },
        { key: 'marketValueTwd', label: '目前市值', numeric: true, format: moneyText }, { key: 'totalPnlTwd', label: '累積損益', numeric: true, format: moneyText },
        { key: 'transactionReturn', label: '交易報酬率', numeric: true, format: percentText }, { key: 'xirr', label: 'XIRR', numeric: true, format: percentText }
      ], result.data.performance.items || []);
      renderTable('assetTable', [
        { key: 'code', label: '代號' }, { key: 'name', label: '名稱' }, { key: 'type', label: '類型', format: uiFormat.assetTypeText }, { key: 'tradeCurrency', label: '交易幣別' },
        { key: 'updatePrice', label: '更新價格', format: function (value) { return value ? '啟用' : '停用'; } }, { key: 'priceSource', label: '來源' }, { key: 'enabled', label: '狀態', format: function (value) { return value ? '啟用' : '停用'; } }
      ], result.data.assets.items || [], function (row) { var buttons = [actionButton('修改', '', function () { openEditor('asset', 'update', row); })]; if (row.enabled) buttons.push(actionButton('停用', 'danger', function () { confirmAction('確定停用 ' + row.code + '？', 'disableAsset', { code: row.code }, loadInstruments, 'instruments'); })); return buttons; });
      renderPager('performancePager', result.data.performance, loadInstruments); renderPager('assetPager', result.data.assets, loadInstruments); setSync('已更新');
    } catch (error) { showError(error); }
  }

  async function ensureInstrumentOptions() {
    if (state.instruments.length) return state.instruments;
    var result = await api.call('instruments.list', { params: { page: 1, pageSize: 50, status: 'all' }, dedupeKey: 'editor-instruments' }); state.instruments = result.data.assets.items || []; return state.instruments;
  }

  async function loadCashFlows(page) {
    state.page.cashflows = page || state.page.cashflows; setSync('讀取資金流水…'); clearError();
    try {
      var params = paramsFromForm(byId('cashFlowFilters')); params.page = state.page.cashflows; params.pageSize = 50;
      var result = await api.call('cashflows.list', { params: params, dedupeKey: 'cashflows' }); applyMeta(result.data.meta);
      renderTable('cashFlowTable', [
        { key: 'date', label: '日期' }, { key: 'type', label: '類型' }, { key: 'amount', label: '金額', numeric: true, format: function (value, row) { return currencyText(value, row.currency); } },
        { key: 'currency', label: '幣別' }, { key: 'amountTwd', label: 'TWD 金額', numeric: true, format: function (value) { return currencyText(value, 'TWD'); } },
        { key: 'deletedAt', label: '狀態', format: function (value) { return value ? '已刪除' : '有效'; } }, { key: 'note', label: '備註' }
      ], result.data.items, function (row) {
        if (row.deletedAt) return [actionButton('還原', '', function () { confirmAction('確定還原這筆流水？', 'cashflows.restore', { id: row.id }, loadCashFlows, 'cashflows'); })];
        return [actionButton('修改', '', function () { openEditor('cashflow', 'update', row); }), actionButton('刪除', 'danger', function () { confirmAction('確定刪除這筆流水？此動作需要再次確認。', 'cashflows.delete', { id: row.id }, loadCashFlows, 'cashflows'); })];
      });
      renderPager('cashFlowPager', result.data, loadCashFlows); setSync('已更新');
    } catch (error) { showError(error); }
  }

  function infoRows(targetId, rows) { var target = byId(targetId); target.replaceChildren(); rows.forEach(function (row) { var item = node('div', 'status-item'); item.append(node('span', '', row[0]), node('strong', '', row[1])); target.appendChild(item); }); }

  async function loadSystem() {
    setSync('讀取系統狀態…'); clearError();
    try {
      var result = await api.call('system.getStatus', { dedupeKey: 'system-status' }); var data = result.data; applyMeta(data.meta);
      infoRows('accountSecurityStatus', [['登入方式', '帳號密碼＋Session'], ['驗證模式', data.auth.mode], ['有效裝置', data.auth.activeSessions + ' / ' + data.auth.maximumSessions], ['登入鎖定', data.auth.locked ? '已鎖定' : '正常']]);
      var jobs = data.jobs; var target = byId('jobCards'); target.replaceChildren();
      target.append(jobCard('每日排程', [['啟用', jobs.daily.enabled ? '是' : '否'], ['時間', jobs.daily.time], ['最近執行', dateTimeText(jobs.daily.lastRunAt)], ['狀態', valueOrDash(jobs.daily.status)]]));
      target.append(jobCard('市場更新', [['狀態', jobs.marketRefresh.status], ['完成時間', dateTimeText(jobs.marketRefresh.finishedAt)], ['錯誤', valueOrDash(jobs.marketRefresh.error)]]));
      target.append(jobCard('持倉重算', [['狀態', jobs.rebuild.status], ['完成時間', dateTimeText(jobs.rebuild.finishedAt)], ['待重算', jobs.needsRecalc ? '是' : '否']]));
      infoRows('systemInfo', [['系統版本', data.version], ['結構版本', data.schemaVersion], ['最後驗證', dateTimeText(data.meta.lastValidationAt)], ['驗證狀態', valueOrDash(data.meta.lastValidationStatus)]]);
      byId('technicalInfoBody').textContent = JSON.stringify({ systemMode: jobs.systemMode, marketRefresh: jobs.marketRefresh, rebuild: jobs.rebuild, trendCursor: jobs.trendCursor }, null, 2);
      await window.AssetRecordBackupRestorePage.load(); setSync('已更新');
    } catch (error) { showError(error); }
  }

  function jobCard(title, rows) { var card = node('article', 'job-card'); card.appendChild(node('h3', '', title)); var list = node('dl'); rows.forEach(function (row) { list.append(node('dt', '', row[0]), node('dd', '', row[1])); }); card.appendChild(list); return card; }

  var editorDefinitions = {
    asset: [
      { name: 'code', label: '標的代號', required: true }, { name: 'name', label: '標的名稱', required: true }, { name: 'type', label: '標的類型', type: 'select', required: true, options: [['tw_stock', '台股'], ['us_stock', '美股'], ['fund', '基金']] },
      { name: 'tradeCurrency', label: '交易幣別', required: true }, { name: 'navCurrency', label: '淨值幣別', required: true }, { name: 'fundId', label: '基金 ID' }, { name: 'priceSource', label: '價格來源' }, { name: 'fundCategory', label: '基金屬性' },
      { name: 'enabled', label: '啟用', type: 'checkbox' }, { name: 'updatePrice', label: '更新淨值', type: 'checkbox' }, { name: 'note', label: '備註', type: 'textarea', full: true }
    ],
    transaction: [
      { name: 'date', label: '交易日期', type: 'date', required: true }, { name: 'assetCode', label: '投資標的', type: 'asset-select', required: true }, { name: 'type', label: '交易類型', type: 'select', required: true, options: [['buy', '買進'], ['sell', '賣出'], ['dividend', '現金股利'], ['stock_dividend', '股票股利'], ['split', '分割'], ['reverse_split', '反向分割'], ['adjustment', '現金調整']] },
      { name: 'quantity', label: '數量', type: 'number' }, { name: 'price', label: '單價', type: 'number' }, { name: 'fee', label: '手續費', type: 'number' }, { name: 'actualAmount', label: '實際入出金額', type: 'number' },
      { name: 'note', label: '備註', type: 'textarea', full: true }, { name: 'splitBefore', label: '分割前股數', type: 'number' }, { name: 'splitAfter', label: '分割後股數', type: 'number' }
    ],
    cashflow: [
      { name: 'date', label: '日期', type: 'date', required: true }, { name: 'type', label: '類型', type: 'select', required: true, options: [['入金', '入金'], ['出金', '出金']] }, { name: 'amount', label: '金額', type: 'number', required: true },
      { name: 'currency', label: '幣別', type: 'select', required: true, options: ['TWD', 'USD', 'JPY', 'EUR', 'GBP', 'CNY', 'HKD'].map(function (value) { return [value, value]; }) }, { name: 'fxRate', label: '換算匯率', type: 'number', required: true }, { name: 'note', label: '備註', type: 'textarea', full: true }
    ]
  };

  async function openEditor(kind, mode, item) {
    if (kind === 'transaction') { setSync('載入標的…'); try { await ensureInstrumentOptions(); } catch (error) { showError(error); return; } }
    state.editor = { kind: kind, mode: mode, item: item || {}, manualAmount: Boolean(item && item.manualAmount) };
    byId('editorTitle').textContent = (mode === 'create' ? '新增' : '修改') + ({ asset: '投資標的', transaction: '交易', cashflow: '資金流水' }[kind]); byId('editorError').textContent = '';
    var fields = byId('editorFields'); fields.replaceChildren(); editorDefinitions[kind].forEach(function (definition) { fields.appendChild(editorField(definition, item || {}, mode)); });
    byId('editorDialog').classList.toggle('transaction-drawer', kind === 'transaction');
    if (kind === 'transaction') {
      ['type', 'assetCode', 'quantity', 'price', 'fee', 'actualAmount'].forEach(function (name) { byId('edit-' + name).addEventListener(name === 'actualAmount' ? 'input' : 'change', function () { if (name === 'actualAmount') state.editor.manualAmount = true; syncTransactionFields(); }); }); syncTransactionFields();
    }
    if (kind === 'cashflow') { byId('edit-currency').addEventListener('change', syncCashCurrency); syncCashCurrency(); }
    byId('editorDialog').showModal(); setSync('準備就緒');
  }

  function editorField(definition, item, mode) {
    var wrapper = node('label', definition.full ? 'full' : ''); wrapper.dataset.field = definition.name; var input;
    if (definition.type === 'checkbox') { wrapper.className += ' checkbox-field'; input = document.createElement('input'); input.type = 'checkbox'; input.checked = item[definition.name] == null ? definition.name === 'enabled' : Boolean(item[definition.name]); wrapper.append(input, node('span', '', definition.label)); }
    else {
      wrapper.appendChild(node('span', '', definition.label));
      if (definition.type === 'select' || definition.type === 'asset-select') {
        input = document.createElement('select'); var options = definition.type === 'asset-select' ? state.instruments.map(function (asset) { return [asset.code, asset.code + '｜' + asset.name + '｜' + uiFormat.assetTypeText(asset.type)]; }) : definition.options;
        if (definition.type === 'asset-select') { var placeholder = node('option', '', '請選擇投資標的'); placeholder.value = ''; placeholder.disabled = true; input.appendChild(placeholder); }
        options.forEach(function (option) { var optionNode = node('option', '', option[1]); optionNode.value = option[0]; input.appendChild(optionNode); });
      } else if (definition.type === 'textarea') { input = document.createElement('textarea'); input.rows = 3; }
      else { input = document.createElement('input'); input.type = definition.type || 'text'; if (definition.type === 'number') input.step = 'any'; }
      var initial = item[definition.name];
      if (initial == null && mode === 'create') { if (definition.name === 'date') initial = new Date().toISOString().slice(0, 10); if (definition.name === 'type') initial = state.editor.kind === 'transaction' ? 'buy' : (state.editor.kind === 'cashflow' ? '入金' : 'tw_stock'); if (['tradeCurrency', 'navCurrency', 'currency'].indexOf(definition.name) >= 0) initial = 'TWD'; if (definition.name === 'fxRate') initial = 1; }
      input.value = initial == null ? '' : String(initial); input.required = Boolean(definition.required); if (definition.name === 'code' && mode === 'update') input.disabled = true; wrapper.appendChild(input); wrapper.appendChild(node('small', 'field-error', ''));
    }
    input.id = 'edit-' + definition.name; input.name = definition.name; return wrapper;
  }

  function syncCashCurrency() { var currency = byId('edit-currency'), fx = byId('edit-fxRate'); if (currency.value === 'TWD') { fx.value = 1; fx.readOnly = true; } else fx.readOnly = false; }

  function syncTransactionFields() {
    var type = byId('edit-type').value; var visible = { quantity: ['buy', 'sell', 'stock_dividend'].indexOf(type) >= 0, price: ['buy', 'sell'].indexOf(type) >= 0, fee: ['buy', 'sell'].indexOf(type) >= 0, actualAmount: ['buy', 'sell', 'dividend', 'adjustment'].indexOf(type) >= 0, splitBefore: ['split', 'reverse_split'].indexOf(type) >= 0, splitAfter: ['split', 'reverse_split'].indexOf(type) >= 0 };
    Object.keys(visible).forEach(function (name) { var input = byId('edit-' + name); var wrapper = input.closest('label'); wrapper.hidden = !visible[name]; input.required = visible[name] && ['fee', 'actualAmount'].indexOf(name) < 0; });
    var asset = state.instruments.find(function (item) { return item.code === byId('edit-assetCode').value; });
    var quantity = Number(byId('edit-quantity').value || 0), price = Number(byId('edit-price').value || 0), fee = Number(byId('edit-fee').value || 0); var estimate = quantity * price + fee;
    if (type === 'sell') estimate = quantity * price - fee; if (type === 'buy') estimate = -estimate;
    var estimateBox = byId('transactionEstimate'); estimateBox.hidden = ['buy', 'sell'].indexOf(type) < 0; estimateBox.textContent = '即時試算：' + currencyText(estimate, asset ? asset.tradeCurrency : 'TWD') + (asset ? '｜' + uiFormat.assetTypeText(asset.type) + '｜' + asset.tradeCurrency : '');
    if (!state.editor.manualAmount && ['buy', 'sell'].indexOf(type) >= 0) byId('edit-actualAmount').value = estimate ? String(estimate) : '';
  }

  function validateEditorFields() {
    var valid = true;
    editorDefinitions[state.editor.kind].forEach(function (definition) { var input = byId('edit-' + definition.name); if (!input || input.closest('label').hidden) return; var error = input.closest('label').querySelector('.field-error'); if (!error) return; error.textContent = ''; if (input.required && !String(input.value).trim()) { error.textContent = '此欄位必填'; valid = false; } if (definition.type === 'number' && input.required && !(Number(input.value) > 0)) { error.textContent = '請輸入大於 0 的數值'; valid = false; } });
    return valid;
  }

  function editorPayload() {
    var payload = {};
    editorDefinitions[state.editor.kind].forEach(function (definition) { var input = byId('edit-' + definition.name); if (!input || (input.disabled && definition.name !== 'code') || input.closest('label').hidden) return; if (definition.type === 'checkbox') payload[definition.name] = input.checked; else if (definition.type === 'number') { if (input.value !== '') payload[definition.name] = Number(input.value); } else payload[definition.name] = input.value.trim(); });
    if (state.editor.kind === 'transaction') payload.manualAmount = state.editor.manualAmount || ['dividend', 'adjustment'].indexOf(payload.type) >= 0;
    if (state.editor.kind === 'cashflow' && payload.currency === 'TWD') payload.fxRate = 1; return payload;
  }

  async function saveEditor(event) {
    event.preventDefault(); if (!validateEditorFields()) return; var button = byId('saveEditor'); setButtonBusy(button, true); byId('editorError').textContent = '';
    try {
      var editor = state.editor, payload = editorPayload(), action, params = {};
      if (editor.kind === 'asset') { action = editor.mode === 'create' ? 'createAsset' : 'updateAsset'; if (editor.mode === 'update') params.code = editor.item.code; }
      if (editor.kind === 'transaction') { action = editor.mode === 'create' ? 'transactions.create' : 'transactions.update'; if (editor.mode === 'update') params.id = editor.item.id; }
      if (editor.kind === 'cashflow') { action = editor.mode === 'create' ? 'cashflows.create' : 'cashflows.update'; if (editor.mode === 'update') params.id = editor.item.id; }
      await api.call(action, { params: params, payload: payload, dedupeKey: 'editor-save' }); byId('editorDialog').close(); byId('recalcWarning').hidden = false; api.invalidate();
      if (editor.kind === 'transaction') await Promise.all([loadTransactions(), refreshOverviewSummary()]); else if (editor.kind === 'cashflow') await Promise.all([loadCashFlows(), refreshOverviewSummary()]); else await loadInstruments();
    } catch (error) { byId('editorError').textContent = errorMessage(error); }
    finally { setButtonBusy(button, false); }
  }

  async function confirmAction(message, action, params, reload, cacheArea) {
    if (!window.confirm(message)) return; clearError();
    try { await api.call(action, { params: params, dedupeKey: action + ':' + JSON.stringify(params) }); byId('recalcWarning').hidden = false; api.invalidate(cacheArea); await Promise.all([reload(), refreshOverviewSummary()]); }
    catch (error) { showError(error); }
  }

  async function queueJob(action, button, elevatedToken) {
    if (!window.confirm('確定將這項工作排入每日排程？')) return; setButtonBusy(button, true); clearError();
    try { await api.call(action, { elevatedToken: elevatedToken || '', dedupeKey: action }); api.invalidate('system'); await loadSystem(); }
    catch (error) { showError(error); } finally { setButtonBusy(button, false); }
  }

  function currentLoader() { return { overview: loadOverview, transactions: loadTransactions, instruments: loadInstruments, cashflows: loadCashFlows, system: loadSystem }[state.view]; }
  function switchView(view) { state.view = view; document.querySelectorAll('.view-tabs button').forEach(function (button) { button.classList.toggle('active', button.dataset.view === view); }); document.querySelectorAll('.view').forEach(function (section) { var active = section.id === 'view-' + view; section.hidden = !active; section.classList.toggle('active-view', active); }); currentLoader()(); }

  function openReauth(scope, title, callback) { state.reauth = { scope: scope, callback: callback }; byId('reauthTitle').textContent = title; byId('reauthForm').reset(); byId('reauthUsername').value = state.username; byId('reauthError').textContent = ''; byId('reauthDialog').showModal(); }
  async function submitReauth(event) { event.preventDefault(); var button = byId('submitReauth'); setButtonBusy(button, true, '驗證中…'); var passwordInput = byId('reauthPassword'); var username = byId('reauthUsername').value.trim(); var password = passwordInput.value; try { var result = await auth.elevate(username, password, state.reauth.scope); state.username = username; password = ''; passwordInput.value = ''; byId('reauthDialog').close(); await state.reauth.callback(result.data.elevatedToken); } catch (error) { password = ''; passwordInput.value = ''; byId('reauthError').textContent = '帳號或密碼錯誤，請稍後再試。'; } finally { setButtonBusy(button, false); } }

  function resetChangePasswordForm() {
    byId('changePasswordForm').reset();
    byId('newPassword').type = 'password';
    byId('confirmNewPassword').type = 'password';
    byId('toggleNewPasswords').textContent = '顯示密碼';
    byId('changePasswordError').textContent = '';
  }
  function closeChangePassword() { state.changePasswordToken = ''; resetChangePasswordForm(); byId('changePasswordDialog').close(); }
  async function submitChangePassword(event) {
    event.preventDefault(); var button = byId('submitChangePassword'); var passwordInput = byId('newPassword'); var confirmationInput = byId('confirmNewPassword'); var password = passwordInput.value; var confirmation = confirmationInput.value; var length = Array.from(password).length; byId('changePasswordError').textContent = '';
    if (length < 8 || length > 128) { byId('changePasswordError').textContent = '密碼長度必須為 8 至 128 個 Unicode 字元。'; return; }
    if (password !== confirmation) { byId('changePasswordError').textContent = '兩次輸入的新密碼不一致。'; return; }
    setButtonBusy(button, true, '安全派生中…');
    try { await auth.changePassword(state.changePasswordToken, state.username, password); password = ''; confirmation = ''; passwordInput.value = ''; confirmationInput.value = ''; closeChangePassword(); window.AssetRecordLoginPage.show(); }
    catch (_error) { password = ''; confirmation = ''; passwordInput.value = ''; confirmationInput.value = ''; byId('changePasswordError').textContent = '密碼變更失敗，請重新驗證後再試。'; state.changePasswordToken = ''; }
    finally { setButtonBusy(button, false); }
  }

  async function logout() { await auth.logout(); window.AssetRecordLoginPage.show(); }
  async function authenticatedStart(session) { state.username = byId('loginUsername').value.trim() || (session && session.username) || ''; await loadOverview(); }

  window.AssetRecordLoginPage.init(authenticatedStart);
  byId('logoutButton').addEventListener('click', logout);
  document.querySelectorAll('.view-tabs button').forEach(function (button) { button.addEventListener('click', function () { switchView(button.dataset.view); }); });
  document.querySelectorAll('.refresh-view').forEach(function (button) { button.addEventListener('click', function () { currentLoader()(true); }); });
  byId('transactionFilters').addEventListener('submit', function (event) { event.preventDefault(); loadTransactions(1); });
  byId('instrumentFilters').addEventListener('submit', function (event) { event.preventDefault(); loadInstruments(1); });
  byId('cashFlowFilters').addEventListener('submit', function (event) { event.preventDefault(); loadCashFlows(1); });
  byId('newAsset').addEventListener('click', function () { openEditor('asset', 'create', {}); });
  byId('newTransaction').addEventListener('click', function () { openEditor('transaction', 'create', {}); });
  byId('newCashFlow').addEventListener('click', function () { openEditor('cashflow', 'create', {}); });
  byId('editorForm').addEventListener('submit', saveEditor); byId('closeEditor').addEventListener('click', function () { byId('editorDialog').close(); }); byId('cancelEditor').addEventListener('click', function () { byId('editorDialog').close(); });
  byId('requestRebuild').addEventListener('click', function () { openReauth('snapshots', '完整歷史重建', function (token) { return queueJob('snapshots.rebuildAll', byId('requestRebuild'), token); }); }); byId('requestMarket').addEventListener('click', function () { queueJob('system.requestMarketRefresh', byId('requestMarket')); });
  byId('reauthForm').addEventListener('submit', submitReauth); byId('closeReauth').addEventListener('click', function () { byId('reauthDialog').close(); }); byId('cancelReauth').addEventListener('click', function () { byId('reauthDialog').close(); });
  byId('logoutAllDevices').addEventListener('click', function () { openReauth('account', '登出所有裝置', async function (token) { await auth.logoutAll(token); window.AssetRecordLoginPage.show(); }); });
  byId('changePassword').addEventListener('click', function () { openReauth('password', '變更網頁登入密碼', function (token) { state.changePasswordToken = token; resetChangePasswordForm(); byId('changePasswordDialog').showModal(); }); });
  byId('changePasswordForm').addEventListener('submit', submitChangePassword); byId('closeChangePassword').addEventListener('click', closeChangePassword); byId('cancelChangePassword').addEventListener('click', closeChangePassword);
  byId('toggleNewPasswords').addEventListener('click', function () { var visible = byId('newPassword').type === 'text'; byId('newPassword').type = visible ? 'password' : 'text'; byId('confirmNewPassword').type = visible ? 'password' : 'text'; this.textContent = visible ? '顯示密碼' : '隱藏密碼'; });

  window.AssetRecordAuthGuard.restore(authenticatedStart);
})();
