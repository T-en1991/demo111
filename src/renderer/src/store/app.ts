import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    counter: 0,
    isAuthenticated: false
  }),
  actions: {
    increment() {
      this.counter += 1
    },
    login() {
      this.isAuthenticated = true
    },
    logout() {
      this.isAuthenticated = false
    }
  },
  // 使用 pinia-plugin-persistedstate 持久化指定字段
  persist: {
    key: 'app',
    pick: ['counter'],
    storage: localStorage
  }
})