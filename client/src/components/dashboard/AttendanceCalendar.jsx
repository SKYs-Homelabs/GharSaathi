import { useEffect, useState } from 'react';
import { format, startOfMonth, getDaysInMonth, getDay, addMonths, subMonths } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import api from '../../api/client';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_LABELS = { P: 'Present', A: 'Absent', H: 'Half Day' };

function DayModal({ date, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/attendance/date/${date}`)
      .then(res => setData(res.data))
      .finally(() => setLoading(false));
  }, [date]);

  const marked = data?.marked || [];
  const groups = { P: [], A: [], H: [] };
  for (const r of marked) (groups[r.status] || []).push(r);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="card w-full max-w-sm max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#dce4f0] dark:border-white/[0.08]">
          <h2 className="font-semibold text-sm">{format(new Date(date), 'd MMMM yyyy')}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} />
            </div>
          ) : marked.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No attendance marked for this day.</p>
          ) : (
            <div className="space-y-3">
              {[['P', 'text-green-500'], ['H', 'text-yellow-500'], ['A', 'text-red-500']].map(([s, cls]) =>
                groups[s].length > 0 && (
                  <div key={s}>
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${cls}`}>
                      {STATUS_LABELS[s]} ({groups[s].length})
                    </p>
                    <div className="space-y-1">
                      {groups[s].map(r => (
                        <div key={r.id} className="flex items-center justify-between text-sm">
                          <span>{r.emp_name}</span>
                          {r.notes && <span className="text-xs text-gray-400 italic ml-2 truncate max-w-[140px]">{r.notes}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AttendanceCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  const month = format(currentDate, 'yyyy-MM');

  useEffect(() => {
    setLoading(true);
    api.get(`/attendance/daily-summary/${month}`)
      .then(res => {
        const map = {};
        for (const row of res.data) map[row.date] = row;
        setSummary(map);
      })
      .finally(() => setLoading(false));
  }, [month]);

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDayOfWeek = getDay(startOfMonth(currentDate));
  const today = format(new Date(), 'yyyy-MM-dd');

  const getDots = (dateStr) => {
    const d = summary[dateStr];
    if (!d) return null;
    const dots = [];
    if (d.present > 0) dots.push({ color: '#22c55e', label: `${d.present} present` });
    if (d.half_day > 0) dots.push({ color: '#f59e0b', label: `${d.half_day} half` });
    if (d.absent > 0) dots.push({ color: '#ef4444', label: `${d.absent} absent` });
    return dots;
  };

  return (
    <>
      <div className="card p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Attendance Calendar</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentDate(d => subMonths(d, 1))} className="p-1 rounded hover:bg-[#e8edf8] dark:hover:bg-white/[0.06] transition-colors">
              <ChevronLeftIcon className="w-4 h-4 text-gray-400" />
            </button>
            <span className="text-sm font-medium min-w-[100px] text-center">{format(currentDate, 'MMMM yyyy')}</span>
            <button onClick={() => setCurrentDate(d => addMonths(d, 1))} className="p-1 rounded hover:bg-[#e8edf8] dark:hover:bg-white/[0.06] transition-colors">
              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-xs font-semibold text-gray-400 dark:text-gray-500 py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${month}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === today;
            const dots = getDots(dateStr);
            const isSunday = (firstDayOfWeek + i) % 7 === 0;
            const isSaturday = (firstDayOfWeek + i) % 7 === 6;
            const hasData = dots && dots.length > 0;

            return (
              <button
                key={day}
                onClick={() => hasData && setSelectedDay(dateStr)}
                className={`
                  relative flex flex-col items-center py-1.5 rounded-md transition-colors
                  ${isToday ? 'bg-[#00d4ff]/10 dark:bg-[#00d4ff]/10' : ''}
                  ${hasData ? 'hover:bg-[#eef2ff] dark:hover:bg-white/[0.06] cursor-pointer' : 'cursor-default'}
                `}
              >
                <span className={`
                  text-xs font-medium mb-1
                  ${isToday ? 'text-[#00d4ff] font-bold' : ''}
                  ${isSunday || isSaturday ? 'text-red-400 dark:text-red-500' : 'text-gray-700 dark:text-gray-300'}
                `}>
                  {day}
                </span>
                <div className="flex gap-0.5 justify-center min-h-[8px]">
                  {loading ? null : dots?.map((dot, j) => (
                    <div
                      key={j}
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: dot.color }}
                      title={dot.label}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#dce4f0] dark:border-white/[0.06]">
          {[
            { color: '#22c55e', label: 'Present' },
            { color: '#f59e0b', label: 'Half Day' },
            { color: '#ef4444', label: 'Absent' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="text-xs text-gray-400">{l.label}</span>
            </div>
          ))}
          <span className="text-xs text-gray-300 dark:text-gray-600 ml-auto">Click day to view</span>
        </div>
      </div>

      {selectedDay && (
        <DayModal date={selectedDay} onClose={() => setSelectedDay(null)} />
      )}
    </>
  );
}
