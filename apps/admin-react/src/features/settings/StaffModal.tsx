import React, { useState } from 'react'
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
import { Role, Store } from '@/api/types'
import { useCreateUser } from '@/api/queries'
import { AlertCircle, UserPlus } from 'lucide-react'

interface StaffModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stores: Store[]
}

export const StaffModal: React.FC<StaffModalProps> = ({
  open,
  onOpenChange,
  stores,
}) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState<Role>('CASHIER')
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const createMutation = useCreateUser()

  const handleStoreToggle = (storeId: string) => {
    setSelectedStoreIds((prev) =>
      prev.includes(storeId)
        ? prev.filter((id) => id !== storeId)
        : [...prev, storeId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!name.trim() || !email.trim() || !password) {
      setErrorMsg('Name, email, and password are required.')
      return
    }

    if (role === 'MANAGER' && (!pin || pin.length < 4)) {
      setErrorMsg('Managers require a 4-6 digit authorization PIN.')
      return
    }

    if (selectedStoreIds.length === 0) {
      setErrorMsg('Please assign the user to at least one retail store.')
      return
    }

    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        password,
        pin: pin.trim() || undefined,
        role,
        storeIds: selectedStoreIds,
      })
      onOpenChange(false)
      setName('')
      setEmail('')
      setPassword('')
      setPin('')
      setSelectedStoreIds([])
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to create staff account.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-indigo-50 text-indigo-600">
              <UserPlus className="h-5 w-5" />
            </div>
            <DialogTitle>Provision Staff Account</DialogTitle>
          </div>
          <DialogDescription>
            Create Cashier or Store Manager with branch access permissions
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="rounded bg-red-50 p-3 text-xs text-red-700 border border-red-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Full Name *
            </label>
            <Input
              placeholder="e.g. Budi Santoso"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Email Address *
              </label>
              <Input
                type="email"
                placeholder="kasir@toko.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Login Password *
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Role Assignment *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="CASHIER">Cashier (POS Operator)</option>
                <option value="MANAGER">Manager (POS + Supervisor Overrides)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Supervisor PIN {role === 'MANAGER' && '*'}
              </label>
              <Input
                type="password"
                maxLength={6}
                placeholder="6 digits"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Store Access Permissions *
            </label>
            <div className="border border-slate-200 rounded-md p-2 space-y-1.5 max-h-32 overflow-y-auto">
              {stores.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1 rounded hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    checked={selectedStoreIds.includes(s.id)}
                    onChange={() => handleStoreToggle(s.id)}
                  />
                  <span>
                    {s.name} ({s.code})
                  </span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
