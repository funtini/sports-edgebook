import { beforeEach } from 'vitest'
import { config } from '@vue/test-utils'
import { i18n } from '@/i18n'

// Every mounted component gets vue-i18n; tests run in PT-PT unless they switch.
config.global.plugins.push(i18n)

beforeEach(() => {
  i18n.global.locale.value = 'pt-PT'
})
