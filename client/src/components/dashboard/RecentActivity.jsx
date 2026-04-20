import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import api from '../../api/client';

const ACTION_STYLES = {
  mark_attendance:    { color: '#22c55e',  label: 'Attendance' },
  undo_attendance:    { color: '#f59e0b',  label: 'Undo' },
  upload_documents:   { color: '#00d4ff',  label: 'Docs' },
  delete_document:    { color: '#ef4444',  label: 'Delete' },
  add_employee:       { color: '#0066ff',  label: 'Employee' },
  update_employee:    { color: '#a855f7',  label: 'Updated' },
  add_advance:        { color: '#f97316',  label: 'Advance' },
};

function ActionDot({ action }) {
  const style = ACTION_STYLES[action] || { color: '#6b7280', label: 'Action' };
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
      style={{ backgroundColor: style.color + '22', color: style.color }}>
      {style.label.charAt(0)}
    </div>
  );
}

export default function RecentActivity() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/activity?limit=15')
      .then(res => setLogs(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card p-4">
      <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">Recent Activity</h2>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No activity yet.</p>
      ) : (
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          {logs.map(log => (
            <div key={log.id} className="flex items-start gap-2.5">
              <ActionDot action={log.action} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug truncate" title={log.details}>
                  {log.details || log.action.replace(/_/g, ' ')}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-gray-400">{log.user_name || 'System'}</span>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(log.created_at + 'Z'), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
