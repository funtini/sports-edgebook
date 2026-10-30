import { onMounted, onUnmounted } from 'vue'

/** True when the key press is meant for a field (typing), not for a page shortcut. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

/**
 * Runs `action` when the single letter `key` is pressed anywhere on the page while the component
 * is mounted. Ignored while typing in a field and with Ctrl, Cmd or Alt held, so browser
 * shortcuts keep working.
 */
export function useKeyShortcut(key: string, action: () => void) {
  function onKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.repeat) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key.toLowerCase() !== key.toLowerCase()) return
    if (isTyping(event.target)) return
    event.preventDefault()
    action()
  }

  onMounted(() => document.addEventListener('keydown', onKeydown))
  onUnmounted(() => document.removeEventListener('keydown', onKeydown))
}
