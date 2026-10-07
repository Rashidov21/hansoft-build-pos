/**
 * Node smoke-test for calcCashChange (qaytim).
 * Run: node frontend/src/utils/cashChange.test.mjs
 */
import assert from 'node:assert/strict'

function calcCashChange(input) {
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

// Exact cash
assert.deepEqual(calcCashChange({ grand: 68000, cashTendered: 68000, nonCashPaid: 0 }), {
  cashOwed: 68000,
  change: 0,
  shortfall: 0,
})

// Qaytim
assert.deepEqual(calcCashChange({ grand: 68000, cashTendered: 100000, nonCashPaid: 0 }), {
  cashOwed: 68000,
  change: 32000,
  shortfall: 0,
})

// Shortfall
assert.deepEqual(calcCashChange({ grand: 68000, cashTendered: 50000, nonCashPaid: 0 }), {
  cashOwed: 68000,
  change: 0,
  shortfall: 18000,
})

// Split: card 40k + cash tendered 100k for grand 100k → cashOwed 60k, change 40k
assert.deepEqual(calcCashChange({ grand: 100000, cashTendered: 100000, nonCashPaid: 40000 }), {
  cashOwed: 60000,
  change: 40000,
  shortfall: 0,
})

// Bug regression: must NOT be tendered - grand when nonCash present
const wrong = 100000 - 100000 // 0 if someone used grand instead of cashOwed
const right = calcCashChange({ grand: 100000, cashTendered: 100000, nonCashPaid: 40000 }).change
assert.equal(right, 40000)
assert.notEqual(right, wrong)

// Pure card — no cash panel math
assert.deepEqual(calcCashChange({ grand: 50000, cashTendered: 0, nonCashPaid: 50000 }), {
  cashOwed: 0,
  change: 0,
  shortfall: 0,
})

console.log('cashChange.test.mjs: OK')
