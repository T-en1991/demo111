import type {} from '../env.d.ts'
import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import Home from '../views/home/index.vue'
import About from '../views/about/index.vue'
import Login from '../views/login/index.vue'
import Screen from '../views/screen/index.vue'
import FishManage from '../views/fish/index.vue'
import Alerts from '../views/alerts/index.vue'
import pinia from '../store'
import { useAppStore } from '../store/app'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: Home
  },
  {
    path: '/screen',
    name: 'screen',
    component: Screen
  },
  {
    path: '/fish',
    name: 'fish',
    component: FishManage
  },
  {
    path: '/alerts',
    name: 'alerts',
    component: Alerts
  },
  {
    path: '/logs',
    name: 'logs',
    component: () => import('../views/logs/index.vue')
  },
  {
    path: '/about',
    name: 'about',
    component: About
  },
  {
    path: '/login',
    name: 'login',
    component: Login
  }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 全局路由守卫：未登录仅允许访问 Login
router.beforeEach((to) => {
  const app = useAppStore(pinia)
  if (to.name !== 'login' && !app.isAuthenticated) {
    return { name: 'login' }
  }
  return true
})