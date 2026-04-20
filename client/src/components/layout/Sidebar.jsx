import { NavLink, Link } from 'react-router-dom';
import {
  HomeIcon, UsersIcon, CalendarDaysIcon, BanknotesIcon,
  ArrowTrendingDownIcon, ArrowDownTrayIcon, XMarkIcon
} from '@heroicons/react/24/outline';

const NAV = [
  { to: '/',           label: 'Dashboard',  Icon: HomeIcon,               end: true },
  { to: '/employees',  label: 'Employees',  Icon: UsersIcon },
  { to: '/attendance', label: 'Attendance', Icon: CalendarDaysIcon },
  { to: '/payments',   label: 'Payments',   Icon: BanknotesIcon },
  { to: '/advances',   label: 'Advances',   Icon: ArrowTrendingDownIcon },
  { to: '/export',     label: 'Export',     Icon: ArrowDownTrayIcon },
];

export default function Sidebar({ open, onClose }) {
  return (
    <aside className={`
      fixed inset-y-0 left-0 z-30 w-64 flex flex-col
      bg-[#f4f7ff] dark:bg-[#0d0d0d] border-r border-[#dce4f0] dark:border-white/[0.06]
      transform transition-transform duration-300 ease-in-out
      ${open ? 'translate-x-0' : '-translate-x-full'}
      lg:translate-x-0
    `}>
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-5 border-b border-[#dce4f0] dark:border-white/[0.06]">
        <Link to="/" onClick={onClose} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #0066ff 100%)' }}>
            GS
          </div>
          <span className="font-bold text-gray-900 dark:text-white">GharSaathi</span>
        </Link>
        <button onClick={onClose} className="lg:hidden p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[#dce4f0] dark:border-white/[0.06]">
        <p className="text-xs text-gray-400 dark:text-gray-600 text-center">GharSaathi v1.0</p>
      </div>
    </aside>
  );
}
