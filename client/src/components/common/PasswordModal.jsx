import { useState } from 'react';
import { XMarkIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function PasswordModal({ onClose }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [show, setShow] = useState({ cur: false, new: false });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.new_password !== form.confirm) return toast.error('New passwords do not match');
    if (form.new_password.length < 6) return toast.error('Password must be at least 6 characters');
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      toast.success('Password changed');
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
          <h2 className="font-semibold text-sm">Change Password</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-4">
          <div>
            <label className="label">Current Password</label>
            <div className="relative">
              <input className="input pr-10" type={show.cur ? 'text' : 'password'} required
                value={form.current_password} onChange={e => set('current_password', e.target.value)} />
              <button type="button" onClick={() => setShow(s => ({ ...s, cur: !s.cur }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {show.cur ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">New Password</label>
            <div className="relative">
              <input className="input pr-10" type={show.new ? 'text' : 'password'} required minLength={6}
                value={form.new_password} onChange={e => set('new_password', e.target.value)} />
              <button type="button" onClick={() => setShow(s => ({ ...s, new: !s.new }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {show.new ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input className="input" type="password" required minLength={6}
              value={form.confirm} onChange={e => set('confirm', e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Saving...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
