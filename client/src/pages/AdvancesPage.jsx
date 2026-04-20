import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function AdvancesPage() {
  const { isAdmin } = useAuth();
  const [advances, setAdvances] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ emp_id: '', date: format(new Date(), 'yyyy-MM-dd'), amount: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get(`/advances${filter ? `?emp_id=${filter}` : ''}`),
      api.get('/employees?status=active'),
    ]).then(([advRes, empRes]) => {
      setAdvances(advRes.data);
      setEmployees(empRes.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/advances', { ...form, amount: parseFloat(form.amount) });
      toast.success('Advance recorded');
      setShowForm(false);
      setForm({ emp_id: '', date: format(new Date(), 'yyyy-MM-dd'), amount: '', notes: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!confirm('Delete this advance?')) return;
    try {
      await api.delete(`/advances/${id}`);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const totalPending = advances.filter(a => !a.deducted).reduce((s, a) => s + a.amount, 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Advances</h1>
        {isAdmin && (
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <PlusIcon className="w-4 h-4" /> Add Advance
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <select className="input w-auto" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {totalPending > 0 && (
          <span className="text-sm text-red-400 font-medium">Total Pending: {INR(totalPending)}</span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} /></div>
      ) : advances.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">No advances recorded.</div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Deducted In</th>
                <th>Notes</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {advances.map(a => (
                <tr key={a.id}>
                  <td className="font-medium">{a.emp_name}</td>
                  <td>{format(new Date(a.date), 'd MMM yyyy')}</td>
                  <td className="font-bold" style={{ color: '#00d4ff' }}>{INR(a.amount)}</td>
                  <td><span className={`badge ${a.deducted ? 'badge-green' : 'badge-red'}`}>{a.deducted ? 'Deducted' : 'Pending'}</span></td>
                  <td>{a.deducted_in || '—'}</td>
                  <td className="text-gray-400 text-xs">{a.notes || '—'}</td>
                  {isAdmin && (
                    <td>
                      {!a.deducted && (
                        <button onClick={() => del(a.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
          <div className="card w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-white/[0.08]">
              <h2 className="font-semibold">Add Advance</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submit} className="p-4 space-y-4">
              <div>
                <label className="label">Employee *</label>
                <select className="input" required value={form.emp_id} onChange={e => setForm(f => ({ ...f, emp_id: e.target.value }))}>
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Date *</label>
                <input className="input" type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Amount (₹) *</label>
                <input className="input" type="number" min="1" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="500" />
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Medical, festival bonus..." />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Add'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
