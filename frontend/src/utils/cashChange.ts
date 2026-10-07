/**
 * Naqd qaytim hisobi (POS).
 * CASH qatoridagi summa = mijoz bergan (tendered).
 * Qaytim = berilgan − naqd qismi (jami − karta/nasiya).
 */

export type CashChangeInput = {
  grand: number
  /** Sum of CASH payment rows (what customer handed). */
  cashTendered: number
  /** Sum of CARD + DEBT rows. */
  nonCashPaid: number
}

export type CashChangeResult = {
  cashOwed: number
  change: number
  /** Berilgan < naqd kerak */
  shortfall: number
}

export function calcCashChange(input: CashChangeInput): CashChangeResult {
  const grand = Math.max(0, Number(input.grand) || 0)
  const cashTendered = Math.max(0, Number(input.cashTendered) || 0)
  const nonCashPaid = Math.max(0, Number(input.nonCashPaid) || 0)
  const cashOwed = Math.max(0, grand - nonCashPaid)
  if (cashOwed <= 0) {
    return { cashOwed: 0, change: 0, shortfall: 0 }
  }
  const change = cashTendered > cashOwed ? cashTendered - cashOwed : 0
  const shortfall = cashTendered < cashOwed ? cashOwed - cashTendered : 0
  return { cashOwed, change, shortfall }
}
