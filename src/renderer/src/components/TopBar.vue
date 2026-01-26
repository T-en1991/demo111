<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { HomeFilled, SwitchButton, Connection, Link, Select, Loading, Warning } from '@element-plus/icons-vue'
import { useAppStore } from '../store/app'
import { useFishControlStore } from '../store/fishControl'
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'

const router = useRouter()
const route = useRoute()
const app = useAppStore()
const fishControlStore = useFishControlStore()
const { t, locale } = useI18n()

// 计算所有鱼的连接状态列表
const allFishStatus = computed(() => {
  // 强制依赖收集：访问 connectionStates 的 size 或其他属性以确保响应式
  // 这行代码虽然看起来没用，但能确保当 Map 内部变化时 computed 重新计算
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _dep = fishControlStore.connectionStates.size

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: Array<{ id: number; name: string; status: string; statusText: string; type: string; icon: any }> = []

  // 遍历 fishMap
  if (fishControlStore.fishMap instanceof Map) {
      for (const fish of fishControlStore.fishMap.values()) {
          const status = fishControlStore.connectionStates.get(fish.id) || 'disconnected'
          let statusText = t('common.disconnected')
          let type = 'info'
          let icon = Connection

          switch (status) {
            case 'connected':
              statusText = t('common.connected')
              type = 'success'
              icon = Link
              break
            case 'connecting':
              statusText = t('common.connecting')
              type = 'warning'
              icon = Connection // Loading handled by class
              break
            case 'error':
              statusText = t('common.error')
              type = 'danger'
              icon = Connection
              break
          }

          list.push({
              id: fish.id,
              name: fish.name,
              status,
              statusText,
              type,
              icon
          })
      }
  }
  return list
})

// 计算当前鱼的状态
const currentFishStatus = computed(() => {
  const activeId = fishControlStore.activeFishId
  if (!activeId) return null

  const found = allFishStatus.value.find(item => item.id === activeId)
  if (found) {
      return { text: found.statusText, name: found.name, status: found.status }
  }

  // Fallback to first if active not found (or null)
  // But strictly speaking we should respect activeId.
  // If activeId is not in list, maybe show nothing or first?
  // Let's stick to activeId. If not found, try currentFish object from store.
  if (fishControlStore.currentFish) {
      // If not in allFishStatus list for some reason, construct it
      return {
          text: t('common.disconnected'),
          name: fishControlStore.currentFish.name,
          status: 'disconnected'
      }
  }

  return null
})

// 计算是否有活跃连接
const hasActiveConnection = computed(() => {
    if (fishControlStore.connectionStates instanceof Map) {
        for (const status of fishControlStore.connectionStates.values()) {
            if (status === 'connected') return true
        }
    }
    return false
})

function getStatusClass(status: string): string {
    switch (status) {
        case 'connected': return 'status-connected'
        case 'connecting': return 'status-connecting'
        case 'error': return 'status-error'
        default: return 'status-disconnected'
    }
}

async function toggleConnection(id: number, currentStatus: string, event: Event): Promise<void> {
    // 阻止冒泡，避免触发切换鱼
    event.stopPropagation()
    if (currentStatus === 'connected' || currentStatus === 'connecting') {
        await fishControlStore.disconnect(id)
    } else {
        await fishControlStore.connect(id)
    }
}

