(() => {
  const $=s=>document.querySelector(s),url=window.GOOGLE_SHEETS_WEB_APP_URL;
  if (window.LOCAL_PREVIEW) { $('#cloudStatus').textContent='本機預覽（未連接雲端）'; return; }
  localStorage.setItem('shift-cloud-config',JSON.stringify({mode:'google_sheets',url}));
  $('#cloudConfigBtn').onclick=()=>{$('#googleSheetsUrl').value=url;$('#cloudDialog').showModal();};
})();
