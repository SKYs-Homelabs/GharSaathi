import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ArrowUturnLeftIcon, XMarkIcon } from '@heroicons/react/24/outline';
import api from '../api/client';
import toast from 'react-hot-toast';

const STATUS_LABELS = { P: 'Present', A: 'Absent', H: 'Half Day' };

function UndoModal({ entry, date, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.delete('/attendance', { data: { emp_id: entry.emp_id, date, reason: reason.trim() || undefined } });
      toast.success('Attendance undone');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
      <div className="card w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-[#dce4f0] dark:border-white/[0.08]">
          <h2 className="font-semibold text-sm">Undo Attendance</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Remove <span className="font-medium">{entry.emp_name || entry.name}</span>'s attendance
            ({STATUS_LABELS[entry.status]}) on <span className="font-medium">{format(new Date(date), 'd MMM yyyy')}</span>?
          </p>
          <div>
            <label className="label">Reason <span className="text-gray-400">(optional)</span></label>
            <input className="input" placeholder="e.g. Marked by mistake" value={reason}
              onChange={e => setReason(e.target.value)} autoFocus />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={submit} disabled={loading} className="btn-danger flex-1">
              {loading ? 'Undoing...' : 'Undo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NoteModal({ emp, status, onClose, onConfirm }) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    await onConfirm(note.trim() || undefined);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
      <div className="card w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-[#dce4f0] dark:border-white/[0.08]">
          <h2 className="font-semibold text-sm">
            Mark {STATUS_LABELS[status]} — {emp.emp_name || emp.name}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="label">Note <span className="text-gray-400">(optional)</span></label>
            <input
              className="input"
              placeholder={status === 'A' ? 'e.g. Sick leave' : 'e.g. Left early'}
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={submit} disabled={loading} className="btn-primary flex-1">
              {loading ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState('daily');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dailyData, setDailyData] = useState({ marked: [], unmarked: [] });
  const [monthlyData, setMonthlyData] = useState([]);
  const [notesData, setNotesData] = useState([]);
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);
  const [undoEntry, setUndoEntry] = useState(null);
  const [notePrompt, setNotePrompt] = useState(null); // { emp, status }

  const loadDaily = (date) => {
    setLoading(true);
    api.get(`/attendance/date/${date}`)
      .then(res => setDailyData(res.data))
      .finally(() => setLoading(false));
  };

  const loadMonthly = (m) => {
    setLoading(true);
    api.get(`/attendance/summary/${m}`)
      .then(res => setMonthlyData(res.data))
      .finally(() => setLoading(false));
  };

  const loadNotes = (m) => {
    setLoading(true);
    api.get(`/attendance?month=${m}`)
      .then(res => {
        const ahRecords = (res.data || []).filter(r => r.status === 'A' || r.status === 'H');
        setNotesData(ahRecords);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (viewMode === 'daily') loadDaily(selectedDate);
    else if (viewMode === 'monthly') loadMonthly(month);
    else loadNotes(month);
  }, [viewMode, selectedDate, month]);

  const doMark = async (emp_id, status, note) => {
    setSaving(s => ({ ...s, [emp_id]: true }));
    try {
      await api.post('/attendance', { emp_id, date: selectedDate, status, notes: note || null });
      loadDaily(selectedDate);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(s => ({ ...s, [emp_id]: false }));
    }
  };

  const mark = (emp, status) => {
    const empId = emp.emp_id || emp.id;
    if (status === 'A' || status === 'H') {
      setNotePrompt({ emp, status });
    } else {
      doMark(empId, status, undefined);
    }
  };

  const allEmployees = [...dailyData.marked, ...dailyData.unmarked.map(e => ({ ...e, status: null, emp_id: e.id }))];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Attendance</h1>
        <div className="flex rounded-lg bg-[#e8edf8] dark:bg-white/[0.04] p-1">
          {[['daily', 'Daily'], ['monthly', 'Monthly'], ['notes', 'Notes']].map(([val, label]) => (
            <button key={val} onClick={() => setViewMode(val)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === val ? 'bg-white dark:bg-white/[0.1] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}>{label}</button>
          ))}
        </div>
      </div>

      {/* Daily view */}
      {viewMode === 'daily' && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <input type="date" className="input w-auto" value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)} max={today} />
            <span className="text-sm text-gray-500">{allEmployees.length} employees</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} />
            </div>
          ) : (
            <div className="space-y-2">
              {allEmployees.map(e => {
                const currentStatus = e.status || null;
                const empId = e.emp_id || e.id;
                return (
                  <div key={empId} className="card px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold" style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #0066ff 100%)' }}>
                        {(e.emp_name || e.name).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{e.emp_name || e.name}</p>
                        <p className="text-xs text-gray-400">
                          {e.pay_type}
                          {e.notes && <span className="ml-2 italic text-gray-400">"{e.notes}"</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {['P', 'A', 'H'].map(s => (
                        <button
                          key={s}
                          onClick={() => mark(e, s)}
                          disabled={saving[empId]}
                          className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${
                            currentStatus === s
                              ? s === 'P' ? 'bg-green-500 text-white' : s === 'A' ? 'bg-red-500 text-white' : 'bg-yellow-400 text-black'
                              : 'bg-[#e8edf8] dark:bg-white/[0.06] text-gray-400 hover:bg-[#dce4f5] dark:hover:bg-white/[0.1]'
                          }`}
                          title={STATUS_LABELS[s]}
                        >{s}</button>
                      ))}
                      {currentStatus && (
                        <button
                          onClick={() => setUndoEntry(e)}
                          className="w-9 h-9 rounded-lg bg-[#e8edf8] dark:bg-white/[0.06] text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                          title="Undo attendance"
                        >
                          <ArrowUturnLeftIcon className="w-4 h-4 mx-auto" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Monthly summary view */}
      {viewMode === 'monthly' && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <input type="month" className="input w-auto" value={month} onChange={e => setMonth(e.target.value)} />
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} />
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Pay Type</th>
                    <th className="text-green-500">Present</th>
                    <th className="text-red-500">Absent</th>
                    <th className="text-yellow-500">Half Day</th>
                    <th>Days Worked</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map(e => (
                    <tr key={e.id}>
                      <td className="font-medium">{e.name}</td>
                      <td><span className={`badge ${e.pay_type === 'DAILY' ? 'badge-blue' : 'badge-yellow'}`}>{e.pay_type}</span></td>
                      <td className="text-green-500 font-medium">{e.present || 0}</td>
                      <td className="text-red-500 font-medium">{e.absent || 0}</td>
                      <td className="text-yellow-500 font-medium">{e.half_day || 0}</td>
                      <td className="font-bold" style={{ color: '#00d4ff' }}>{(e.days_worked || 0).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Notes view — absent/half-day records with notes */}
      {viewMode === 'notes' && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <input type="month" className="input w-auto" value={month} onChange={e => setMonth(e.target.value)} />
            <span className="text-sm text-gray-500">Absent &amp; Half Day records</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} />
            </div>
          ) : notesData.length === 0 ? (
            <div className="card p-12 text-center text-gray-400">No absent or half-day records for {month}.</div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Employee</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {notesData.map(r => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{format(new Date(r.date), 'd MMM yyyy')}</td>
                      <td className="font-medium">{r.emp_name}</td>
                      <td>
                        <span className={`badge ${r.status === 'A' ? 'badge-red' : 'badge-yellow'}`}>
                          {STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td className="text-gray-500 dark:text-gray-400 italic">
                        {r.notes || <span className="text-gray-300 dark:text-gray-600 not-italic">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {undoEntry && (
        <UndoModal
          entry={undoEntry}
          date={selectedDate}
          onClose={() => setUndoEntry(null)}
          onDone={() => loadDaily(selectedDate)}
        />
      )}

      {notePrompt && (
        <NoteModal
          emp={notePrompt.emp}
          status={notePrompt.status}
          onClose={() => setNotePrompt(null)}
          onConfirm={async (note) => {
            const empId = notePrompt.emp.emp_id || notePrompt.emp.id;
            await doMark(empId, notePrompt.status, note);
            setNotePrompt(null);
          }}
        />
      )}
    </div>
  );
}
