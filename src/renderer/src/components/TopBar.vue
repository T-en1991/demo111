<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { HomeFilled, SwitchButton } from '@element-plus/icons-vue'
import { useAppStore } from '../store/app'
import { useFishControlStore } from '../store/fishControl'

const router = useRouter()
const route = useRoute()
const app = useAppStore()
const fishStore = useFishControlStore()

function goHome(): void {
  router.push({ name: 'home' })
}

function exitApp(): void {
  ElMessageBox.confirm('确定要退出登录吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => {
      // 登出并返回登录页，清除登录态
      app.logout()
      router.push({ name: 'login' })
      ElMessage.success('已退出登录')
    })
    .catch(() => {
      // 取消操作
    })
}
</script>

<template>
  <section v-if="route.name !== 'login'" class="global-topbar">
    <div class="brand-name">深海鲲鹏-鲸鲨监控系统</div>
    <div class="right-actions">
      <span v-if="fishStore.currentFish" class="current-device">
        当前设备：{{ fishStore.currentFish.name }}
      </span>
      <span v-if="fishStore.currentStatus?.label" class="current-status">
        最新状态：{{ fishStore.currentStatus.label }}
      </span>
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
  /* 轻微渐变的半透明背景，提高质感 */
  background: linear-gradient(
    90deg,
    rgba(13, 18, 32, 0.92) 0%,
    rgba(18, 26, 40, 0.88) 50%,
    rgba(22, 30, 44, 0.92) 100%
  );
  backdrop-filter: blur(10px);
}
.brand-name {
  /* 品牌名渐变文字 */
  background: linear-gradient(90deg, #8ec5ff 0%, #a695ff 50%, #f39c79 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  font-weight: 700;
  letter-spacing: 0.4px;
}
.right-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.current-device {
  font-size: 14px;
  color: #a6b0c3;
  margin-right: 8px;
  font-weight: 500;
}
</style>
