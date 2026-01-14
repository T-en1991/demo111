<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { HomeFilled, SwitchButton } from '@element-plus/icons-vue'
import { useAppStore } from '../store/app'
import { useFishControlStore } from '../store/fishControl'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const route = useRoute()
const app = useAppStore()
const fishStore = useFishControlStore()
const { t, locale } = useI18n()

function goHome(): void {
  router.push({ name: 'home' })
}

function handleLanguage(lang: string): void {
  locale.value = lang
}

function exitApp(): void {
  ElMessageBox.confirm(t('topbar.logoutConfirm'), t('topbar.tips'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning'
  })
    .then(() => {
      // 登出并返回登录页，清除登录态
      app.logout()
      router.push({ name: 'login' })
      ElMessage.success(t('topbar.logoutSuccess'))
    })
    .catch(() => {
      // 取消操作
    })
}
</script>

<template>
  <section v-if="route.name !== 'login'" class="global-topbar">
    <div class="brand-name">{{ t('topbar.brand') }}</div>
    <div class="right-actions">
      <span v-if="fishStore.currentFish" class="current-device">
        {{ t('topbar.currentDevice') }}{{ fishStore.currentFish.name }}
        <span
          v-if="fishStore.currentStatus?.statusText"
          style="margin-left: 12px; color: #8ec5ff; font-weight: bold"
        >
          [{{ t('topbar.latestCommand') }}{{ t(fishStore.currentStatus.statusText) }}]
        </span>
        <span style="margin-left: 16px; font-size: 13px; display: inline-flex; align-items: center">
          <span style="color: #a6b0c3">{{ t('topbar.satcomStatus') }}</span>
          <span
            :style="{
              color:
                fishStore.connectionStatus === 'connected'
                  ? '#67c23a'
                  : fishStore.connectionStatus === 'connecting'
                    ? '#e6a23c'
                    : '#f56c6c',
              fontWeight: 'bold'
            }"
          >
            {{ t(`topbar.${fishStore.connectionStatus}`) }}
          </span>
        </span>
      </span>

      <el-dropdown trigger="click" @command="handleLanguage">
        <el-button circle plain>
          {{ locale === 'zh-CN' ? '中文' : 'En' }}
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="zh-CN">中文</el-dropdown-item>
            <el-dropdown-item command="en-US">English</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <el-tooltip effect="dark" :content="t('topbar.home')" placement="bottom">
        <el-button type="primary" circle plain @click="goHome">
          <el-icon><HomeFilled /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip effect="dark" :content="t('topbar.logout')" placement="bottom">
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
