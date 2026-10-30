import { onScopeDispose, readonly, ref, type Ref } from 'vue'

/** Desktop layouts start at `lg` (docs/specs/ui.md, Layouts). */
export const DESKTOP_QUERY = '(min-width: 1024px)'

/** Whether `query` matches, kept live; false where `matchMedia` is missing (tests, SSR). */
export function useMediaQuery(query: string): Readonly<Ref<boolean>> {
  const list = typeof matchMedia === 'function' ? matchMedia(query) : null
  const matches = ref(list?.matches ?? false)
  const update = (event: MediaQueryListEvent) => (matches.value = event.matches)
  list?.addEventListener?.('change', update)
  onScopeDispose(() => list?.removeEventListener?.('change', update))
  return readonly(matches)
}
