import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import EmployeeFormModal from '../components/employees/EmployeeFormModal';
import DocumentsSection from '../components/employees/DocumentsSection';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      api.get(`/employees/${id}/summary`),
      api.get(`/advances?emp_id=${id}`),
    ]).then(([sumRes, advRes]) => {
      setData(sumRes.data);
      setAdvances(advRes.data);
    }).catch(() => navigate('/employees'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} /></div>;
  if (!data) return null;

  const { employee: emp, currentMonth } = data;

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${emp.name}? This will remove all their attendance, payments, advances, and documents.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/employees/${id}`);
      toast.success(`${emp.name} deleted`);
      navigate('/employees');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn-secondary p-2">
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="page-title">{emp.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Employee Profile</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => setShowEdit(true)} className="btn-secondary gap-2">
              <PencilIcon className="w-4 h-4" /> Edit
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="btn-danger gap-2">
              <TrashIcon className="w-4 h-4" /> {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Profile card */}
        <div className="card p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0" style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #0066ff 100%)' }}>
              {emp.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="font-bold text-lg">{emp.name}</h2>
              <span className={`badge ${emp.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{emp.status}</span>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {emp.phone && <div className="flex justify-between"><span className="text-gray-400">Phone</span><span>{emp.phone}</span></div>}
            {emp.address && <div className="flex justify-between"><span className="text-gray-400">Address</span><span className="text-right max-w-40 truncate">{emp.address}</span></div>}
            <div className="flex justify-between"><span className="text-gray-400">Joined</span><span>{format(new Date(emp.join_date), 'd MMM yyyy')}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Pay Type</span><span className={`badge ${emp.pay_type === 'DAILY' ? 'badge-blue' : 'badge-yellow'}`}>{emp.pay_type}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Rate</span><span className="font-medium" style={{ color: '#00d4ff' }}>{emp.pay_type === 'DAILY' ? `${INR(emp.daily_rate)}/day` : `${INR(emp.monthly_salary)}/mo`}</span></div>
          </div>
        </div>

        {/* This month */}
        <div className="card p-5">
          <h3 className="font-semibold text-sm mb-4 text-gray-500 dark:text-gray-400 uppercase tracking-wide">This Month</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Present', value: currentMonth.attendance?.present || 0, color: '#22c55e' },
              { label: 'Absent', value: currentMonth.attendance?.absent || 0, color: '#ef4444' },
              { label: 'Half Day', value: currentMonth.attendance?.half_days || 0, color: '#f59e0b' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 dark:border-white/[0.06] pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Pending Advance</span>
              <span className="font-medium text-red-400">{INR(currentMonth.pendingAdvances)}</span>
            </div>
          </div>
        </div>

        {/* Recent advances */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide">Advances</h3>
            <Link to="/advances" className="text-xs" style={{ color: '#00d4ff' }}>View all →</Link>
          </div>
          {advances.length === 0 ? (
            <p className="text-sm text-gray-400">No advances recorded.</p>
          ) : (
            <div className="space-y-2">
              {advances.slice(0, 5).map(a => (
                <div key={a.id} className="flex justify-between items-center text-sm">
                  <div>
                    <span>{format(new Date(a.date), 'd MMM')}</span>
                    <span className={`ml-2 badge ${a.deducted ? 'badge-green' : 'badge-red'}`}>{a.deducted ? 'deducted' : 'pending'}</span>
                  </div>
                  <span className="font-medium">{INR(a.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Documents */}
      <div className="mt-4">
        <DocumentsSection empId={id} />
      </div>

      {showEdit && (
        <EmployeeFormModal
          employee={emp}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); load(); }}
        />
      )}
    </div>
  );
}
