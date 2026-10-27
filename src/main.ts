import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'

import App from './App.vue'
import { i18n, syncLocale } from './i18n'
import router from './router'
import { EdgebookPreset } from './theme'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: EdgebookPreset,
    options: { darkModeSelector: '.app-dark' },
  },
})
app.use(ToastService)
app.use(i18n)
syncLocale(app.config.globalProperties.$primevue)

app.mount('#app')
