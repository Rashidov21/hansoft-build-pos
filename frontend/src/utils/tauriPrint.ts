/** Raw ESC/POS to Windows printer via Tauri (empty name → OS default printer). */
export async function printEscposBase64(payload: string, printerName?: string | null): Promise<string> {
  return printRawBase64(payload, printerName)
}

/** Protocol-agnostic RAW payload to Windows spooler via Tauri. */
/** @returns Backend message (includes chosen printer queue name). */
export async function printRawBase64(payload: string, printerName?: string | null): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/tauri')
  const name = printerName?.trim() || null
  return invoke<string>('print_raw', { payload, printer_name: name })
}

/** Installed printers from Tauri (Windows). */
export async function listInstalledPrinters(): Promise<string[]> {
  try {
    const { invoke } = await import('@tauri-apps/api/tauri')
    const names = await invoke<string[]>('list_printers')
    return Array.isArray(names) ? names : []
  } catch {
    return []
  }
}
