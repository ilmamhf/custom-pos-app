import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Receipt,
  Package,
  Boxes,
  Settings,
  LogOut,
  Store as StoreIcon,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn } from '@/lib/utils'

export const Sidebar: React.FC = () => {
  const { user, role, logout } = useAuth()

  const navItems = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      to: '/sales',
      label: 'Sales History',
      icon: Receipt,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      to: '/products',
      label: 'Master Catalog',
      icon: Package,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      to: '/inventory',
      label: 'Inventory & Stock',
      icon: Boxes,
      roles: ['OWNER', 'MANAGER'],
    },
    {
      to: '/settings',
      label: 'Store & Staff',
      icon: Settings,
      roles: ['OWNER'], // Restricted to Owner only!
    },
  ]

  const visibleNavItems = navItems.filter(
    (item) => !item.roles || (role && item.roles.includes(role))
  )

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-screen border-r border-slate-800">
      <div className="h-16 flex items-center px-6 gap-3 border-b border-slate-800">
        <div className="h-9 w-9 bg-slate-800 text-white rounded-md flex items-center justify-center border border-slate-700">
          <StoreIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-wide">
            RETAIL POS
          </h1>
          <p className="text-[11px] text-slate-400">Back-Office Admin</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleNavItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* User profile section */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="truncate">
            <p className="text-sm font-medium text-white truncate">
              {user?.name || 'Staff User'}
            </p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
          {role && <StatusBadge status={role} variant={role} />}
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-md transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
