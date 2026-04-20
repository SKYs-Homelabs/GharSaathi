import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { CheckCircleIcon, ArrowPathIcon, ArrowUturnLeftIcon, XMarkIcon, LockClosedIcon } from '@heroicons/react/24/outline';

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

function UndoPaymentModal({ payment, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.patch(`/payments/${payment.id}/unpay`, { reason: reason.trim() || undefined });
      toast.success('Payment marked as pending');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to undo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
      <div className="card w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-[#dce4f0] dark:border-white/[0.08]">
          <h2 className="font-semibold text-sm">Undo Payment — {payment.emp_name}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This will revert the payment to <strong>Pending</strong> and restore any deducted advances.
          </p>
          <div>
            <label className="label">Reason <span className="text-gray-400">(optional)</span></label>
            <input className="input" placeholder="e.g. Marked by mistake" value={reason}
              onChange={e => setReason(e.target.value)} autoFocus />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={submit} disabled={loading} className="btn-danger flex-1">
              {loading ? 'Undoing...' : 'Undo Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  const { isAdmin } = useAuth();
  const currentMonth = format(new Date(), 'yyyy-MM');
  const [month, setMonth] = useState(currentMonth);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [paying, setPaying] = useState({});
  const [undoPayment, setUndoPayment] = useState(null);

  const load = () => {
    setLoading(true);
    api.get(`/payments?month=${month}`)
      .then(res => setPayments(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [month]);

  const generate = async () => {
    setGenerating(true);
    try {
      await api.post(`/payments/generate/${month}`);
      toast.success('Payment sheet generated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  };

  const markPaid = async (id) => {
    setPaying(p => ({ ...p, [id]: true }));
    try {
      await api.patch(`/payments/${id}/pay`);
      toast.success('Marked as paid');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setPaying(p => ({ ...p, [id]: false }));
    }
  };

  const totalGross = payments.reduce((s, p) => s + (p.gross_amount || 0), 0);
  const totalNet = payments.reduce((s, p) => s + (p.net_amount || 0), 0);
  const paidCount = payments.filter(p => p.status === 'paid').length;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Payments</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={generate} disabled={generating} className="btn-secondary gap-2">
              <ArrowPathIcon className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input type="month" className="input w-auto" value={month} onChange={e => setMonth(e.target.value)} />
        {payments.length > 0 && (
          <span className="text-sm text-gray-500">{paidCount}/{payments.length} paid</span>
        )}
      </div>

      {paidCount > 0 && paidCount < payments.length && (
        <div className="mb-4 p-3 rounded-lg text-xs flex items-center gap-2" style={{ backgroundColor: '#f59e0b18', border: '1px solid #f59e0b30' }}>
          <LockClosedIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
          <span className="text-yellow-700 dark:text-yellow-400">
            Paid payments are locked — regenerating will only update <strong>pending</strong> entries.
          </span>
        </div>
      )}

      {/* Summary bar */}
      {payments.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Total Gross', value: INR(totalGross), color: '#00d4ff' },
            { label: 'Total Net', value: INR(totalNet), color: '#0066ff' },
            { label: 'Paid', value: `${paidCount} / ${payments.length}`, color: '#22c55e' },
          ].map(s => (
            <div key={s.label} className="card p-3 text-center">
              <div className="text-base font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} /></div>
      ) : payments.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-400 mb-3">No payment data for {month}.</p>
          {isAdmin && <button onClick={generate} className="btn-primary">Generate Payment Sheet</button>}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Pay Type</th>
                <th>Days</th>
                <th>Gross</th>
                <th>Advance</th>
                <th>Net</th>
                <th>Status</th>
                {isAdmin && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const remaining = Math.max(0, (p.pending_advance || 0) - (p.advance_deducted || 0));
                return (
                  <tr key={p.id}>
                    <td className="font-medium">{p.emp_name}</td>
                    <td><span className={`badge ${p.pay_type === 'DAILY' ? 'badge-blue' : 'badge-yellow'}`}>{p.pay_type}</span></td>
                    <td>{(p.days_worked || 0).toFixed(1)}</td>
                    <td>{INR(p.gross_amount)}</td>
                    <td>
                      {p.advance_deducted > 0 ? (
                        <div>
                          <span className="text-red-400">-{INR(p.advance_deducted)}</span>
                          {remaining > 0 && p.status === 'pending' && (
                            <div className="text-xs text-orange-400 mt-0.5">{INR(remaining)} still owed</div>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="font-bold" style={{ color: '#00d4ff' }}>{INR(p.net_amount)}</td>
                    <td>
                      <span className={`badge ${p.status === 'paid' ? 'badge-green' : 'badge-yellow'}`}>
                        {p.status === 'paid' ? `Paid ${p.paid_date ? format(new Date(p.paid_date), 'd MMM') : ''}` : 'Pending'}
                      </span>
                      {p.notes && p.status === 'pending' && (
                        <div className="text-xs text-gray-400 italic mt-0.5 max-w-[120px] truncate" title={p.notes}>{p.notes}</div>
                      )}
                    </td>
                    {isAdmin && (
                      <td>
                        {p.status === 'pending' ? (
                          <button
                            onClick={() => markPaid(p.id)}
                            disabled={paying[p.id]}
                            className="btn-primary py-1 px-2 text-xs gap-1"
                          >
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            {paying[p.id] ? '...' : 'Mark Paid'}
                          </button>
                        ) : (
                          <button
                            onClick={() => setUndoPayment(p)}
                            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-orange-500 transition-colors"
                            title="Undo payment"
                          >
                            <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                            Undo
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {undoPayment && (
        <UndoPaymentModal
          payment={undoPayment}
          onClose={() => setUndoPayment(null)}
          onDone={load}
        />
      )}
    </div>
  );
}
