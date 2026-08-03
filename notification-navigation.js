((scope) => {
  'use strict';

  const TARGET_PATHS = Object.freeze({
    notifications: '/?open=notifications',
    attendance: '/?open=attendance',
    schedule: '/?open=schedule',
    'time-off': '/?open=time-off',
    announcements: '/announcements'
  });
  const TYPE_TARGETS = Object.freeze({
    clock_in: 'attendance',
    clock_out: 'attendance',
    shift_updated: 'schedule',
    schedule_updated: 'schedule',
    leave_requested: 'time-off',
    leave_approved: 'time-off',
    leave_rejected: 'time-off',
    time_off_submitted: 'time-off',
    time_off_cancelled: 'time-off',
    time_off_approved: 'time-off',
    time_off_rejected: 'time-off',
    announcement_created: 'announcements'
  });
  const PATH_TARGETS = new Map(
    Object.entries(TARGET_PATHS).map(([target, path]) => [path, target])
  );

  const targetForType = type => TYPE_TARGETS[String(type || '').toLowerCase()]
    || 'notifications';
  const pathForTarget = target => TARGET_PATHS[String(target || '')] || '';
  const announcementPath = resourceId => /^[a-f0-9-]{36}$/i.test(String(resourceId || ''))
    ? `/announcements/${resourceId}` : '';
  const pathForType = (type, resourceId = '') => String(type || '').toLowerCase() === 'announcement_created'
    ? (announcementPath(resourceId) || TARGET_PATHS.announcements)
    : pathForTarget(targetForType(type));
  const pathForNotification = item => {
    const type = String(item?.type || '').toLowerCase();
    if (type === 'announcement_created') {
      return announcementPath(item?.resourceId)
        || (typeof item?.destination === 'string' && /^\/announcements\/[a-f0-9-]{36}$/i.test(item.destination)
          ? item.destination : TARGET_PATHS.announcements);
    }
    return pathForType(type);
  };
  const targetForPath = path => {
    if (typeof path !== 'string') return '';
    if (path === TARGET_PATHS.announcements || /^\/announcements\/[a-f0-9-]{36}$/i.test(path)) {
      return 'announcements';
    }
    return PATH_TARGETS.get(path) || '';
  };
  const announcementIdForPath = path => /^\/announcements\/([a-f0-9-]{36})$/i.exec(String(path || ''))?.[1] || '';

  scope.shiftNotificationNavigation = Object.freeze({
    targetForType,
    pathForTarget,
    pathForType,
    pathForNotification,
    targetForPath,
    announcementIdForPath
  });
})(typeof window === 'object' ? window : self);
