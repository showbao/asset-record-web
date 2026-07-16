(function (root) {
  'use strict';
  function openTemplateCopy() {
    var url = root.ASSET_RECORD_CONFIG && root.ASSET_RECORD_CONFIG.templateCopyUrl;
    if (!url) throw new Error('尚未設定正式空白範本連結');
    root.open(url, '_blank', 'noopener,noreferrer');
  }
  root.AssetRecordTemplateFlow = Object.freeze({ openTemplateCopy: openTemplateCopy });
})(window);
