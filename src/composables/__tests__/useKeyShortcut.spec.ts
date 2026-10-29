import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useKeyShortcut } from '../useKeyShortcut'

let wrapper: VueWrapper | undefined

function setup() {
  const action = vi.fn<() => void>()
  wrapper = mount(
    defineComponent({
      setup() {
        useKeyShortcut('n', action)
        return () =>
          h('div', [h('input'), h('textarea'), h('select'), h('div', { contenteditable: 'true' })])
      },
    }),
    { attachTo: document.body },
  )
  return action
}

const press = (target: EventTarget, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true, ...init }))

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('useKeyShortcut', () => {
  it('runs on the key, in either case', () => {
    const action = setup()
    press(document.body)
    press(document.body, { key: 'N' })
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('ignores other keys and modifier combinations', () => {
    const action = setup()
    press(document.body, { key: 'm' })
    press(document.body, { ctrlKey: true })
    press(document.body, { metaKey: true })
    press(document.body, { altKey: true })
    press(document.body, { repeat: true })
    expect(action).not.toHaveBeenCalled()
  })

  it('ignores the key while typing in a field', () => {
    const action = setup()
    for (const selector of ['input', 'textarea', 'select']) press(wrapper!.get(selector).element)
    const editable = wrapper!.get('[contenteditable]').element as HTMLElement
    // jsdom does not compute isContentEditable from the attribute.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    press(editable)
    expect(action).not.toHaveBeenCalled()
  })

  it('stops listening once unmounted', () => {
    const action = setup()
    wrapper!.unmount()
    wrapper = undefined
    press(document.body)
    expect(action).not.toHaveBeenCalled()
  })
})
