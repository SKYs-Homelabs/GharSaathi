import { useState } from 'react';
import { Bars3Icon, SunIcon, MoonIcon, KeyIcon, UsersIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import PasswordModal from '../common/PasswordModal';
import UsersModal from '../common/UsersModal';
import toast from 'react-hot-toast';

export default function Topbar({ onMenuClick }) {
  const { dark, toggle } = useTheme();
  const { user, logout, isAdmin } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
  };

  return (
    <>
      <header className="h-16 flex items-center justify-between px-4 md:px-6 bg-[#f4f7ff] dark:bg-[#0d0d0d] border-b border-[#dce4f0] dark:border-white/[0.06] sticky top-0 z-10">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-[#e8edf8] dark:hover:bg-white/[0.06]"
        >
          <Bars3Icon className="w-5 h-5" />
        </button>

        <div className="hidden lg:block" />

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-[#e8edf8] dark:hover:bg-white/[0.06] transition-colors"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
          </button>

          {/* Change password */}
          <button
            onClick={() => setShowPasswordModal(true)}
            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-[#e8edf8] dark:hover:bg-white/[0.06] transition-colors"
            title="Change password"
          >
            <KeyIcon className="w-5 h-5" />
          </button>

          {/* Manage users (admin only) */}
          {isAdmin && (
            <button
              onClick={() => setShowUsersModal(true)}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-[#e8edf8] dark:hover:bg-white/[0.06] transition-colors"
              title="Manage users"
            >
              <UsersIcon className="w-5 h-5" />
            </button>
          )}

          {/* User menu */}
          <div className="flex items-center gap-2 pl-2 border-l border-[#dce4f0] dark:border-white/[0.08]">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #0066ff 100%)' }}>
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:block">
              <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{user?.name}</p>
              <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
            </div>
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-red-500 ml-1 transition-colors">
              Logout
            </button>
          </div>
        </div>
      </header>

      {showPasswordModal && <PasswordModal onClose={() => setShowPasswordModal(false)} />}
      {showUsersModal && <UsersModal onClose={() => setShowUsersModal(false)} />}
    </>
  );
}
