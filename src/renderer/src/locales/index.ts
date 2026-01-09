import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'
import enUS from './en-US'

const i18n = createI18n({
  legacy: false, // use Composition API
  locale: 'en-US', // set locale
  fallbackLocale: 'en-US', // set fallback locale
  globalInjection: true, // global injection
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

export default i18n
