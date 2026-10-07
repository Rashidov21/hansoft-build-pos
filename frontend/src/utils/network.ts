/**
 * Network connectivity utilities.
 *
 * IMPORTANT: In the packaged Tauri (WebView2) app, probing external hosts
 * (Google/Cloudflare) directly from the webview is unreliable — `no-cors`
 * HEAD requests are frequently blocked or hang, producing false "offline"
 * results even when the machine is online.
 *
 * The thing that actually matters for this app is whether the *backend* can
 * reach the internet, because Z-reports / WhatsApp messages are sent from the
 * Python backend, not the webview. So we ask the backend (over 127.0.0.1,
 * always allowed by CSP) and only fall back to a webview/OS signal if that
 * call itself fails.
 */
import { fetchBackendConnectivity } from '../api'

/**
 * Check if internet connection is available.
 *
 * Resolution order:
 *  1. If the OS reports the adapter is offline -> definitely offline.
 *  2. Ask the backend (authoritative: it's what sends the reports).
 *  3. If the backend call fails for any reason, fall back to navigator.onLine
 *     so a working connection is never falsely reported as offline.
 */
export async function checkInternetConnection(): Promise<boolean> {
  // Instant local signal: when the adapter is down we are certainly offline.
  if (!navigator.onLine) {
    return false
  }

  try {
    return await fetchBackendConnectivity()
  } catch (error) {
    // Backend unreachable or errored — don't claim "offline" on a probe failure.
    console.warn('Backend connectivity check failed, falling back to navigator.onLine:', error)
    return navigator.onLine
  }
}

/**
 * Check if online with navigator.onLine (instant but less reliable).
 */
export function isOnline(): boolean {
  return navigator.onLine
}

/**
 * Wait for internet connection to be restored.
 * @param maxAttempts Maximum number of retry attempts
 * @param delayMs Delay between attempts in milliseconds
 */
export async function waitForConnection(
  maxAttempts: number = 10,
  delayMs: number = 2000,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkInternetConnection()) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return false
}
