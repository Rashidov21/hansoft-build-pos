/** Windows machine id from Tauri (HKLM Cryptography MachineGuid). */
export async function getTauriMachineId(): Promise<string | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/tauri')
    const id = await invoke<string>('machine_id')
    return id?.trim() || null
  } catch {
    return null
  }
}
