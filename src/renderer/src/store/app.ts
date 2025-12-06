import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    counter: 0,
    isAuthenticated: false,
    selectedRobotId: 'A1'
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
    },
    setSelectedRobotId(id: string) {
      this.selectedRobotId = id
    }
  },
  // 使用 pinia-plugin-persistedstate 持久化指定字段
  persist: {
    key: 'app',
    pick: ['counter', 'selectedRobotId'],
    storage: localStorage
  }
})
