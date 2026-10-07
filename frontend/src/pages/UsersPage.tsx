import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Eye, EyeOff, Plus, Edit2, Trash2 } from 'lucide-react'
import { fetchUsers, createUser, updateUser, deleteUser, type UserRow } from '../api'
import { ActionToast } from '../components/ActionToast'

type UserFormData = {
  username: string
  pin: string
  role: 'CASHIER' | 'ADMIN' | 'OWNER'
}

const emptyForm: UserFormData = {
  username: '',
  pin: '',
  role: 'CASHIER',
}

export function UsersPage() {
  const { t } = useTranslation()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [formData, setFormData] = useState<UserFormData>(emptyForm)
  const [showPin, setShowPin] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<UserRow | null>(null)

  async function loadUsers() {
    try {
      setLoading(true)
      const data = await fetchUsers()
      setUsers(data)
    } catch (err) {
      setToast({ kind: 'err', msg: t('err.API_ERROR') })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreateModal() {
    setEditingUser(null)
    setFormData(emptyForm)
    setShowPin(false)
    setShowModal(true)
  }

  function openEditModal(user: UserRow) {
    setEditingUser(user)
    setFormData({
      username: user.username,
      pin: '',
      role: user.role as 'CASHIER' | 'ADMIN' | 'OWNER',
    })
    setShowPin(false)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingUser(null)
    setFormData(emptyForm)
    setShowPin(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    // Validation
    if (!formData.username || formData.username.length < 3) {
      setToast({ kind: 'err', msg: t('admin.users.errorUsernameShort') })
      return
    }
    
    if (!formData.pin || formData.pin.length !== 4 || !/^\d{4}$/.test(formData.pin)) {
      setToast({ kind: 'err', msg: t('admin.users.errorPinInvalid') })
      return
    }

    setSaving(true)
    setToast(null)

    try {
      if (editingUser) {
        // Update existing user
        const payload: Record<string, unknown> = {
          role: formData.role,
          pin_enabled: true,
          pin: formData.pin,
        }
        
        await updateUser(editingUser.id, payload)
        setToast({ kind: 'ok', msg: t('admin.users.userUpdated') })
      } else {
        // Create new user - PIN is the password
        await createUser({
          username: formData.username,
          password: formData.pin,
          first_name: '',
          last_name: '',
          email: '',
          role: formData.role,
          pin_enabled: true,
          pin: formData.pin,
        })
        setToast({ kind: 'ok', msg: t('admin.users.userCreated') })
      }
      
      closeModal()
      await loadUsers()
    } catch (err: unknown) {
      const code = (err as Error & { code?: string }).code
      setToast({ kind: 'err', msg: t(`err.${code || 'API_ERROR'}`) })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(user: UserRow) {
    setSaving(true)
    setToast(null)
    
    try {
      await deleteUser(user.id)
      setToast({ kind: 'ok', msg: t('admin.users.userDeleted') })
      setDeleteConfirm(null)
      await loadUsers()
    } catch (err: unknown) {
      const code = (err as Error & { code?: string }).code
      setToast({ kind: 'err', msg: t(`err.${code || 'API_ERROR'}`) })
    } finally {
      setSaving(false)
    }
  }

  function getRoleBadgeClass(role: string) {
    switch (role) {
      case 'OWNER':
        return 'bg-purple-950/60 text-purple-200 border-purple-800/80'
      case 'ADMIN':
        return 'bg-blue-950/60 text-blue-200 border-blue-800/80'
      case 'CASHIER':
      default:
        return 'bg-slate-800/60 text-slate-200 border-slate-700/80'
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('admin.users.title')}</h2>
          <p className="text-sm text-slate-400 mt-1">{t('admin.users.hint')}</p>
        </div>
        <button
          type="button"
          className="touch-btn min-h-12 px-5 rounded-xl bg-emerald-700 border border-emerald-500 font-medium flex items-center gap-2"
          onClick={openCreateModal}
        >
          <Plus className="h-5 w-5" />
          {t('admin.users.addUser')}
        </button>
      </div>

      {toast && <ActionToast kind={toast.kind} message={toast.msg} onClose={() => setToast(null)} />}

      {loading ? (
        <div className="text-center py-12 text-slate-400">{t('admin.common.loading')}</div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-semibold text-slate-100">{user.username}</h3>
                    <span className={`inline-block px-3 py-1 rounded-lg text-xs border font-medium ${getRoleBadgeClass(user.role)}`}>
                      {t(`admin.users.role${user.role.charAt(0) + user.role.slice(1).toLowerCase()}`)}
                    </span>
                    {user.pin_enabled && (
                      <span className="inline-block px-3 py-1 rounded-lg text-xs border border-amber-700/80 bg-amber-950/50 text-amber-200 font-medium">
                        {t('admin.users.pinEnabled')}
                      </span>
                    )}
                    {user.is_superuser && (
                      <span className="inline-block px-3 py-1 rounded-lg text-xs border border-red-700/80 bg-red-950/50 text-red-200 font-medium">
                        {t('admin.users.superuser')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="touch-btn p-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300"
                    onClick={() => openEditModal(user)}
                    aria-label={t('admin.users.editUser')}
                  >
                    <Edit2 className="h-5 w-5" />
                  </button>
                  {!user.is_superuser && (
                    <button
                      type="button"
                      className="touch-btn p-3 rounded-xl bg-red-900/50 border border-red-800 hover:bg-red-900 text-red-300"
                      onClick={() => setDeleteConfirm(user)}
                      aria-label={t('admin.users.deleteUser')}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <div className="text-center py-12 text-slate-500">{t('admin.users.empty')}</div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative w-full max-w-2xl max-h-[90vh] bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-700">
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-100">
                {editingUser ? t('admin.users.editUser') : t('admin.users.addUser')}
              </h2>
              <button
                onClick={closeModal}
                className="touch-btn p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100"
                aria-label={t('admin.common.cancel')}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* Username */}
              <label className="block">
                <span className="text-sm text-slate-400">{t('admin.users.username')} *</span>
                <input
                  type="text"
                  className="touch-btn mt-1 w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  disabled={!!editingUser}
                  required
                  minLength={3}
                />
              </label>

              {/* PIN */}
              <label className="block">
                <span className="text-sm text-slate-400">{t('admin.users.pinCode')} *</span>
                <div className="relative mt-1">
                  <input
                    type={showPin ? 'text' : 'password'}
                    className="touch-btn w-full min-h-12 px-3 pr-12 rounded-xl bg-slate-950 border border-slate-700 text-slate-100"
                    value={formData.pin}
                    onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                    placeholder="1234"
                    maxLength={4}
                    pattern="\d{4}"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-100"
                    onClick={() => setShowPin(!showPin)}
                  >
                    {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">{t('admin.users.pinHint')}</p>
              </label>

              {/* Role */}
              <label className="block">
                <span className="text-sm text-slate-400">{t('admin.users.role')} *</span>
                <select
                  className="touch-btn mt-1 w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'CASHIER' | 'ADMIN' | 'OWNER' })}
                  required
                >
                  <option value="CASHIER">{t('admin.users.roleCashier')}</option>
                  <option value="ADMIN">{t('admin.users.roleAdmin')}</option>
                  <option value="OWNER">{t('admin.users.roleOwner')}</option>
                </select>
              </label>
            </form>

            {/* Footer */}
            <div className="border-t border-slate-700 p-4 sm:p-6 flex justify-end gap-3">
              <button
                type="button"
                className="touch-btn min-h-12 px-6 rounded-xl bg-slate-800 border border-slate-600 text-slate-100 font-medium hover:bg-slate-700"
                onClick={closeModal}
              >
                {t('admin.common.cancel')}
              </button>
              <button
                type="submit"
                className="touch-btn min-h-12 px-6 rounded-xl bg-emerald-700 border border-emerald-500 text-white font-medium hover:bg-emerald-600 disabled:opacity-50"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? t('admin.common.saving') : t('admin.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-100">
              {t('admin.users.deleteConfirmTitle')}
            </h3>
            <p className="text-sm text-slate-300">
              {t('admin.users.deleteConfirmBody', { username: deleteConfirm.username })}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-700 font-medium"
                onClick={() => setDeleteConfirm(null)}
              >
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                className="touch-btn min-h-12 px-5 rounded-xl bg-red-700 border border-red-500 font-medium disabled:opacity-50"
                onClick={() => void handleDelete(deleteConfirm)}
                disabled={saving}
              >
                {saving ? t('admin.common.loading') : t('admin.common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
