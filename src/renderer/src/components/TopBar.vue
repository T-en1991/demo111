<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { HomeFilled, SwitchButton } from '@element-plus/icons-vue'
import { useAppStore } from '../store/app'

const router = useRouter()
const route = useRoute()
const app = useAppStore()

function goHome(): void {
  router.push({ name: 'home' })
}

function exitApp(): void {
  // 登出并返回登录页，清除登录态
  app.logout()
  router.push({ name: 'login' })
  ElMessage.success('已退出登录')
}
</script>

<template>
  <section class="global-topbar" v-if="route.name !== 'login'">
    <div class="brand-name">某某某系统</div>
    <div class="right-actions">
      <el-tooltip effect="dark" content="返回主页" placement="bottom">
        <el-button type="primary" circle plain @click="goHome">
          <el-icon><HomeFilled /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip effect="dark" content="退出登录" placement="bottom">
        <el-button type="danger" circle plain @click="exitApp">
          <el-icon><SwitchButton /></el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </section>
  
</template>

<style scoped>
.global-topbar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background-color: rgba(13, 18, 32, 0.88);
  backdrop-filter: blur(10px);
}
.brand-name {
  color: #fff;
  font-weight: 700;
  letter-spacing: 0.4px;
}
.right-actions {
  display: flex;
  gap: 10px;
}
</style>