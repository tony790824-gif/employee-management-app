(() => {
  'use strict';

  if (window.shiftEnvironment?.dataBackend !== 'postgres') return;
  const cloud = window.shiftPostgresCloud;
  const dom = window.shiftDomSafety;
  const trigger = document.querySelector('#notificationButton');
  const badge = document.querySelector('#notificationBadge');
  const dialog = document.querySelector('#notificationDialog');
  const close = document.querySelector('#notificationClose');
  const markAll = document.querySelector('#notificationMarkAllRead');
  const summary = document.querySelector('#notificationSummary');
  const message = document.querySelector('#notificationMessage');
  const list = document.querySelector('#notificationList');
  if (!cloud || !dom || !trigger || !badge || !dialog || !close || !markAll || !summary || !message || !list) return;

  let items = [];
  let unreadCount = 0;
  let loadPromise = null;
  let mutationPromise = null;

  const validNotification = item => item
    && typeof item === 'object'
    && /^[a-f0-9-]{36}$/i.test(String(item.id || ''))
    && typeof item.type === 'string'
    && typeof item.title === 'string'
    && item.title.length >= 1
    && item.title.length <= 120
    && typeof item.body === 'string'
    && item.body.length >= 1
    && item.body.length <= 500
    && Number.isSafeInteger(Number(item.revision))
    && Number(item.revision) >= 0;

  function setMessage(value = '') {
    message.hidden = !value;
    message.textContent = value;
  }

  function formatTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function render() {
    const normalizedUnread = Math.max(0, Number(unreadCount) || 0);
    badge.hidden = normalizedUnread === 0;
    badge.textContent = normalizedUnread > 99 ? '99+' : String(normalizedUnread);
    badge.setAttribute('aria-label', `${normalizedUnread} 則未讀通知`);
    summary.textContent = normalizedUnread ? `${normalizedUnread} 則未讀通知` : '沒有未讀通知';
    markAll.disabled = normalizedUnread === 0 || Boolean(mutationPromise);

    if (!items.length) {
      dom.replace(list, dom.element('p', { className: 'notification-empty', text: '目前沒有通知。' }));
      return;
    }
    dom.replace(list, ...items.map(item => {
      const unread = !item.readAt;
      const button = dom.element('button', {
        className: `notification-item${unread ? ' is-unread' : ''}`,
        attributes: {
          type: 'button',
          'aria-label': `${unread ? '未讀：' : ''}${item.title}`
        }
      }, [
        dom.element('span', { className: 'notification-item-heading' }, [
          dom.element('span', { className: 'notification-item-title', text: item.title }),
          dom.element('time', {
            className: 'notification-item-time',
            text: formatTime(item.createdAt),
            attributes: { datetime: String(item.createdAt || '') }
          })
        ]),
        dom.element('p', { className: 'notification-item-body', text: item.body })
      ]);
      button.disabled = Boolean(mutationPromise);
      if (unread) button.addEventListener('click', () => void markRead(item));
      return button;
    }));
  }

  function normalizePayload(payload) {
    if (payload?.ok === true && payload.available === false) {
      return { items: [], unreadCount: 0, available: false };
    }
    if (!payload || payload.ok !== true || !Array.isArray(payload.items)
      || !Number.isSafeInteger(Number(payload.unreadCount)) || Number(payload.unreadCount) < 0) {
      throw new Error('通知資料格式無效。');
    }
    const normalized = payload.items.filter(validNotification).map(item => Object.freeze({
      id: String(item.id),
      type: String(item.type),
      title: String(item.title),
      body: String(item.body),
      resourceType: item.resourceType == null ? null : String(item.resourceType),
      resourceId: item.resourceId == null ? null : String(item.resourceId),
      readAt: item.readAt == null ? null : String(item.readAt),
      createdAt: String(item.createdAt || ''),
      revision: Number(item.revision)
    }));
    if (normalized.length !== payload.items.length) throw new Error('通知資料包含無效欄位。');
    return { items: normalized, unreadCount: Number(payload.unreadCount), available: true };
  }

  async function loadNotifications({ silent = false } = {}) {
    if (!cloud.isConnected()) return null;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const next = normalizePayload(await cloud.listNotifications());
        items = next.items;
        unreadCount = next.unreadCount;
        trigger.hidden = !next.available;
        if (!next.available && dialog.open) dialog.close();
        setMessage();
        render();
        return next;
      } catch (error) {
        if (!silent) setMessage(error?.message || '通知載入失敗，請稍後再試。');
        return null;
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  async function markRead(item) {
    if (mutationPromise || item?.readAt) return;
    mutationPromise = (async () => {
      try {
        await cloud.markNotificationRead(item.id, item.revision);
        await loadNotifications();
      } catch (error) {
        setMessage(error?.message || '通知狀態更新失敗，請稍後再試。');
      } finally {
        mutationPromise = null;
        render();
      }
    })();
    await mutationPromise;
  }

  async function markAllRead() {
    if (mutationPromise || unreadCount === 0) return;
    mutationPromise = (async () => {
      try {
        await cloud.markAllNotificationsRead();
        await loadNotifications();
      } catch (error) {
        setMessage(error?.message || '通知狀態更新失敗，請稍後再試。');
      } finally {
        mutationPromise = null;
        render();
      }
    })();
    await mutationPromise;
  }

  trigger.addEventListener('click', () => {
    setMessage();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    void loadNotifications();
  });
  close.addEventListener('click', () => dialog.close());
  markAll.addEventListener('click', () => void markAllRead());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  document.addEventListener('postgres-bootstrap-refreshed', () => void loadNotifications({ silent: true }));
  document.addEventListener('postgres-session-cleared', () => {
    items = [];
    unreadCount = 0;
    trigger.hidden = true;
    setMessage();
    render();
    if (dialog.open) dialog.close();
  });

  render();
  void loadNotifications({ silent: true });
})();
