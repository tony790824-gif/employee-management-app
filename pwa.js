(() => {
  // 預覽頁不註冊 Service Worker，避免舊版快取或安裝流程干擾測試。
  if (window.LOCAL_PREVIEW) return;
  const button = document.querySelector('#installAppBtn');
  let deferred;
  const installed = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const serviceWorkerUrl = window.shiftEnvironment?.serviceWorkerUrl || './service-worker.js';
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register(serviceWorkerUrl).catch(() => {}));
  if (button) button.hidden = installed();
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferred = event;
    if (button && !installed()) button.hidden = false;
  });
  button?.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      return;
    }
    alert(/iphone|ipad|ipod/i.test(navigator.userAgent)
      ? '請按 Safari 的「分享」按鈕，再選擇「加入主畫面」。'
      : '請從瀏覽器選單選擇「安裝應用程式」或「加到主畫面」。');
  });
  window.addEventListener('appinstalled', () => { if (button) button.hidden = true; });
})();
