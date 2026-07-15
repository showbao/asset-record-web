(function (root, factory) {
  var exported = factory();
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else root.AssetRecordUiFormat = exported;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var percent = new Intl.NumberFormat('zh-TW', { style: 'percent', maximumFractionDigits: 2 });
  var decimal = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 4 });
  var assetTypes = Object.freeze({ tw_stock: '台股', us_stock: '美股', fund: '基金' });
  var transactionTypes = Object.freeze({
    buy: '買進',
    sell: '賣出',
    dividend: '現金股利',
    stock_dividend: '股票股利',
    split: '分割',
    reverse_split: '反向分割',
    adjustment: '現金調整'
  });

  function finiteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function percentText(value) {
    return finiteNumber(value) ? percent.format(value) : '—';
  }

  function currencyText(value, currency) {
    if (!finiteNumber(value)) return '—';
    var code = String(currency || '').trim().toUpperCase();
    if (!code) return decimal.format(value);
    try {
      return new Intl.NumberFormat('zh-TW', {
        style: 'currency',
        currency: code,
        currencyDisplay: 'code',
        maximumFractionDigits: 4
      }).format(value);
    } catch (_error) {
      return code + ' ' + decimal.format(value);
    }
  }

  function assetTypeText(value) {
    var key = String(value || '').trim();
    return assetTypes[key] || key || '—';
  }

  function transactionTypeText(value) {
    var key = String(value || '').trim();
    return transactionTypes[key] || key || '—';
  }

  return Object.freeze({
    finiteNumber: finiteNumber,
    percentText: percentText,
    currencyText: currencyText,
    assetTypeText: assetTypeText,
    transactionTypeText: transactionTypeText
  });
});