function switchFish(id: number): void {
    const fish = fishControlStore.fishMap.get(id)
    if (fish) {
        fishControlStore.setCurrentFish(fish)
    }
}

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
      void fishControlStore.disconnect() // 断开连接
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
      <!-- 声通连接状态管理面板 -->
      <el-popover
        placement="bottom"
        :width="300"
        trigger="hover"
        popper-class="connection-popover"
      >
        <template #reference>
            <div class="connection-trigger">
                <!-- 恢复显示当前选中的鱼名称 + 状态 -->
                <el-button round plain class="current-fish-btn">
                    <el-icon><Connection /></el-icon>
                    <div v-if="currentFishStatus" style="display: flex; align-items: center; margin-left: 8px;">
                        <span style="font-size: 12px; font-weight: 600; max-width: 120px; overflow: hidden; text-overflow: ellipsis; margin-right: 8px;">
                            {{ currentFishStatus.name }}
                        </span>
                        <span style="font-size: 12px; opacity: 0.9;" :class="getStatusClass(currentFishStatus.status)">
                            {{ currentFishStatus.text }}
                        </span>
                    </div>
                    <span v-else style="margin-left: 6px">No Fish</span>
                </el-button>

                <!-- 状态小红点 (保留) -->
                <span :class="['status-dot', hasActiveConnection ? 'success' : '']"></span>
            </div>
        </template>

        <!-- 下拉列表内容 -->
        <div class="connection-list">
            <div class="list-header">
                <span>{{ t('store.fishControl.connectionManager') || '连接管理' }}</span>
            </div>
            <div
                v-for="item in allFishStatus"
                :key="item.id"
                class="list-item cursor-pointer"
                :class="{ active: fishControlStore.activeFishId === item.id }"
                @click="switchFish(item.id)"
            >
                <div class="fish-row">
                    <!-- 名称 + 状态图标 -->
                    <span class="fish-name">{{ item.name }}</span>

                    <!-- 状态指示：连接中/已连接/错误/未连接 -->
                    <el-tooltip :content="item.statusText" placement="top" :show-after="500">
                        <div class="status-indicator">
                            <el-icon v-if="item.status === 'connected'" class="icon-connected"><Select /></el-icon>
                            <el-icon v-else-if="item.status === 'connecting'" class="icon-connecting is-loading"><Loading /></el-icon>
                            <el-icon v-else-if="item.status === 'error'" class="icon-error"><Warning /></el-icon>
                            <span v-else class="dot-disconnected"></span>
                        </div>
                    </el-tooltip>
                </div>

                <div class="actions">
                    <!-- 仅未连接时显示连接按钮 -->
                    <el-button
                        v-if="item.status !== 'connected' && item.status !== 'connecting'"
                        size="small"
                        text
                        bg
                        type="primary"
                        class="btn-connect"
                        @click="(e) => toggleConnection(item.id, item.status, e)"
                    >
                        {{ t('common.connect') || '连接' }}
                    </el-button>
                    <!-- Connected state: show text -->
                    <span v-else class="text-connected">{{ t('common.connected') || '已连接' }}</span>
                </div>
            </div>
            <div v-if="allFishStatus.length === 0" class="empty-tip">
                No Fish Configured
            </div>
        </div>
      </el-popover>

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
.connection-trigger {
    position: relative;
    display: inline-flex;

    .status-dot {
        position: absolute;
        top: 0;
        right: 0;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #909399; /* Disconnected gray */
        border: 2px solid #1d222e; /* Match background to create gap */

        &.success {
            background-color: #67c23a;
        }
    }
 }
 .text-connected {
    color: var(--el-color-success);
    font-size: 12px;
    margin-right: 6px;
    font-weight: 500;
 }
 .current-fish-btn {
    padding: 0 16px 0 12px;
    height: 42px;
    border-radius: 21px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.05);
    transition: all 0.3s ease;

    &:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.3);
    }

    .btn-content {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .btn-icon {
         font-size: 18px;
         color: #a0cfff; /* Blue color for icon */
     }

     .btn-text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        line-height: 1.2;
    }

    .fish-name {
        font-size: 13px;
        font-weight: 600;
        color: #fff;
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .fish-status {
        font-size: 11px;
        opacity: 0.9;

        &.status-connected { color: #67c23a; }
        &.status-connecting { color: #e6a23c; }
        &.status-error { color: #f56c6c; }
        &.status-disconnected { color: #909399; }
    }

    .no-fish {
        font-size: 13px;
        color: #909399;
    }
 }
 .status-connected { color: var(--el-color-success); }
 .status-connecting { color: var(--el-color-warning); }
 .status-error { color: var(--el-color-danger); }
 .status-disconnected { color: #909399; }
 </style>

<style lang="scss">
.connection-popover {
    padding: 0 !important;
    border-radius: 8px !important;
    overflow: hidden;
    background: #1d222e !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;

    .connection-list {
        max-height: 300px;
        overflow-y: auto;

        .list-header {
            padding: 10px 16px;
            font-size: 12px;
            font-weight: 600;
            color: #8b9bb4;
            background: rgba(0, 0, 0, 0.2);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .list-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                transition: all 0.2s;
                border-left: 3px solid transparent; /* Always reserve border space */

                &:hover {
                    background: rgba(255, 255, 255, 0.05);
                }

                &.active {
                    background: rgba(64, 158, 255, 0.15) !important;
                    border-left-color: #409eff !important;
                    /* padding-left: 13px; Removed because we use border-left transparent now */
                }

                &:last-child {
                    border-bottom: none;
                }

            .fish-row {
                display: flex;
                align-items: center;
                gap: 8px;

                .fish-name {
                    font-size: 14px;
                    font-weight: 500;
                    color: #e1e5eb;
                }

                .status-indicator {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 20px;
                    height: 20px;

                    .icon-connected {
                        color: var(--el-color-success);
                        font-size: 16px;
                    }
                    .icon-connecting {
                        color: var(--el-color-warning);
                        font-size: 16px;
                    }
                    .icon-error {
                        color: var(--el-color-danger);
                        font-size: 16px;
                    }
                    .dot-disconnected {
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background-color: rgba(255, 255, 255, 0.2);
                    }
                }
            }

            .btn-connect {
                font-size: 12px;
                padding: 4px 12px;
                height: 24px;
            }
        }

        .empty-tip {
            padding: 20px;
            text-align: center;
            color: #6b7280;
            font-size: 13px;
        }
    }
}
.cursor-pointer {
    cursor: pointer;
    transition: opacity 0.2s;
    &:hover {
        opacity: 0.8;
    }
}
</style>
