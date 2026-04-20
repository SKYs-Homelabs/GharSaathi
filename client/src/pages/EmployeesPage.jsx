import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import EmployeeFormModal from '../components/employees/EmployeeFormModal';

export default function EmployeesPage() {
  const { isAdmin } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get(`/employees${filter ? `?status=${filter}` : ''}`)
      .then(res => setEmployees(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.phone || '').includes(search)
  );

  const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Employees</h1>
        {isAdmin && (
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <PlusIcon className="w-4 h-4" /> Add Employee
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search by name or phone..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex rounded-lg bg-gray-100 dark:bg-white/[0.04] p-1 gap-1">
          {['active', 'inactive', ''].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                filter === s ? 'bg-white dark:bg-white/[0.1] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >{s || 'All'}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">No employees found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(emp => (
            <Link key={emp.id} to={`/employees/${emp.id}`} className="card p-4 hover:glow-cyan transition-all group">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-sm" style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #0066ff 100%)' }}>
                  {emp.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-sm truncate">{emp.name}</h3>
                    <span className={`badge flex-shrink-0 ${emp.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{emp.status}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{emp.phone || 'No phone'}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`badge ${emp.pay_type === 'DAILY' ? 'badge-blue' : 'badge-yellow'}`}>{emp.pay_type}</span>
                    <span className="text-xs font-medium" style={{ color: '#00d4ff' }}>
                      {emp.pay_type === 'DAILY' ? `${INR(emp.daily_rate)}/day` : `${INR(emp.monthly_salary)}/mo`}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showModal && (
        <EmployeeFormModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); toast.success('Employee added'); }}
        />
      )}
    </div>
  );
}
