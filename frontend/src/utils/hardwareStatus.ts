export type PrinterHeuristic = 'ok' | 'default_printer' | 'missing' | 'no_device_list'

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function matchesList(name: string, options: string[]): boolean {
  const n = norm(name)
  if (!n) return true
  return options.some((o) => norm(o) === n)
}

/** Tauri `list_printers` bo'sh bo'lsa — qurilmalar ro'yxati noma'lum. */
export function receiptPrinterStatus(
  printerOptions: string[],
  receiptName: string,
): PrinterHeuristic {
  if (printerOptions.length === 0) return 'no_device_list'
  if (!receiptName.trim()) return 'default_printer'
  return matchesList(receiptName, printerOptions) ? 'ok' : 'missing'
}

export function labelPrinterStatus(printerOptions: string[], labelName: string): PrinterHeuristic {
  if (printerOptions.length === 0) return 'no_device_list'
  if (!labelName.trim()) return 'default_printer'
  return matchesList(labelName, printerOptions) ? 'ok' : 'missing'
}
