import { useEffect, useState } from 'react';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';

const ROLE_BADGE = {
  admin:    'badge-blue',
  viewer:   'badge-green',
  readonly: 'badge-gray',
};

const ROLE_DESC = {
  admin:    'Full access — manage employees, payments, users',
  viewer:   'Can mark attendance, add advances, view all data',
  readonly: 'View only — cannot make any changes',
};

export default function UsersModal({ onClose }) {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const load = () => {
    api.get('/auth/users').then(res => setUsers(res.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const addUser = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/auth/users', form);
      toast.success(`${form.name} added`);
      setForm({ name: '', email: '', password: '', role: 'viewer' });
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id, name) => {
    if (!confirm(`Remove ${name}?`)) return;
    try {
      await api.delete(`/auth/users/${id}`);
      toast.success('User removed');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
      <div className="card w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#dce4f0] dark:border-white/[0.08] flex-shrink-0">
          <h2 className="font-semibold">Manage Users</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* User list */}
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} />
            </div>
          ) : users.map(u => (
            <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#f4f7ff] dark:bg-white/[0.04]">
              <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold" style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #0066ff 100%)' }}>
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{u.name}</span>
                  {u.id === me.id && <span className="text-xs text-gray-400">(you)</span>}
                  <span className={`badge ${ROLE_BADGE[u.role]}`}>{u.role}</span>
                </div>
                <p className="text-xs text-gray-400 truncate">{u.email}</p>
              </div>
              {u.id !== me.id && (
                <button onClick={() => del(u.id, u.name)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          {/* Role legend */}
          <div className="rounded-lg p-3 bg-[#eef2ff] dark:bg-white/[0.03] space-y-1.5">
            {Object.entries(ROLE_DESC).map(([role, desc]) => (
              <div key={role} className="flex items-start gap-2 text-xs">
                <span className={`badge mt-0.5 flex-shrink-0 ${ROLE_BADGE[role]}`}>{role}</span>
                <span className="text-gray-500 dark:text-gray-400">{desc}</span>
              </div>
            ))}
          </div>

          {/* Add user form */}
          {showForm ? (
            <form onSubmit={addUser} className="space-y-3 p-3 rounded-lg border border-[#dce4f0] dark:border-white/[0.08]">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New User</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Name *</label>
                  <input className="input" required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Priya Singh" />
                </div>
                <div>
                  <label className="label">Role *</label>
                  <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
                    <option value="viewer">Viewer</option>
                    <option value="readonly">Read Only</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="label">Email *</label>
                  <input className="input" type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="priya@example.com" />
                </div>
                <div>
                  <label className="label">Password *</label>
                  <input className="input" type="password" required minLength={6} value={form.password} onChange={e => set('password', e.target.value)} placeholder="min. 6 chars" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1 text-xs py-1.5">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 text-xs py-1.5">{saving ? 'Adding...' : 'Add User'}</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setShowForm(true)} className="w-full btn-secondary gap-2 justify-center">
              <PlusIcon className="w-4 h-4" /> Add User
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
