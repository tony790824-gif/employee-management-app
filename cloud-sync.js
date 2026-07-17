(() => {
  const $=s=>document.querySelector(s),url=window.GOOGLE_SHEETS_WEB_APP_URL;
  const storageKey = key => window.shiftEnvironment?.storageKey?.(key) || key;
  if (window.LOCAL_PREVIEW) { $('#cloudStatus').textContent='本機預覽（未連接雲端）'; return; }
  localStorage.setItem(storageKey('shift-cloud-config'),JSON.stringify({mode:'google_sheets',url}));
  $('#cloudConfigBtn').onclick=()=>{$('#googleSheetsUrl').value=url;$('#cloudDialog').showModal();};
})();
