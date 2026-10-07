import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

type Role = 'CASHIER' | 'ADMIN' | 'OWNER' | null

export function ProtectedRoute({
  role,
  allow,
  children,
}: {
  role: Role
  allow: Array<'CASHIER' | 'ADMIN' | 'OWNER'>
  children: ReactNode
}) {
  if (!role || !allow.includes(role)) {
    return <Navigate to="/pos" replace />
  }
  return children
}
