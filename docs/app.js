(function () {
  'use strict';

  var api = window.AssetRecordApi;
  var state = { view: 'overview', page: { performance: 1, assets: 1, transactions: 1, cashflows: 1 }, editor: null };
  var money = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
  var decimal = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 4 });
  var percent = new Intl.NumberFormat('zh-TW', { style: 'percent', maximumFractionDigits: 2 });

  function byId(id) { return document.getElementById(id); }
  function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = String(text);
    return element;
  }
  function svgNode(tag, attributes) {
    var element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attributes || {}).forEach(function (key) { element.setAttribute(key, String(attributes[key])); });
    return element;
  }
  function valueOrDash(value, formatter) { return value == null || value === '' ? '—' : (formatter || String)(value); }
  function moneyText(value) { return valueOrDash(value, function (number) { return 'NT$ ' + money.format(number); }); }
  function dateTimeText(value) { return value ? String(value).replace('T', ' ').replace('+08:00', '') : '—'; }
  function errorMessage(error) { return error && error.message ? error.message : '操作失敗'; }

  function setSync(text) { byId('syncState').textContent = text; }
  function showError(error) {
    var box = byId('globalError');
    box.textContent = errorMessage(error);
    box.hidden = false;
    setSync('發生錯誤');
  }
  function clearError() { byId('globalError').hidden = true; byId('globalError').textContent = ''; }
  function applyMeta(meta) {
    if (!meta) return;
    byId('recalcWarning').hidden = !meta.needsRecalc;
  }
  function setButtonBusy(button, busy) {
    if (!button) return;
    if (busy) button.dataset.originalText = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? '處理中…' : (button.dataset.originalText || button.textContent);
  }

  function paramsFromForm(form) {
    var params = {};
    new FormData(form).forEach(function (value, key) {
      var text = String(value).trim();
      if (text !== '') params[key] = text;
    });
    return params;
  }

  function actionButton(label, className, handler) {
    var button = node('button', className, label);
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
  }

  function renderTable(containerId, columns, rows, actions) {
    var container = byId(containerId);
    container.replaceChildren();
    if (!rows.length) { container.appendChild(node('div', 'empty-state', '沒有符合條件的資料')); return; }
    var table = node('table');
    var head = node('thead');
    var headRow = node('tr');
    columns.forEach(function (column) { headRow.appendChild(node('th', '', column.label)); });
    if (actions) headRow.appendChild(node('th', '', '操作'));
    head.appendChild(headRow);
    table.appendChild(head);
    var body = node('tbody');
    rows.forEach(function (row) {
      var tr = node('tr');
      columns.forEach(function (column) {
        var value = column.format ? column.format(row[column.key], row) : valueOrDash(row[column.key]);
        tr.appendChild(node('td', column.numeric ? 'numeric' : '', value));
      });
      if (actions) {
        var cell = node('td');
        var group = node('div', 'row-actions');
        actions(row).forEach(function (button) { group.appendChild(button); });
        cell.appendChild(group); tr.appendChild(cell);
      }
      body.appendChild(tr);
    });
    table.appendChild(body); container.appendChild(table);
  }

  function renderPager(containerId, data, onPage) {
    var container = byId(containerId); container.replaceChildren();
    container.appendChild(node('span', 'muted', '第 ' + data.page + ' / ' + data.totalPages + ' 頁，共 ' + data.total + ' 筆'));
    var buttons = node('div');
    var previous = actionButton('上一頁', 'ghost', function () { onPage(data.page - 1); }); previous.disabled = data.page <= 1;
    var next = actionButton('下一頁', 'ghost', function () { onPage(data.page + 1); }); next.disabled = !data.hasNext;
    buttons.append(previous, next); container.appendChild(buttons);
  }

  async function loadOverview() {
    setSync('讀取總覽…'); clearError();
    try {
      var results = await Promise.all([
        api.call('getDashboardSummary', { dedupeKey: 'overview-summary' }),
        api.call('getTrendData', { params: { page: 1, pageSize: 100 }, dedupeKey: 'overview-trend' })
      ]);
      var summary = results[0].data.summary;
      applyMeta(results[0].data.meta);
      renderMetrics(summary);
      renderAllocation(summary.allocation, summary.netAssetTwd);
      renderTrend(results[1].data.items);
      byId('overviewMeta').textContent = '最後更新：' + dateTimeText(summary.updatedAt) + '　持倉價格最舊日期：' + valueOrDash(summary.oldestPriceDate) + (summary.warning ? '　警告：' + summary.warning : '');
      setSync('已更新');
    } catch (error) { showError(error); }
  }

  function renderMetrics(summary) {
    var cards = [
      ['投資淨資產', moneyText(summary.netAssetTwd)], ['外部淨投入', moneyText(summary.externalNetContributionTwd)],
      ['累積投資成果', moneyText(summary.investmentResultTwd)], ['投資組合 XIRR', valueOrDash(summary.xirr, percent.format)],
      ['投資部位市值', moneyText(summary.marketValueTwd)], ['投資池現金', moneyText(summary.cashTwd)],
      ['累積總損益', moneyText(summary.totalPnlTwd)], ['整體投資報酬率', valueOrDash(summary.totalReturn, percent.format)]
    ];
    var target = byId('metricCards'); target.replaceChildren();
    cards.forEach(function (item) {
      var card = node('article', 'metric-card'); card.append(node('span', 'label', item[0]), node('strong', '', item[1])); target.appendChild(card);
    });
  }

  function renderAllocation(allocation, netAsset) {
    var rows = [['台股', allocation.twStockTwd], ['美股', allocation.usStockTwd], ['基金', allocation.fundTwd], ['現金', allocation.cashTwd]];
    var target = byId('allocationList'); target.replaceChildren();
    rows.forEach(function (item) {
      var ratio = netAsset > 0 && item[1] != null ? Math.max(0, item[1] / netAsset) : 0;
      var row = node('div', 'allocation-row');
      row.appendChild(node('span', '', item[0]));
      var track = node('div', 'allocation-track'); var fill = node('div', 'allocation-fill'); fill.style.width = Math.min(100, ratio * 100) + '%'; track.appendChild(fill); row.appendChild(track);
      row.appendChild(node('span', '', item[1] == null ? '—' : percent.format(ratio))); target.appendChild(row);
    });
  }

  function renderTrend(rows) {
    var chart = byId('trendChart'); chart.replaceChildren();
    var points = rows.filter(function (row) { return row.netAssetTwd != null && row.externalNetContributionTwd != null; });
    if (points.length < 2) { chart.appendChild(svgNode('text', { x: 380, y: 150, 'text-anchor': 'middle', class: 'chart-label' })).textContent = '趨勢資料不足'; return; }
    var values = [];
    points.forEach(function (row) { values.push(row.netAssetTwd, row.externalNetContributionTwd); });
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values); if (min === max) max = min + 1;
    var left = 58, right = 738, top = 24, bottom = 260;
    for (var grid = 0; grid <= 4; grid++) {
      var y = top + (bottom - top) * grid / 4;
      chart.appendChild(svgNode('line', { x1: left, x2: right, y1: y, y2: y, class: 'chart-grid' }));
      var label = svgNode('text', { x: left - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-label' }); label.textContent = money.format(max - (max - min) * grid / 4); chart.appendChild(label);
    }
    function linePath(key) {
      return points.map(function (row, index) {
        var x = left + (right - left) * index / (points.length - 1);
        var y = bottom - (row[key] - min) / (max - min) * (bottom - top);
        return (index ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
      }).join(' ');
    }
    chart.appendChild(svgNode('path', { d: linePath('netAssetTwd'), class: 'chart-net' }));
    chart.appendChild(svgNode('path', { d: linePath('externalNetContributionTwd'), class: 'chart-contribution' }));
    var start = svgNode('text', { x: left, y: 286, class: 'chart-label' }); start.textContent = points[0].date; chart.appendChild(start);
    var end = svgNode('text', { x: right, y: 286, 'text-anchor': 'end', class: 'chart-label' }); end.textContent = points[points.length - 1].date; chart.appendChild(end);
  }

  async function loadPerformance(page) {
    state.page.performance = page || state.page.performance; setSync('讀取績效…'); clearError();
    try {
      var params = paramsFromForm(byId('performanceFilters')); params.page = state.page.performance; params.pageSize = 25;
      var result = await api.call('getPerformanceList', { params: params, dedupeKey: 'performance' }); applyMeta(result.data.meta);
      renderTable('performanceTable', [
        { key: 'category', label: '類別' }, { key: 'code', label: '代號' }, { key: 'name', label: '名稱' }, { key: 'status', label: '狀態' },
        { key: 'marketValueTwd', label: '目前市值', numeric: true, format: moneyText }, { key: 'totalPnlTwd', label: '累積損益', numeric: true, format: moneyText },
        { key: 'transactionReturn', label: '交易報酬率', numeric: true, format: function (value) { return valueOrDash(value, percent.format); } },
        { key: 'xirr', label: 'XIRR', numeric: true, format: function (value) { return valueOrDash(value, percent.format); } }, { key: 'priceDate', label: '價格日期' }
      ], result.data.items);
      renderPager('performancePager', result.data, loadPerformance); setSync('已更新');
    } catch (error) { showError(error); }
  }

  async function loadAssets(page) {
    state.page.assets = page || state.page.assets; setSync('讀取標的…'); clearError();
    try {
      var params = paramsFromForm(byId('assetFilters')); params.page = state.page.assets; params.pageSize = 25;
      var result = await api.call('listAssets', { params: params, dedupeKey: 'assets' }); applyMeta(result.data.meta);
      renderTable('assetTable', [
        { key: 'code', label: '代號' }, { key: 'name', label: '名稱' }, { key: 'type', label: '類型' }, { key: 'tradeCurrency', label: '交易幣別' },
        { key: 'navCurrency', label: '淨值幣別' }, { key: 'enabled', label: '狀態', format: function (value) { return value ? '啟用' : '停用'; } }, { key: 'note', label: '備註' }
      ], result.data.items, function (row) {
        var buttons = [actionButton('修改', '', function () { openEditor('asset', 'update', row); })];
        if (row.enabled) buttons.push(actionButton('停用', 'danger', function () { confirmAction('確定停用 ' + row.code + '？', 'disableAsset', { code: row.code }, loadAssets); }));
        return buttons;
      });
      renderPager('assetPager', result.data, loadAssets); setSync('已更新');
    } catch (error) { showError(error); }
  }

  async function loadTransactions(page) {
    state.page.transactions = page || state.page.transactions; setSync('讀取交易…'); clearError();
    try {
      var params = paramsFromForm(byId('transactionFilters')); params.page = state.page.transactions; params.pageSize = 25;
      var result = await api.call('listTransactions', { params: params, dedupeKey: 'transactions' }); applyMeta(result.data.meta);
      renderTable('transactionTable', [
        { key: 'date', label: '日期' }, { key: 'id', label: '交易 ID' }, { key: 'assetCode', label: '標的' }, { key: 'type', label: '類型' },
        { key: 'quantity', label: '數量', numeric: true, format: function (value) { return valueOrDash(value, decimal.format); } },
        { key: 'price', label: '單價', numeric: true, format: function (value) { return valueOrDash(value, decimal.format); } },
        { key: 'actualAmount', label: '實際入出金額', numeric: true, format: function (value) { return valueOrDash(value, decimal.format); } },
        { key: 'deletedAt', label: '狀態', format: function (value) { return value ? '已刪除' : '有效'; } }, { key: 'note', label: '備註' }
      ], result.data.items, function (row) {
        if (row.deletedAt) return [actionButton('還原', '', function () { confirmAction('確定還原這筆交易？', 'restoreTransaction', { id: row.id }, loadTransactions); })];
        return [actionButton('修改', '', function () { openEditor('transaction', 'update', row); }), actionButton('刪除', 'danger', function () { confirmAction('確定軟刪除這筆交易？', 'deleteTransaction', { id: row.id }, loadTransactions); })];
      });
      renderPager('transactionPager', result.data, loadTransactions); setSync('已更新');
    } catch (error) { showError(error); }
  }

  async function loadCashFlows(page) {
    state.page.cashflows = page || state.page.cashflows; setSync('讀取外部流水…'); clearError();
    try {
      var params = paramsFromForm(byId('cashFlowFilters')); params.page = state.page.cashflows; params.pageSize = 25;
      var result = await api.call('listExternalCashFlows', { params: params, dedupeKey: 'cashflows' }); applyMeta(result.data.meta);
      renderTable('cashFlowTable', [
        { key: 'date', label: '日期' }, { key: 'id', label: '流水 ID' }, { key: 'type', label: '類型' }, { key: 'amount', label: '金額', numeric: true, format: function (value) { return valueOrDash(value, decimal.format); } },
        { key: 'currency', label: '幣別' }, { key: 'fxRate', label: '匯率', numeric: true, format: function (value) { return valueOrDash(value, decimal.format); } },
        { key: 'amountTwd', label: 'TWD 金額', numeric: true, format: moneyText }, { key: 'deletedAt', label: '狀態', format: function (value) { return value ? '已刪除' : '有效'; } }, { key: 'note', label: '備註' }
      ], result.data.items, function (row) {
        if (row.deletedAt) return [actionButton('還原', '', function () { confirmAction('確定還原這筆外部流水？', 'restoreExternalCashFlow', { id: row.id }, loadCashFlows); })];
        return [actionButton('修改', '', function () { openEditor('cashflow', 'update', row); }), actionButton('刪除', 'danger', function () { confirmAction('確定軟刪除這筆外部流水？', 'deleteExternalCashFlow', { id: row.id }, loadCashFlows); })];
      });
      renderPager('cashFlowPager', result.data, loadCashFlows); setSync('已更新');
    } catch (error) { showError(error); }
  }

  async function loadJobs() {
    setSync('讀取工作狀態…'); clearError();
    try {
      var result = await api.call('getJobStatus', { dedupeKey: 'jobs' }); applyMeta({ needsRecalc: result.data.needsRecalc });
      var target = byId('jobCards'); target.replaceChildren();
      target.append(jobCard('每日工作', [['啟用', result.data.daily.enabled ? '是' : '否'], ['時間', result.data.daily.time], ['最近執行', dateTimeText(result.data.daily.lastRunAt)], ['狀態', valueOrDash(result.data.daily.status)]]));
      target.append(jobCard('市場更新', [['狀態', result.data.marketRefresh.status], ['要求時間', dateTimeText(result.data.marketRefresh.requestedAt)], ['完成時間', dateTimeText(result.data.marketRefresh.finishedAt)], ['錯誤', valueOrDash(result.data.marketRefresh.error)]]));
      target.append(jobCard('目前狀態重算', [['狀態', result.data.rebuild.status], ['要求時間', dateTimeText(result.data.rebuild.requestedAt)], ['完成時間', dateTimeText(result.data.rebuild.finishedAt)], ['待重算', result.data.needsRecalc ? '是' : '否']]));
      setSync('已更新');
    } catch (error) { showError(error); }
  }
  function jobCard(title, rows) {
    var card = node('article', 'job-card'); card.appendChild(node('h2', '', title)); var list = node('dl');
    rows.forEach(function (row) { list.append(node('dt', '', row[0]), node('dd', '', row[1])); }); card.appendChild(list); return card;
  }

  var editorDefinitions = {
    asset: [
      { name: 'code', label: '標的代號', required: true }, { name: 'name', label: '標的名稱', required: true },
      { name: 'type', label: '標的類型', type: 'select', required: true, options: [['tw_stock', '台股'], ['us_stock', '美股'], ['fund', '基金']] },
      { name: 'tradeCurrency', label: '交易幣別', required: true }, { name: 'navCurrency', label: '淨值幣別', required: true },
      { name: 'fundId', label: '基金 ID' }, { name: 'priceSource', label: '價格來源' }, { name: 'fundCategory', label: '基金屬性' },
      { name: 'enabled', label: '啟用', type: 'checkbox' }, { name: 'updatePrice', label: '更新淨值', type: 'checkbox' }, { name: 'note', label: '備註', type: 'textarea', full: true }
    ],
    transaction: [
      { name: 'date', label: '日期', type: 'date', required: true }, { name: 'assetCode', label: '標的代號', required: true },
      { name: 'type', label: '交易類型', type: 'select', required: true, options: [['buy', '買進'], ['sell', '賣出'], ['dividend', '現金股利'], ['stock_dividend', '股票股利'], ['split', '分割'], ['reverse_split', '反向分割'], ['adjustment', '現金調整']] },
      { name: 'bank', label: '交易銀行' }, { name: 'quantity', label: '數量', type: 'number' }, { name: 'price', label: '單價', type: 'number' },
      { name: 'fee', label: '手續費', type: 'number' }, { name: 'actualAmount', label: '實際入出金額', type: 'number' },
      { name: 'splitBefore', label: '分割前股數', type: 'number' }, { name: 'splitAfter', label: '分割後股數', type: 'number' },
      { name: 'manualAmount', label: '人工指定實際金額', type: 'checkbox' }, { name: 'note', label: '備註', type: 'textarea', full: true }
    ],
    cashflow: [
      { name: 'date', label: '日期', type: 'date', required: true }, { name: 'type', label: '類型', type: 'select', required: true, options: [['入金', '入金'], ['出金', '出金']] },
      { name: 'amount', label: '金額', type: 'number', required: true }, { name: 'currency', label: '幣別', type: 'select', required: true, options: ['TWD', 'USD', 'JPY', 'EUR', 'GBP', 'CNY', 'HKD'].map(function (value) { return [value, value]; }) },
      { name: 'fxRate', label: '換算匯率', type: 'number', required: true }, { name: 'note', label: '備註', type: 'textarea', full: true }
    ]
  };

  function openEditor(kind, mode, item) {
    state.editor = { kind: kind, mode: mode, item: item || {} };
    byId('editorTitle').textContent = (mode === 'create' ? '新增' : '修改') + ({ asset: '投資標的', transaction: '投資交易', cashflow: '外部流水' }[kind]);
    byId('editorError').textContent = '';
    var fields = byId('editorFields'); fields.replaceChildren();
    editorDefinitions[kind].forEach(function (definition) { fields.appendChild(editorField(definition, item || {}, mode)); });
    if (kind === 'transaction') {
      byId('edit-type').addEventListener('change', syncTransactionFields);
      byId('edit-manualAmount').addEventListener('change', syncTransactionFields);
      syncTransactionFields();
    }
    if (kind === 'cashflow') { byId('edit-currency').addEventListener('change', syncCashCurrency); syncCashCurrency(); }
    byId('editorDialog').showModal();
  }

  function editorField(definition, item, mode) {
    var wrapper = node('label', definition.full ? 'full' : ''); wrapper.dataset.field = definition.name;
    var input;
    if (definition.type === 'checkbox') {
      wrapper.className += ' checkbox-field'; input = document.createElement('input'); input.type = 'checkbox'; input.checked = item[definition.name] == null ? definition.name === 'enabled' : Boolean(item[definition.name]);
      wrapper.append(input, node('span', '', definition.label));
    } else {
      wrapper.appendChild(node('span', '', definition.label));
      if (definition.type === 'select') {
        input = document.createElement('select'); definition.options.forEach(function (option) { var itemOption = node('option', '', option[1]); itemOption.value = option[0]; input.appendChild(itemOption); });
      } else if (definition.type === 'textarea') { input = document.createElement('textarea'); input.rows = 3; }
      else { input = document.createElement('input'); input.type = definition.type || 'text'; if (definition.type === 'number') input.step = 'any'; }
      var initial = item[definition.name];
      if (initial == null && mode === 'create') {
        if (definition.name === 'date') initial = new Date().toISOString().slice(0, 10);
        if (definition.name === 'type') initial = item.type || (state.editor.kind === 'transaction' ? 'buy' : (state.editor.kind === 'cashflow' ? '入金' : 'tw_stock'));
        if (definition.name === 'tradeCurrency' || definition.name === 'navCurrency' || definition.name === 'currency') initial = 'TWD';
        if (definition.name === 'fxRate') initial = 1;
      }
      input.value = initial == null ? '' : String(initial); input.required = Boolean(definition.required);
      if (definition.name === 'code' && mode === 'update') input.disabled = true;
      wrapper.appendChild(input);
    }
    input.id = 'edit-' + definition.name; input.name = definition.name; return wrapper;
  }

  function syncCashCurrency() {
    var currency = byId('edit-currency'); var fx = byId('edit-fxRate'); if (currency.value === 'TWD') { fx.value = 1; fx.readOnly = true; } else fx.readOnly = false;
  }
  function syncTransactionFields() {
    var type = byId('edit-type').value; var manual = byId('edit-manualAmount');
    if (type === 'adjustment') { manual.checked = true; manual.disabled = true; } else manual.disabled = false;
    var visible = {
      quantity: ['buy', 'sell', 'stock_dividend'].indexOf(type) >= 0,
      price: ['buy', 'sell'].indexOf(type) >= 0,
      fee: ['buy', 'sell'].indexOf(type) >= 0,
      actualAmount: type === 'dividend' || type === 'adjustment' || (['buy', 'sell'].indexOf(type) >= 0 && manual.checked),
      splitBefore: ['split', 'reverse_split'].indexOf(type) >= 0,
      splitAfter: ['split', 'reverse_split'].indexOf(type) >= 0
    };
    Object.keys(visible).forEach(function (name) { var wrapper = byId('edit-' + name).closest('label'); wrapper.hidden = !visible[name]; byId('edit-' + name).required = visible[name] && name !== 'fee'; });
  }

  function editorPayload() {
    var payload = {};
    editorDefinitions[state.editor.kind].forEach(function (definition) {
      var input = byId('edit-' + definition.name); if (!input || input.disabled && !(state.editor.kind === 'transaction' && definition.name === 'manualAmount')) return;
      if (input.closest('label').hidden) return;
      if (definition.type === 'checkbox') payload[definition.name] = input.checked;
      else if (definition.type === 'number') { if (input.value !== '') payload[definition.name] = Number(input.value); }
      else payload[definition.name] = input.value.trim();
    });
    if (state.editor.kind === 'transaction' && byId('edit-type').value === 'adjustment') payload.manualAmount = true;
    if (state.editor.kind === 'cashflow' && payload.currency === 'TWD') payload.fxRate = 1;
    return payload;
  }

  async function saveEditor(event) {
    event.preventDefault(); var button = byId('saveEditor'); setButtonBusy(button, true); byId('editorError').textContent = '';
    try {
      var editor = state.editor; var payload = editorPayload(); var action; var params = {};
      if (editor.kind === 'asset') { action = editor.mode === 'create' ? 'createAsset' : 'updateAsset'; if (editor.mode === 'update') params.code = editor.item.code; }
      if (editor.kind === 'transaction') { action = editor.mode === 'create' ? 'createTransaction' : 'updateTransaction'; if (editor.mode === 'update') params.id = editor.item.id; }
      if (editor.kind === 'cashflow') { action = editor.mode === 'create' ? 'createExternalCashFlow' : 'updateExternalCashFlow'; if (editor.mode === 'update') params.id = editor.item.id; }
      await api.call(action, { params: params, payload: payload, dedupeKey: 'editor-save' });
      byId('editorDialog').close(); byId('recalcWarning').hidden = false;
      await currentLoader()();
    } catch (error) { byId('editorError').textContent = errorMessage(error); }
    finally { setButtonBusy(button, false); }
  }

  async function confirmAction(message, action, params, reload) {
    if (!window.confirm(message)) return;
    clearError();
    try { await api.call(action, { params: params, dedupeKey: action + ':' + JSON.stringify(params) }); byId('recalcWarning').hidden = false; await reload(); }
    catch (error) { showError(error); }
  }

  async function queueJob(action, button) {
    if (!window.confirm('確定將這項維護工作排入每日 07:30 排程？')) return;
    setButtonBusy(button, true); clearError();
    try { await api.call(action, { dedupeKey: action }); await loadJobs(); }
    catch (error) { showError(error); }
    finally { setButtonBusy(button, false); }
  }

  function currentLoader() {
    return { overview: loadOverview, performance: loadPerformance, assets: loadAssets, transactions: loadTransactions, cashflows: loadCashFlows, jobs: loadJobs }[state.view];
  }
  function switchView(view) {
    state.view = view;
    document.querySelectorAll('.view-tabs button').forEach(function (button) { button.classList.toggle('active', button.dataset.view === view); });
    document.querySelectorAll('.view').forEach(function (section) { var active = section.id === 'view-' + view; section.hidden = !active; section.classList.toggle('active-view', active); });
    currentLoader()();
  }

  async function login(event) {
    event.preventDefault(); var button = event.currentTarget.querySelector('button[type=submit]'); setButtonBusy(button, true); byId('loginError').textContent = '';
    try {
      api.saveKey(byId('apiKey').value);
      await api.call('getJobStatus', { dedupeKey: 'login-check' });
      byId('apiKey').value = ''; byId('loginView').hidden = true; byId('appView').hidden = false; await loadOverview();
    } catch (error) { api.clearKey(); byId('loginError').textContent = errorMessage(error); }
    finally { setButtonBusy(button, false); }
  }
  function logout() { api.clearKey(); byId('appView').hidden = true; byId('loginView').hidden = false; byId('apiKey').focus(); }

  byId('loginForm').addEventListener('submit', login);
  byId('logoutButton').addEventListener('click', logout);
  document.querySelectorAll('.view-tabs button').forEach(function (button) { button.addEventListener('click', function () { switchView(button.dataset.view); }); });
  document.querySelectorAll('.refresh-view').forEach(function (button) { button.addEventListener('click', function () { currentLoader()(); }); });
  [['performanceFilters', loadPerformance], ['assetFilters', loadAssets], ['transactionFilters', loadTransactions], ['cashFlowFilters', loadCashFlows]].forEach(function (pair) {
    byId(pair[0]).addEventListener('submit', function (event) { event.preventDefault(); pair[1](1); });
  });
  byId('newAsset').addEventListener('click', function () { openEditor('asset', 'create', {}); });
  byId('newTransaction').addEventListener('click', function () { openEditor('transaction', 'create', {}); });
  byId('newCashFlow').addEventListener('click', function () { openEditor('cashflow', 'create', {}); });
  byId('editorForm').addEventListener('submit', saveEditor);
  byId('closeEditor').addEventListener('click', function () { byId('editorDialog').close(); });
  byId('cancelEditor').addEventListener('click', function () { byId('editorDialog').close(); });
  byId('requestRebuild').addEventListener('click', function () { queueJob('requestRebuild', byId('requestRebuild')); });
  byId('requestMarket').addEventListener('click', function () { queueJob('requestMarketRefresh', byId('requestMarket')); });

  if (api.getKey()) { byId('loginView').hidden = true; byId('appView').hidden = false; loadOverview(); }
})();
