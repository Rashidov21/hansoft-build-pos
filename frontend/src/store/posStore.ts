import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartNameFields } from '../utils/posCartName'
import { formatPosCartLineName } from '../utils/posCartName'
import { parseQty, type ProductUnit } from '../utils/qty'

export type CartLine = {
  variantId: string
  productId: string
  barcode: string
  name: string
  nameFields?: CartNameFields
  listPrice: string
  /** Kelish narxi — faqat admin/owner POS da ko'radi. */
  purchasePrice?: string
  stockQty?: number
  qty: number
  /** kg = weight (price per kg); dona = pieces */
  unit?: ProductUnit
  /** Bonus line: listPrice kept for display; paid amount treated as 0. */
  isBonus?: boolean
}

export type PayMode = 'CASH' | 'CARD' | 'DEBT'

export type SuspendedCart = {
  id: string
  items: CartLine[]
  total: number
  timestamp: string
  label: string
}

export type CartLineKeyFields = {
  variantId: string
  isBonus?: boolean
}

/** Stable cart identity — bonus lines stay separate from normal lines of the same variant. */
export function cartLineKey(c: CartLineKeyFields): string {
  const bonus = c.isBonus ? ':b' : ''
  return `v:${c.variantId}${bonus}`
}

function matchesLine(c: CartLine, fields: CartLineKeyFields): boolean {
  return cartLineKey(c) === cartLineKey(fields)
}

