(() => {
  'use strict';

  if (window.shiftEnvironment?.dataBackend !== 'postgres') return;
  const cloud = window.shiftPostgresCloud;
  const dom = window.shiftDomSafety;
  const navigation = window.shiftNotificationNavigation;
  const trigger = document.querySelector('#announcementButton');
  const badge = document.querySelector('#announcementBadge');
  const dialog = document.querySelector('#announcementDialog');
  const close = document.querySelector('#announcementClose');
  const summary = document.querySelector('#announcementSummary');
  const message = document.querySelector('#announcementMessage');
  const listActions = document.querySelector('#announcementListActions');
  const createButton = document.querySelector('#announcementCreate');
  const list = document.querySelector('#announcementList');
  const detail = document.querySelector('#announcementDetail');
  const detailTitle = document.querySelector('#announcementDetailTitle');
  const detailContent = document.querySelector('#announcementDetailContent');
  const detailMeta = document.querySelector('#announcementDetailMeta');
  const back = document.querySelector('#announcementBack');
  const managerActions = document.querySelector('#announcementManagerActions');
  const editButton = document.querySelector('#announcementEdit');
  const deleteButton = document.querySelector('#announcementDelete');
  const editor = document.querySelector('#announcementEditor');
  const editId = document.querySelector('#announcementEditId');
  const editRevision = document.querySelector('#announcementEditRevision');
  const title = document.querySelector('#announcementTitle');
  const content = document.querySelector('#announcementContent');
  const audience = document.querySelector('#announcementAudience');
  const cancelEdit = document.querySelector('#announcementCancelEdit');
  const save = document.querySelector('#announcementSave');
  if (!cloud || !dom || !navigation || !trigger || !badge || !dialog || !listActions
    || !createButton || !list || !detail || !editor) return;

  const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  const AUDIENCE_LABELS = Object.freeze({ ALL: '所有人', MANAGER: '管理者', EMPLOYEE: '員工' });
  let items = [];
  let current = null;
  let unreadCount = 0;
  let loadPromise = null;
  let mutationPromise = null;
  let uiMode = 'list';

  const managerSession = () => ['boss', 'manager'].includes(cloud.getCurrentUser()?.role);
  const validAnnouncement = item => item && typeof item === 'object'
    && UUID_PATTERN.test(String(item.id || ''))
    && typeof item.title === 'string' && item.title.length >= 1 && item.title.length <= 120
    && typeof item.content === 'string' && item.content.length >= 1 && item.content.length <= 10000
    && Object.hasOwn(AUDIENCE_LABELS, item.audience)
    && Number.isSafeInteger(Number(item.revision)) && Number(item.revision) >= 0;
  const formatDate = value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      }).format(date)
      : '';
  };
  const setMessage = value => {
    message.hidden = !value;
    message.textContent = value || '';
  };
  const updateBadge = () => {
    const count = Math.max(0, Number(unreadCount) || 0);
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.setAttribute('aria-label', `${count} 則未讀公告`);
    summary.textContent = count ? `${count} 則未讀公告` : '沒有未讀公告';
  };
  const resetEditor = () => {
    editId.value = '';
    editRevision.value = '';
    title.value = '';
    content.value = '';
    audience.value = 'ALL';
    save.textContent = '發布公告';
  };
  const setMode = requestedMode => {
    const nextMode = ['list', 'detail', 'editor'].includes(requestedMode)
      && (requestedMode !== 'editor' || managerSession()) ? requestedMode : 'list';
    uiMode = nextMode;
    list.hidden = nextMode !== 'list';
    listActions.hidden = nextMode !== 'list' || !managerSession();
    createButton.hidden = listActions.hidden;
    detail.hidden = nextMode !== 'detail';
    editor.hidden = nextMode !== 'editor';
    managerActions.hidden = nextMode !== 'detail' || !managerSession();
  };
  const showList = () => {
    current = null;
    setMode('list');
  };
  const showCreate = () => {
    if (!managerSession()) return;
    current = null;
    resetEditor();
    setMode('editor');
    title.focus();
  };
  const showDialog = () => {
    if (dialog.open) return true;
    try {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      return true;
    } catch {
      dialog.setAttribute('open', '');
      return true;
    }
  };

  function renderList() {
    updateBadge();
    if (!items.length) {
      dom.replace(list, dom.element('p', { className: 'notification-empty', text: '目前沒有公告。' }));
      return;
    }
    dom.replace(list, ...items.map(item => {
      const button = dom.element('button', {
        className: `announcement-item${item.readAt ? '' : ' is-unread'}`,
        attributes: { type: 'button', 'aria-label': item.title }
      }, [
        dom.element('span', { className: 'announcement-item-heading' }, [
          dom.element('span', { className: 'announcement-item-title', text: item.title }),
          dom.element('time', {
            className: 'announcement-item-time', text: formatDate(item.publishedAt),
            attributes: { datetime: String(item.publishedAt || '') }
          })
        ]),
        dom.element('p', {
          className: 'announcement-item-preview',
          text: `${AUDIENCE_LABELS[item.audience]} · ${item.content.slice(0, 100)}`
        })
      ]);
      button.addEventListener('click', () => void open(item.id));
      return button;
    }));
  }

  async function load({ silent = false } = {}) {
    if (!cloud.isConnected()) return null;
    if (loadPromise) return loadPromise;
    const operation = (async () => {
      try {
        const payload = await cloud.listAnnouncements();
        const next = Array.isArray(payload?.items) ? payload.items.filter(validAnnouncement) : [];
        if (payload?.ok !== true || next.length !== (payload?.items?.length || 0)) {
          throw new Error('公告資料格式不正確。');
        }
        items = next;
        unreadCount = Math.max(0, Number(payload.unreadCount) || 0);
        trigger.hidden = false;
        renderList();
        setMode(uiMode);
        return payload;
      } catch (error) {
        if (!silent) setMessage(error?.message || '公告載入失敗，請稍後再試。');
        return null;
      }
    })();
    loadPromise = operation;
    return operation.finally(() => { if (loadPromise === operation) loadPromise = null; });
  }

  async function open(announcementId = '') {
    setMessage('');
    showDialog();
    if (!cloud.isConnected()) {
      showList();
      setMessage('公告服務尚未連線，請稍後再試。');
      return false;
    }
    const loaded = await load({ silent: true });
    if (!loaded && !items.length) setMessage('公告載入失敗，請稍後再試。');
    if (!announcementId) {
      showList();
      return true;
    }
    if (!UUID_PATTERN.test(announcementId)) return false;
    const item = items.find(value => value.id === announcementId);
    if (!item) {
      setMessage('找不到這則公告，或你沒有查看權限。');
      showList();
      return false;
    }
    current = item;
    detailTitle.textContent = item.title;
    detailContent.textContent = item.content;
    detailMeta.textContent = `${AUDIENCE_LABELS[item.audience]} · ${formatDate(item.publishedAt)}`;
    setMode('detail');
    if (!item.readAt) {
      void cloud.markAnnouncementRead(item.id).then(() => load({ silent: true })).catch(() => {});
    }
    return true;
  }

  function editCurrent() {
    if (!managerSession() || !current) return;
    editId.value = current.id;
    editRevision.value = String(current.revision);
    title.value = current.title;
    content.value = current.content;
    audience.value = current.audience;
    save.textContent = '儲存修改';
    setMode('editor');
    title.focus();
  }

  async function saveAnnouncement(event) {
    event.preventDefault();
    if (!managerSession() || mutationPromise) return;
    const wasEditing = Boolean(editId.value);
    const input = { title: title.value, content: content.value, audience: audience.value };
    mutationPromise = (async () => {
      try {
        save.disabled = true;
        setMessage(editId.value ? '正在儲存公告…' : '正在發布公告…');
        if (editId.value) {
          await cloud.updateAnnouncement(editId.value, {
            ...input, baseRevision: Number(editRevision.value)
          });
        } else {
          await cloud.createAnnouncement(input);
        }
        resetEditor();
        setMessage(wasEditing ? '公告已更新。' : '公告已發布。');
        await load({ silent: true });
        showList();
      } catch (error) {
        setMessage(error?.message || '公告未能儲存，內容已保留，請稍後再試。');
      } finally {
        mutationPromise = null;
        save.disabled = false;
      }
    })();
    await mutationPromise;
  }

  async function deleteCurrent() {
    if (!managerSession() || !current || mutationPromise
      || !window.confirm('確定要刪除這則公告嗎？')) return;
    mutationPromise = (async () => {
      try {
        await cloud.deleteAnnouncement(current.id, current.revision);
        setMessage('公告已刪除。');
        await load({ silent: true });
        showList();
      } catch (error) {
        setMessage(error?.message || '公告未能刪除，請稍後再試。');
      } finally {
        mutationPromise = null;
      }
    })();
    await mutationPromise;
  }

  navigation.registerAnnouncementOpener(open);
  trigger.addEventListener('click', () => navigation.openAnnouncement('/announcements'));
  close.addEventListener('click', () => dialog.close());
  back.addEventListener('click', showList);
  createButton.addEventListener('click', showCreate);
  editor.addEventListener('submit', event => void saveAnnouncement(event));
  cancelEdit.addEventListener('click', () => { resetEditor(); showList(); });
  editButton.addEventListener('click', editCurrent);
  deleteButton.addEventListener('click', () => void deleteCurrent());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.addEventListener('postgres-bootstrap-refreshed', () => void load({ silent: true }));
  document.addEventListener('announcement-changed', () => void load({ silent: true }));
  document.addEventListener('postgres-session-cleared', () => {
    items = [];
    current = null;
    unreadCount = 0;
    trigger.hidden = true;
    resetEditor();
    setMode('list');
    renderList();
    if (dialog.open) dialog.close();
  });
  const directId = /^\/announcements\/([a-f0-9-]{36})$/i.exec(window.location?.pathname || '')?.[1] || '';
  if (directId) window.addEventListener('load', () => void open(directId), { once: true });

  window.shiftAnnouncementCenter = Object.freeze({ open });
  setMode('list');
  renderList();
  void load({ silent: true });
})();
