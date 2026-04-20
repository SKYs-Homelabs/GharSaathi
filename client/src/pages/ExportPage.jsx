import { useState } from 'react';
import { format } from 'date-fns';
import { ArrowDownTrayIcon, DocumentTextIcon, TableCellsIcon } from '@heroicons/react/24/outline';

export default function ExportPage() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState({ pdf: false, excel: false });

  const download = async (type) => {
    setLoading(l => ({ ...l, [type]: true }));
    try {
      const url = `/api/export/${type}/${month}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Export failed');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `gharsaathi-${month}.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(l => ({ ...l, [type]: false }));
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Export</h1>
      </div>

      <div className="max-w-md">
        <div className="card p-6">
          <div className="mb-6">
            <label className="label">Select Month</label>
            <input type="month" className="input" value={month} onChange={e => setMonth(e.target.value)} />
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Export payment summary and attendance data for <strong>{month}</strong>.
          </p>

          <div className="space-y-3">
            {/* PDF */}
            <button
              onClick={() => download('pdf')}
              disabled={loading.pdf}
              className="w-full card p-4 flex items-center gap-4 hover:glow-cyan transition-all group text-left"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #ff6b6b22, #ee515122)' }}>
                <DocumentTextIcon className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">PDF Report</p>
                <p className="text-xs text-gray-400">Payment summary with totals</p>
              </div>
              <ArrowDownTrayIcon className={`w-4 h-4 text-gray-400 group-hover:text-gray-200 ${loading.pdf ? 'animate-bounce' : ''}`} />
            </button>

            {/* Excel */}
            <button
              onClick={() => download('excel')}
              disabled={loading.excel}
              className="w-full card p-4 flex items-center gap-4 hover:glow-cyan transition-all group text-left"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #22c55e22, #16a34a22)' }}>
                <TableCellsIcon className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Excel Spreadsheet</p>
                <p className="text-xs text-gray-400">Payment sheet + attendance grid</p>
              </div>
              <ArrowDownTrayIcon className={`w-4 h-4 text-gray-400 group-hover:text-gray-200 ${loading.excel ? 'animate-bounce' : ''}`} />
            </button>
          </div>

          <div className="mt-6 p-3 rounded-lg bg-sky-cyan/5 border border-sky-cyan/10">
            <p className="text-xs text-gray-400">
              Make sure to generate payments first from the Payments page before exporting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
