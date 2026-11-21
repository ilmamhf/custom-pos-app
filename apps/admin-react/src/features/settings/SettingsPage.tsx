import React, { useState } from 'react'
import { StoreConfigTab } from './StoreConfigTab'
import { StaffManagementTab } from './StaffManagementTab'
import { Store as StoreIcon, Users, Settings } from 'lucide-react'

export const SettingsPage: React.FC = () => {
  const [tab, setTab] = useState<'STORES' | 'STAFF'>('STORES')

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-slate-900 text-white">
              <Settings className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              System Settings & Administration
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Store configurations, PB1 / PPN tax rates, and staff PIN security (Owner Only)
          </p>
        </div>

        {/* Tab switchers */}
        <div className="inline-flex rounded-md shadow-sm border border-slate-200 bg-white p-1">
          <button
            onClick={() => setTab('STORES')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              tab === 'STORES'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <StoreIcon className="h-3.5 w-3.5" />
            Store Branches & Tax
          </button>
          <button
            onClick={() => setTab('STAFF')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              tab === 'STAFF'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Staff & PIN Management
          </button>
        </div>
      </div>

      {tab === 'STORES' ? <StoreConfigTab /> : <StaffManagementTab />}
    </div>
  )
}
