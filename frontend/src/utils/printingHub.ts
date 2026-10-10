import i18n from '../i18n'
import {
  fetchNakladnoyEscpos,
  fetchReceiptEscpos,
  fetchReceiptPlain,
  type NakladnoyLinePayload,
} from '../api'
import { listInstalledPrinters, printRawBase64 } from './tauriPrint'

type PrintKind = 'receipt' | 'label'

type DispatchOptions = {
  payloadBase64: string
  kind: PrintKind
  settings: PrinterSettingsLike | null
}

type PrinterSettingsLike = {
  receipt_printer_name?: string
  receipt_printer_port?: string
  label_printer_name?: string
  label_printer_port?: string
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function chooseConfiguredName(kind: PrintKind, settings: PrinterSettingsLike | null): string {
  if (kind === 'receipt') return (settings?.receipt_printer_name || '').trim()
  return (settings?.label_printer_name || '').trim()
}

function chooseConfiguredPort(kind: PrintKind, settings: PrinterSettingsLike | null): string {
  if (kind === 'receipt') return (settings?.receipt_printer_port || '').trim()
  return (settings?.label_printer_port || '').trim()
}

function otherKindName(kind: PrintKind, settings: PrinterSettingsLike | null): string {
  if (kind === 'receipt') return (settings?.label_printer_name || '').trim()
  return (settings?.receipt_printer_name || '').trim()
}

function findExact(printers: string[], expected: string): string | null {
  const needle = normalize(expected)
  if (!needle) return null
  return printers.find((p) => normalize(p) === needle) ?? null
}

/** Partial match only when exactly one installed printer matches (avoids XP-80C/365B mix-ups). */
function findUniquePartial(printers: string[], expected: string): string | null {
  const needle = normalize(expected)
  if (!needle) return null
  const matches = printers.filter((p) => normalize(p).includes(needle))
  return matches.length === 1 ? matches[0] : null
}

function assertNotOtherQueue(chosen: string, other: string): void {
  if (other && normalize(chosen) === normalize(other)) {
    throw new Error(i18n.t('err.PRINTER_SAME_QUEUE', { printer: chosen }))
  }
}

/**
 * Strict routing: each job kind uses only its configured Windows queue.
 * No model fallback (XP-80C / XP-365B), no OS default, no cross-kind reuse.
 */
export async function dispatchPrint({ payloadBase64, kind, settings }: DispatchOptions): Promise<string> {
  const configured = chooseConfiguredName(kind, settings)
  const configuredPort = chooseConfiguredPort(kind, settings)
  const other = otherKindName(kind, settings)

  if (!configured) {
    throw new Error(
      i18n.t(kind === 'label' ? 'err.LABEL_PRINTER_NOT_CONFIGURED' : 'err.RECEIPT_PRINTER_NOT_CONFIGURED'),
    )
  }
  assertNotOtherQueue(configured, other)

  const printers = await listInstalledPrinters()

  if (printers.length === 0) {
    try {
      await printRawBase64(payloadBase64, configured)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err || '')
      throw new Error(
        i18n.t('err.PRINTER_QUEUE_FAILED', { printer: configured }) + (detail ? `: ${detail}` : ''),
      )
    }
    return configured
  }

  let chosen = findExact(printers, configured)
  if (!chosen) {
    chosen = findUniquePartial(printers, configured)
  }
  if (!chosen && configuredPort) {
    const byPort = printers.filter((p) => normalize(p).includes(normalize(configuredPort)))
    if (byPort.length === 1) {
      chosen = byPort[0]
    }
  }

  if (!chosen) {
    throw new Error(i18n.t('err.PRINTER_NOT_CONNECTED', { name: configured }))
  }
  assertNotOtherQueue(chosen, other)

  try {
    await printRawBase64(payloadBase64, chosen)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err || '')
    throw new Error(
      i18n.t('err.PRINTER_QUEUE_FAILED', { printer: chosen }) + (detail ? `: ${detail}` : ''),
    )
  }
  return chosen
}

export async function dispatchReceipt(payloadBase64: string, settings: PrinterSettingsLike | null): Promise<string> {
  return dispatchPrint({ payloadBase64, kind: 'receipt', settings })
}

export async function dispatchLabel(payloadBase64: string, settings: PrinterSettingsLike | null): Promise<string> {
  return dispatchPrint({ payloadBase64, kind: 'label', settings })
}

export type PrintReceiptResult = { kind: 'escpos'; printer: string } | { kind: 'plain' }

/** Fetch ESC/POS from API and print, or plain-text + Notepad fallback. */
export async function printReceiptWithFallback(
  saleId: string,
  settings: PrinterSettingsLike | null,
): Promise<PrintReceiptResult> {
  const b64 = await fetchReceiptEscpos(saleId)
  if (b64 && b64.trim().length > 0) {
    const printer = await dispatchReceipt(b64, settings)
    return { kind: 'escpos', printer }
  }
  const plain = await fetchReceiptPlain(saleId)
  if (plain && plain.trim().length > 0) {
    const { invoke } = await import('@tauri-apps/api/tauri')
    await invoke('print_plain', { text: plain })
    return { kind: 'plain' }
  }
  throw new Error(i18n.t('err.PRINTER_RECEIPT_PAYLOAD_EMPTY'))
}

export type PrintNakladnoyResult =
  | (PrintReceiptResult & { public_no: string })
  | { kind: 'print_failed'; public_no: string; error: string; plain_text: string }

/** Print pick-list / nakladnoy from cart lines (no stock change).
 * On printer failure still returns public_no so POS can continue picking (A1). */
export async function printNakladnoyWithFallback(
  lines: NakladnoyLinePayload[],
  settings: PrinterSettingsLike | null,
  opts?: { note?: string; public_no?: string },
): Promise<PrintNakladnoyResult> {
  const res = await fetchNakladnoyEscpos({
    lines,
    note: opts?.note,
    public_no: opts?.public_no,
  })
  const public_no = res.public_no || opts?.public_no || ''
  const plain = (res.plain_text || '').trim()
  const b64 = (res.raw_base64 ?? res.escpos_base64 ?? '').trim()
  if (b64) {
    try {
      const printer = await dispatchReceipt(b64, settings)
      return { kind: 'escpos', printer, public_no }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err || '')
      return { kind: 'print_failed', public_no, error, plain_text: plain }
    }
  }
  if (plain) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri')
      await invoke('print_plain', { text: plain })
      return { kind: 'plain', public_no }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err || '')
      return { kind: 'print_failed', public_no, error, plain_text: plain }
    }
  }
  throw new Error(i18n.t('err.PRINTER_RECEIPT_PAYLOAD_EMPTY'))
}
