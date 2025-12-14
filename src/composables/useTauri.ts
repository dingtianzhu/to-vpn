import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { onMounted, onUnmounted } from 'vue'

export function useTauri() {
  return {
    invoke,
    listen,
  }
}

export function useTauriEvent<T>(
  event: string,
  handler: (payload: T) => void
) {
  let unlisten: (() => void) | null = null

  onMounted(async () => {
    unlisten = await listen<T>(event, (e) => {
      handler(e.payload)
    })
  })

  onUnmounted(() => {
    unlisten?.()
  })
}
