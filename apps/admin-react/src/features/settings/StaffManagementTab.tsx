import React, { useState } from 'react'
import { useUsers, useUpdateUser, useStores } from '@/api/queries'
import { User } from '@/api/types'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/Button'
import { StaffModal } from './StaffModal'
import { Pencil, UserPlus } from 'lucide-react'

export const StaffManagementTab: React.FC = () => {
  const { data: users, isLoading, error } = useUsers()
  const { data: stores } = useStores()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const updateUserMutation = useUpdateUser()

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    await updateUserMutation.mutateAsync({
      id: userId,
      isActive: !currentActive,
    })
  }

  const openCreate = () => {
    setEditingUser(null)
    setModalOpen(true)
  }

  const openEdit = (user: User) => {
    setEditingUser(user)
    setModalOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Manage staff credentials, assigned retail branches, and supervisor authorization PINs
        </p>

        <Button
          onClick={openCreate}
          size="sm"
          className="gap-1.5 text-xs"
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Add Staff Member
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-2.5 px-4">Name</th>
                <th className="py-2.5 px-4">Email</th>
                <th className="py-2.5 px-4">Role</th>
                <th className="py-2.5 px-4">Assigned Branches</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading staff directory...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-red-600">
                    Failed to load staff. Check your connection or permissions.
                  </td>
                </tr>
              ) : !users || users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No staff records found
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      {u.name}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 font-mono">
                      {u.email}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusBadge status={u.role} variant={u.role} />
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {u.stores && u.stores.length > 0 ? (
                          u.stores.map((mapping, idx) => (
                            <span
                              key={idx}
                              className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px]"
                            >
                              {mapping.store.name}
                            </span>
                          ))
                        ) : (
                          /*
                            An owner with no assignment reaches every branch.
                            Anyone else with no assignment reaches none, so the
                            label says which of the two it is.
                          */
                          <span className="text-slate-400">
                            {u.role === 'OWNER' ? 'All branches' : 'No branch access'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          u.isActive !== false
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {u.isActive !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          onClick={() => openEdit(u)}
                          aria-label={`Edit ${u.name}`}
                          className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 font-medium underline cursor-pointer"
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                          Edit
                        </button>
                        {u.role !== 'OWNER' && (
                          <button
                            onClick={() =>
                              handleToggleActive(u.id, u.isActive !== false)
                            }
                            className="text-xs text-slate-600 hover:text-slate-900 font-medium underline cursor-pointer"
                          >
                            {u.isActive !== false ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Provision Staff Modal */}
      <StaffModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        stores={stores || []}
        user={editingUser}
      />
    </div>
  )
}
