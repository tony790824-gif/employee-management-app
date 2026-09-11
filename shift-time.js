(() => {
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  function interval(shift) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(shift.date) || !timePattern.test(shift.start) || !timePattern.test(shift.end) || shift.start === shift.end) throw new Error('INVALID_SHIFT_WINDOW');
    const start = Date.parse(`${shift.date}T${shift.start}:00Z`);
    let end = Date.parse(`${shift.date}T${shift.end}:00Z`);
    if (!Number.isFinite(start) || new Date(start).toISOString().slice(0,10) !== shift.date) throw new Error('INVALID_SHIFT_DATE');
    if (end < start) end += 86400000;
    return { start, end, endDate: new Date(end).toISOString().slice(0,10) };
  }
  const hours = shift => (interval(shift).end-interval(shift).start)/3600000;
  const overlaps = (left,right) => { const a=interval(left),b=interval(right); return a.start<b.end && a.end>b.start; };
  const label = shift => `${shift.start}–${shift.end < shift.start ? '次日 ' : ''}${shift.end}`;
  window.BankeShiftTime = Object.freeze({ interval, hours, overlaps, label });
})();
