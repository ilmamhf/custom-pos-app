import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Role, Store, User } from '@/api/types'
import { useCreateUser, useUpdateUser } from '@/api/queries'
import { AlertCircle, UserPlus, UserCog } from 'lucide-react'

interface StaffModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stores: Store[]
  /** When set, the dialog edits this staff member instead of creating one. */
  user?: User | null
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const StaffModal: React.FC<StaffModalProps> = ({
  open,
  onOpenChange,
  stores,
  user = null,
}) => {
  const editing = Boolean(user)
  const isOwner = user?.role === 'OWNER'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState<Role>('CASHIER')
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [isActive, setIsActive] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const createMutation = useCreateUser()
  const updateMutation = useUpdateUser()
  const isPending = createMutation.isPending || updateMutation.isPending

  const resetForm = () => {
    setName('')
    setEmail('')
    setPassword('')
    setPin('')
    setRole('CASHIER')
    setSelectedStoreIds([])
    setIsActive(true)
    setErrorMsg(null)
  }

  // Fill the form from the staff member being edited.
  //
  // The effect deliberately depends on `open` alone: the snapshot is taken
  // when the dialog opens, so a background refetch of the staff list cannot
  // wipe what the operator has typed since.
  useEffect(() => {
    if (!open) return

    if (user) {
      setName(user.name)
      setEmail(user.email)
      setPassword('')
      setPin('')
      setRole(user.role)
      setSelectedStoreIds(
        (user.stores || [])
          .map((mapping) => mapping.storeId)
          .filter((id): id is string => Boolean(id))
      )
      setIsActive(user.isActive !== false)
    } else {
      resetForm()
    }
    setErrorMsg(null)
  }, [open])

  const handleStoreToggle = (storeId: string) => {
    setSelectedStoreIds((prev) =>
      prev.includes(storeId)
        ? prev.filter((id) => id !== storeId)
        : [...prev, storeId]
    )
  }

  const validate = (): string | null => {
    if (!name.trim()) return 'Full name is required.'
    if (!email.trim()) return 'Email address is required.'
    if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address.'

    if (!editing) {
      if (!password) return 'Login password is required.'
      if (password.length < 6) return 'Password must be at least 6 characters.'
    } else if (password && password.length < 6) {
      return 'Password must be at least 6 characters.'
    }

    // A manager authorizes refunds with a PIN, so a manager without one
    // cannot do the job. An existing PIN is kept when the field stays empty.
    const pinRequired = role === 'MANAGER' && !(editing && user?.hasPin)
    if (pinRequired && !/^\d{6}$/.test(pin)) {
      return 'Managers require a 6-digit authorization PIN.'
    }
    if (pin && !/^\d{4,8}$/.test(pin)) {
      return 'PIN must be 4 to 8 digits.'
    }
    if (pin && role === 'MANAGER' && !/^\d{6}$/.test(pin)) {
      return 'A manager PIN must be exactly 6 digits.'
    }

    // An owner reaches every branch, so the assignment does not apply to
    // one. Every other account needs at least one branch to work at.
    if (!isOwner && selectedStoreIds.length === 0) {
      return 'Assign the account to at least one retail store.'
    }

    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    const validationError = validate()
    if (validationError) {
      setErrorMsg(validationError)
      return
    }

    try {
      if (editing && user) {
        const payload: Parameters<typeof updateMutation.mutateAsync>[0] = {
          id: user.id,
          name: name.trim(),
          email: email.trim(),
          role,
          isActive,
        }
        if (password) payload.password = password
        if (pin) payload.pin = pin.trim()
        // An owner keeps access to every branch, so the assignment is left
        // untouched rather than replaced with an empty list.
        if (!isOwner) payload.storeIds = selectedStoreIds

        await updateMutation.mutateAsync(payload)
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          email: email.trim(),
          password,
          pin: pin.trim() || undefined,
          role,
          storeIds: selectedStoreIds,
        })
      }

      resetForm()
      onOpenChange(false)
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message ||
          (editing
            ? 'Failed to save the staff account.'
            : 'Failed to create the staff account.')
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-indigo-50 text-indigo-600">
              {editing ? (
                <UserCog className="h-5 w-5" aria-hidden="true" />
              ) : (
                <UserPlus className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <DialogTitle>
              {editing ? 'Edit Staff Account' : 'Provision Staff Account'}
            </DialogTitle>
          </div>
          <DialogDescription>
            {editing
              ? 'Update the name, role, branch access, and sign-in details'
              : 'Create Cashier or Store Manager with branch access permissions'}
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div
            role="alert"
            className="rounded bg-red-50 p-3 text-xs text-red-700 border border-red-200 flex items-start gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="staff-name" className="block text-xs font-medium text-slate-700 mb-1">
              Full Name *
            </label>
            <Input
              id="staff-name"
              placeholder="e.g. Budi Santoso"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="staff-email" className="block text-xs font-medium text-slate-700 mb-1">
                Email Address *
              </label>
              <Input
                id="staff-email"
                type="email"
                placeholder="kasir@toko.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="staff-password" className="block text-xs font-medium text-slate-700 mb-1">
                {editing ? 'New Password (optional)' : 'Login Password *'}
              </label>
              <Input
                id="staff-password"
                type="password"
                placeholder={editing ? 'Leave blank to keep' : '••••••••'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!editing}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="staff-role" className="block text-xs font-medium text-slate-700 mb-1">
                Role Assignment *
              </label>
              <select
                id="staff-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={isOwner}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
              >
                {isOwner && <option value="OWNER">Owner</option>}
                <option value="CASHIER">Cashier</option>
                <option value="MANAGER">Manager</option>
              </select>
              {/*
                The role names stay short so the select never truncates them.
                What each role may do is spelled out underneath instead.
              */}
              <p className="mt-1 text-[11px] text-slate-500">
                {isOwner
                  ? 'An owner reaches every branch. The role cannot be changed from this screen.'
                  : role === 'MANAGER'
                    ? 'A manager approves refunds with a 6-digit PIN.'
                    : 'A cashier records sales and shifts only.'}
              </p>
            </div>

            <div>
              <label htmlFor="staff-pin" className="block text-xs font-medium text-slate-700 mb-1">
                {role === 'MANAGER' && !user?.hasPin ? 'Supervisor PIN *' : 'Supervisor PIN'}
              </label>
              <Input
                id="staff-pin"
                type="password"
                maxLength={8}
                inputMode="numeric"
                placeholder={editing ? 'Leave blank to keep' : '6 digits'}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </div>
          </div>

          <fieldset>
            <legend className="block text-xs font-medium text-slate-700 mb-1">
              Store Access Permissions *
            </legend>
            <div className="border border-slate-200 rounded-md p-2 space-y-1.5 max-h-32 overflow-y-auto">
              {stores.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1 rounded hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                    checked={selectedStoreIds.includes(s.id)}
                    disabled={isOwner}
                    onChange={() => handleStoreToggle(s.id)}
                  />
                  <span>
                    {s.name} ({s.code})
                  </span>
                </label>
              ))}
            </div>
            {isOwner && (
              <p className="mt-1 text-[11px] text-slate-500">
                An owner reaches every branch, so the assignment does not apply.
              </p>
            )}
          </fieldset>

          {editing && !isOwner && (
            <div className="flex items-center gap-2">
              <input
                id="staff-active"
                type="checkbox"
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <label htmlFor="staff-active" className="text-xs text-slate-700 cursor-pointer">
                Account is active and may sign in
              </label>
            </div>
          )}

          <DialogFooter className="mt-4 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm()
                onOpenChange(false)
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? editing
                  ? 'Saving...'
                  : 'Creating...'
                : editing
                  ? 'Save changes'
                  : 'Create Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
