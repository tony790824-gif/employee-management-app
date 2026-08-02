((scope) => {
  'use strict';

  const TARGET_PATHS = Object.freeze({
    notifications: '/?open=notifications',
    attendance: '/?open=attendance',
    schedule: '/?open=schedule',
    'time-off': '/?open=time-off'
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
    time_off_rejected: 'time-off'
  });
  const PATH_TARGETS = new Map(
    Object.entries(TARGET_PATHS).map(([target, path]) => [path, target])
  );

  const targetForType = type => TYPE_TARGETS[String(type || '').toLowerCase()]
    || 'notifications';
  const pathForTarget = target => TARGET_PATHS[String(target || '')] || '';
  const pathForType = type => pathForTarget(targetForType(type));
  const targetForPath = path => typeof path === 'string' ? PATH_TARGETS.get(path) || '' : '';

  scope.shiftNotificationNavigation = Object.freeze({
    targetForType,
    pathForTarget,
    pathForType,
    targetForPath
  });
})(typeof window === 'object' ? window : self);
