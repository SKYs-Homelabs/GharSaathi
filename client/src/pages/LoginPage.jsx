import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const { dark, toggle } = useTheme();
  const [mode, setMode] = useState('login');
  const [configured, setConfigured] = useState(null); // null = loading
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/auth/setup-status')
      .then(res => {
        setConfigured(res.data.configured);
        if (!res.data.configured) setMode('register');
      })
      .catch(() => setConfigured(true)); // fail safe: assume configured
  }, []);

  if (user) return <Navigate to="/" replace />;
  if (configured === null) return (
    <div className="min-h-screen flex items-center justify-center bg-[#eef1f8] dark:bg-[#0a0a0a]">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00d4ff', borderTopColor: 'transparent' }} />
    </div>
  );

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
        toast.success('Welcome back!');
      } else {
        await register(form.name, form.email, form.password);
        toast.success('Admin account created!');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#eef1f8] dark:bg-[#0a0a0a]">
      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="fixed top-4 right-4 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-white/[0.06]"
      >
        {dark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
      </button>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white text-xl font-bold glow-cyan" style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #0066ff 100%)' }}>
            GS
          </div>
          <h1 className="text-2xl font-bold gradient-text">GharSaathi</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Home Staff Management</p>
        </div>

        <div className="card p-6">
          {/* Tab switcher — only show when not yet configured (initial setup) */}
          {!configured && (
            <div className="flex rounded-lg p-1 mb-6" style={{ backgroundColor: '#e8edf8' }}>
              {['login', 'register'].map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all capitalize ${
                    mode === m ? 'bg-white dark:bg-white/[0.1] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* Setup banner */}
          {!configured && mode === 'register' && (
            <div className="mb-4 p-3 rounded-lg text-xs" style={{ backgroundColor: '#00d4ff10', border: '1px solid #00d4ff30' }}>
              <p className="font-medium" style={{ color: '#00d4ff' }}>Initial Setup</p>
              <p className="text-gray-500 mt-0.5">Create the first admin account. Registration will be disabled after this.</p>
            </div>
          )}

          <form onSubmit={handle} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label">Full Name</label>
                <input className="input" type="text" placeholder="Rahul Sharma" required
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="you@example.com" required
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="••••••••" required
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Admin Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
