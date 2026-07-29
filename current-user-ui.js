(() => {
  'use strict';

  const container = document.querySelector('#currentUserIdentity');
  const name = document.querySelector('#currentUserDisplayName');
  const role = document.querySelector('#currentUserRole');
  if (!container || !name || !role) return;

  const roleLabels = Object.freeze({ boss: '管理者', employee: '員工' });

  function render() {
    // The authenticated PostgreSQL bootstrap is the sole current-user source.
    const currentUser = window.shiftPostgresCloud?.getCurrentUser?.() || null;
    const roleLabel = roleLabels[currentUser?.role];
    if (!roleLabel) {
      name.textContent = '';
      role.textContent = '';
      container.hidden = true;
      return;
    }

    name.textContent = typeof currentUser.displayName === 'string' && currentUser.displayName.length > 0
      ? currentUser.displayName
      : '尚未設定姓名';
    role.textContent = roleLabel;
    container.hidden = false;
  }

  document.addEventListener('postgres-bootstrap-refreshed', event => {
    if (event?.detail && event.detail.currentUserChanged === false) return;
    render();
  });
  document.addEventListener('postgres-session-cleared', render);
  render();

  window.shiftCurrentUserUI = Object.freeze({ render });
})();