type PosState = {
  cart: CartLine[]
  suspendedCarts: SuspendedCart[]
  sessionSeq: number
  payMode: PayMode
  customerName: string
  customerPhone: string
  addLine: (line: Omit<CartLine, 'qty'> & { qty?: number }) => void
  incQty: (variantId: string, delta: number, opts?: { isBonus?: boolean }) => void
  setQty: (variantId: string, qty: number, opts?: { isBonus?: boolean }) => void
  clearCart: () => void
  setPayMode: (m: PayMode) => void
  setCustomer: (name: string, phone: string) => void
  updateLinePrice: (variantId: string, listPrice: string, opts?: { isBonus?: boolean }) => void
  updateLineStock: (variantId: string, stockQty: number) => void
  /** Toggle bonus on the exact cart line (paid vs bonus of same variant stay distinct). */
  toggleLineBonus: (fields: CartLineKeyFields) => void
  setLineBonus: (fields: CartLineKeyFields, isBonus: boolean) => void
  setCart: (items: CartLine[]) => void
  refreshCartNames: (lang: string) => void
  holdCart: (payload: { items: CartLine[]; total: number; label?: string }) => SuspendedCart
  resumeCart: (id: string) => SuspendedCart | null
  deleteSuspendedCart: (id: string) => void
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      cart: [],
      suspendedCarts: [],
      sessionSeq: 0,
      payMode: 'CASH',
      customerName: '',
      customerPhone: '',
      addLine: (line) => {
        const cart = get().cart
        const unit: ProductUnit = line.unit === 'dona' ? 'dona' : 'kg'
        const add = parseQty(line.qty ?? (unit === 'dona' ? 1 : 0.1))
        const isBonus = Boolean(line.isBonus)
        const key = cartLineKey({ variantId: line.variantId, isBonus })

        const existing = cart.find(
          (c) => c.variantId === line.variantId && Boolean(c.isBonus) === isBonus,
        )
        if (existing) {
          set({
            cart: cart.map((c) =>
              cartLineKey(c) === key
                ? {
                    ...c,
                    qty: parseQty(c.qty + add),
                    unit: c.unit || unit,
                    productId: c.productId || line.productId,
                    nameFields: line.nameFields ?? c.nameFields,
                    name: line.name || c.name,
                    purchasePrice: line.purchasePrice ?? c.purchasePrice,
                  }
                : c,
            ),
          })
        } else {
          set({
            cart: [
              ...cart,
              {
                variantId: line.variantId,
                productId: line.productId,
                barcode: line.barcode,
                name: line.name,
                nameFields: line.nameFields,
                listPrice: line.listPrice,
                purchasePrice: line.purchasePrice,
                stockQty: line.stockQty,
                qty: add,
                unit,
                isBonus,
              },
            ],
          })
        }
      },
      incQty: (variantId, delta, opts) => {
        const isBonus = Boolean(opts?.isBonus)
        set({
          cart: get()
            .cart.map((c) => {
              if (c.variantId !== variantId) return c
              if (Boolean(c.isBonus) !== isBonus) return c
              return { ...c, qty: parseQty(Math.max(0, c.qty + delta)) }
            })
            .filter((c) => c.qty > 0),
        })
      },
      setQty: (variantId, qty, opts) => {
        const next = parseQty(Math.max(0, Number(qty) || 0))
        const isBonus = Boolean(opts?.isBonus)
        set({
          cart: get()
            .cart.map((c) => {
              if (c.variantId !== variantId) return c
              if (Boolean(c.isBonus) !== isBonus) return c
              return { ...c, qty: next }
            })
            .filter((c) => c.qty > 0),
        })
      },
      clearCart: () => set({ cart: [] }),
      setPayMode: (m) => set({ payMode: m }),
      setCustomer: (name, phone) => set({ customerName: name, customerPhone: phone }),
      updateLinePrice: (variantId, listPrice, opts) =>
        set({
          cart: get().cart.map((c) => {
            if (c.variantId !== variantId) return c
            if (Boolean(c.isBonus) !== Boolean(opts?.isBonus)) return c
            return { ...c, listPrice }
          }),
        }),
      updateLineStock: (variantId, stockQty) =>
        set({
          cart: get().cart.map((c) => (c.variantId === variantId ? { ...c, stockQty } : c)),
        }),
      toggleLineBonus: (fields) => {
        const cart = get().cart
        const target = cart.find((c) => matchesLine(c, fields))
        if (!target) return
        const nextBonus = !target.isBonus
        const nextKey = cartLineKey({ variantId: target.variantId, isBonus: nextBonus })
        const collide = cart.find((c) => cartLineKey(c) === nextKey && c !== target)
        if (collide) {
          set({
            cart: cart
              .map((c) => {
                if (c === collide) return { ...c, qty: c.qty + target.qty }
                return c
              })
              .filter((c) => c !== target),
          })
          return
        }
        set({
          cart: cart.map((c) => (c === target ? { ...c, isBonus: nextBonus } : c)),
        })
      },
      setLineBonus: (fields, isBonus) => {
        set({
          cart: get().cart.map((c) => (matchesLine(c, fields) ? { ...c, isBonus } : c)),
        })
      },
      setCart: (items) => set({ cart: items }),
      refreshCartNames: (lang) => {
        set({
          cart: get().cart.map((c) =>
            c.nameFields
              ? { ...c, name: formatPosCartLineName(c.nameFields, lang) }
              : c,
          ),
        })
      },
      holdCart: ({ items, total, label }) => {
        const nextSeq = get().sessionSeq + 1
        const cartLabel = label || `Mijoz #${nextSeq}`
        const now = new Date()
        const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        const suspended: SuspendedCart = {
          id: crypto.randomUUID(),
          items,
          total,
          timestamp,
          label: cartLabel,
        }
        set((state) => ({
          suspendedCarts: [suspended, ...state.suspendedCarts],
          sessionSeq: nextSeq,
        }))
        return suspended
      },
      resumeCart: (id) => {
        const found = get().suspendedCarts.find((c) => c.id === id) || null
        if (!found) return null
        set((state) => ({
          cart: found.items,
          suspendedCarts: state.suspendedCarts.filter((c) => c.id !== id),
        }))
        return found
      },
      deleteSuspendedCart: (id) =>
        set((state) => ({
          suspendedCarts: state.suspendedCarts.filter((c) => c.id !== id),
        })),
    }),
    {
      name: 'geeks-pos-cart',
      partialize: (s) => ({
        cart: s.cart,
        suspendedCarts: s.suspendedCarts,
        sessionSeq: s.sessionSeq,
        payMode: s.payMode,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
      }),
    },
  ),
)
