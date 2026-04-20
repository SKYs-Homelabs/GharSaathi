import { useEffect, useRef, useState } from 'react';
import { PaperClipIcon, ArrowDownTrayIcon, TrashIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const FILE_ICONS = {
  'application/pdf': '📄',
  'image/jpeg': '🖼️',
  'image/jpg': '🖼️',
  'image/png': '🖼️',
  'image/webp': '🖼️',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
};

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsSection({ empId }) {
  const { isAdmin } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();

  const load = () => {
    setLoading(true);
    api.get(`/documents/${empId}`)
      .then(res => setDocs(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [empId]);

  const uploadFiles = async (files) => {
    if (!files.length) return;
    const formData = new FormData();
    for (const f of files) formData.append('files', f);
    setUploading(true);
    try {
      await api.post(`/documents/${empId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`${files.length} file(s) uploaded`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (!isAdmin) return;
    uploadFiles([...e.dataTransfer.files]);
  };

  const del = async (docId, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await api.delete(`/documents/${docId}`);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Documents ({docs.length})
        </h3>
        {isAdmin && (
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary text-xs py-1 px-3 gap-1.5">
            <CloudArrowUpIcon className="w-3.5 h-3.5" /> Upload
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
          className="hidden"
          onChange={e => uploadFiles([...e.target.files])}
        />
      </div>

      {/* Drop zone */}
      {isAdmin && (
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-4 text-center text-xs text-gray-400 cursor-pointer mb-4
            transition-all duration-150
            ${dragOver ? 'border-[#00d4ff] bg-[#00d4ff]/5 text-[#00d4ff]' : 'border-[#dce4f0] dark:border-white/[0.1] hover:border-[#00d4ff]/50'}
          `}
        >
          {uploading ? 'Uploading...' : 'Drop files here or click to upload (PDF, images, Word — max 10MB each)'}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} />
        </div>
      ) : docs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-2">No documents uploaded.</p>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[#f4f7ff] dark:bg-white/[0.04] group">
              <span className="text-lg flex-shrink-0">{FILE_ICONS[doc.mimetype] || '📎'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{doc.original_name}</p>
                <p className="text-xs text-gray-400">{formatSize(doc.size)} · {format(new Date(doc.created_at + 'Z'), 'd MMM yyyy')} · {doc.uploaded_by}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={`/api/documents/file/${doc.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded text-gray-400 hover:text-[#00d4ff] transition-colors"
                  title="View / Download"
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                </a>
                {isAdmin && (
                  <button onClick={() => del(doc.id, doc.original_name)} className="p-1.5 rounded text-gray-400 hover:text-red-500 transition-colors" title="Delete">
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
