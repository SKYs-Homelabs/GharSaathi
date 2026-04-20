import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UsersIcon, CalendarDaysIcon, BanknotesIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';
import api from '../api/client';
import { format } from 'date-fns';
import AttendanceCalendar from '../components/dashboard/AttendanceCalendar';
import RecentActivity from '../components/dashboard/RecentActivity';

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

export default function Dashboard() {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({ marked: [], unmarked: [] });
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = format(new Date(), 'yyyy-MM-dd');
  const currentMonth = today.slice(0, 7);

  useEffect(() => {
    Promise.all([
      api.get('/employees?status=active'),
      api.get(`/attendance/date/${today}`),
      api.get(`/payments?month=${currentMonth}`),
    ]).then(([empRes, attRes, payRes]) => {
      setEmployees(empRes.data);
      setAttendance(attRes.data);
      setPending(payRes.data.filter(p => p.status === 'pending'));
    }).finally(() => setLoading(false));
  }, [today, currentMonth]);

  const presentToday = attendance.marked.filter(a => a.status === 'P').length;
  const absentToday = attendance.marked.filter(a => a.status === 'A').length;
  const halfToday = attendance.marked.filter(a => a.status === 'H').length;
  const unmarkedCount = attendance.unmarked.length;
  const pendingPayTotal = pending.reduce((s, p) => s + (p.net_amount || 0), 0);

  const stats = [
    { label: 'Active Staff', value: employees.length, Icon: UsersIcon, to: '/employees', color: '#00d4ff' },
    { label: 'Present Today', value: presentToday, sub: `${absentToday} absent · ${halfToday} half`, Icon: CalendarDaysIcon, to: '/attendance', color: '#0066ff' },
    { label: 'Pending Payments', value: INR(pendingPayTotal), sub: `${pending.length} employee(s)`, Icon: BanknotesIcon, to: '/payments', color: '#a855f7' },
    { label: 'Not Marked Today', value: unmarkedCount, sub: 'attendance pending', Icon: CalendarDaysIcon, to: '/attendance', color: '#f59e0b' },
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
        </div>
        <Link to="/attendance" className="btn-primary">Mark Attendance</Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, sub, Icon, to, color }) => (
          <Link key={label} to={to} className="stat-card hover:glow-cyan transition-all group">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-lg" style={{ background: `${color}18` }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
            </div>
            <div className="stat-value" style={{ color }}>{value}</div>
            <div className="stat-label">{label}</div>
            {sub && <div className="text-xs text-gray-400">{sub}</div>}
          </Link>
        ))}
      </div>

      {/* Quick sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Today's unmarked */}
        <div className="card p-4">
          <h2 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-300">Not Marked Today</h2>
          {attendance.unmarked.length === 0 ? (
            <p className="text-sm text-green-500">All staff marked for today ✓</p>
          ) : (
            <div className="space-y-2">
              {attendance.unmarked.slice(0, 5).map(e => (
                <div key={e.id} className="flex items-center justify-between">
                  <span className="text-sm">{e.name}</span>
                  <Link to="/attendance" className="text-xs" style={{ color: '#00d4ff' }}>Mark →</Link>
                </div>
              ))}
              {attendance.unmarked.length > 5 && (
                <Link to="/attendance" className="text-xs text-gray-400">+{attendance.unmarked.length - 5} more</Link>
              )}
            </div>
          )}
        </div>

        {/* Pending payments */}
        <div className="card p-4">
          <h2 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-300">Pending Payments — {currentMonth}</h2>
          {pending.length === 0 ? (
            <p className="text-sm text-green-500">All payments settled ✓</p>
          ) : (
            <div className="space-y-2">
              {pending.slice(0, 5).map(p => (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="text-sm">{p.emp_name}</span>
                  <span className="text-sm font-medium" style={{ color: '#00d4ff' }}>{INR(p.net_amount)}</span>
                </div>
              ))}
              {pending.length > 5 && (
                <Link to="/payments" className="text-xs text-gray-400">+{pending.length - 5} more</Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Calendar + Activity row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <AttendanceCalendar />
        <RecentActivity />
      </div>
    </div>
  );
}
