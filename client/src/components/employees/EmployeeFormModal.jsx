import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function EmployeeFormModal({ employee, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: employee?.name || '',
    phone: employee?.phone || '',
    address: employee?.address || '',
    pay_type: employee?.pay_type || 'MONTHLY',
    monthly_salary: employee?.monthly_salary || '',
    daily_rate: employee?.daily_rate || '',
    join_date: employee?.join_date || format(new Date(), 'yyyy-MM-dd'),
    status: employee?.status || 'active',
    notes: employee?.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      ...form,
      phone:          form.phone    || null,
      address:        form.address  || null,
      notes:          form.notes    || null,
      monthly_salary: form.monthly_salary !== '' ? parseFloat(form.monthly_salary) : null,
      daily_rate:     form.daily_rate     !== '' ? parseFloat(form.daily_rate)     : null,
    };
    try {
      if (employee) {
        await api.put(`/employees/${employee.id}`, payload);
        toast.success('Employee updated');
      } else {
        await api.post('/employees', payload);
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-white/[0.08]">
          <h2 className="font-semibold">{employee ? 'Edit Employee' : 'Add Employee'}</h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handle} className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Full Name *</label>
              <input className="input" required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Sunita Devi" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98765 43210" />
            </div>
            <div>
              <label className="label">Join Date *</label>
              <input className="input" type="date" required value={form.join_date} onChange={e => set('join_date', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input className="input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="House address..." />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Pay Type *</label>
              <div className="flex gap-3">
                {['MONTHLY', 'DAILY'].map(t => (
                  <button key={t} type="button" onClick={() => set('pay_type', t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                      form.pay_type === t
                        ? 'border-sky-cyan/60 text-white'
                        : 'border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400'
                    }`}
                    style={form.pay_type === t ? { background: 'linear-gradient(135deg, #00d4ff22 0%, #0066ff22 100%)' } : {}}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {form.pay_type === 'MONTHLY' ? (
              <div className="sm:col-span-2">
                <label className="label">Monthly Salary (₹) *</label>
                <input className="input" type="number" min="0" required value={form.monthly_salary}
                  onChange={e => set('monthly_salary', e.target.value)} placeholder="8000" />
              </div>
            ) : (
              <div className="sm:col-span-2">
                <label className="label">Daily Rate (₹) *</label>
                <input className="input" type="number" min="0" required value={form.daily_rate}
                  onChange={e => set('daily_rate', e.target.value)} placeholder="400" />
              </div>
            )}
            {employee && (
              <div className="sm:col-span-2">
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any notes..." />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Saving...' : employee ? 'Save Changes' : 'Add Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
