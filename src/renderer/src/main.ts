import './style/global.scss'

import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import pinia from './store'

// 引入 Element Plus 及样式
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'

createApp(App).use(pinia).use(router).use(ElementPlus).mount('#app')
