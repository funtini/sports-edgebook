import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'

import App from './App.vue'
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

app.mount('#app')
