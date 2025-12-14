import { ref } from 'vue'

interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}

const notifications = ref<Notification[]>([])

export function useNotification() {
  function show(
    type: Notification['type'],
    message: string,
    duration = 3000
  ) {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    notifications.value.push({ id, type, message, duration })
    
    if (duration > 0) {
      setTimeout(() => {
        remove(id)
      }, duration)
    }
    
    return id
  }

  function remove(id: string) {
    const index = notifications.value.findIndex(n => n.id === id)
    if (index > -1) {
      notifications.value.splice(index, 1)
    }
  }

  function success(message: string, duration?: number) {
    return show('success', message, duration)
  }

  function error(message: string, duration?: number) {
    return show('error', message, duration)
  }

  function warning(message: string, duration?: number) {
    return show('warning', message, duration)
  }

  function info(message: string, duration?: number) {
    return show('info', message, duration)
  }

  return {
    notifications,
    show,
    remove,
    success,
    error,
    warning,
    info,
  }
}
