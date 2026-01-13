<script setup lang="ts">
import { useRouter } from 'vue-router'
import {
  Monitor,
  Cpu,
  UploadFilled,
  List,
  WarningFilled,
  Document
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { t } = useI18n()

function go(name: string): void {
  router.push({ name })
}
</script>

<template>
  <section class="home">
    <header class="hero">
      <div class="brand-dot" />
      <h1>{{ t('home.title') }}</h1>
      <p class="sub">{{ t('home.sub') }}</p>
    </header>

    <el-row :gutter="18" class="menu">
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item screen" @click="go('screen')">
          <el-icon class="bg-icon"><Monitor /></el-icon>
          <h3>{{ t('home.screen') }}</h3>
          <p>{{ t('home.screenDesc') }}</p>
          <el-button type="primary" plain>{{ t('home.enter') }}</el-button>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item fish" @click="go('fish')">
          <el-icon class="bg-icon"><Cpu /></el-icon>
          <h3>{{ t('home.fishManage') }}</h3>
          <p>{{ t('home.fishManageDesc') }}</p>
          <el-button type="success" plain>{{ t('home.enter') }}</el-button>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item upload" @click="go('upload')">
          <el-icon class="bg-icon"><UploadFilled /></el-icon>
          <h3>{{ t('home.upload') }}</h3>
          <p>{{ t('home.uploadDesc') }}</p>
          <el-button type="primary" plain>{{ t('home.enter') }}</el-button>
        </div>
      </el-col>
    </el-row>
    <el-row :gutter="18" class="menu" style="margin-top: 12px">
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item history" @click="go('history')">
          <el-icon class="bg-icon"><List /></el-icon>
          <h3>{{ t('home.history') }}</h3>
          <p>{{ t('home.historyDesc') }}</p>
          <el-button type="warning" plain>{{ t('home.enter') }}</el-button>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item alerts" @click="go('alerts')">
          <el-icon class="bg-icon"><WarningFilled /></el-icon>
          <h3>{{ t('home.alerts') }}</h3>
          <p>{{ t('home.alertsDesc') }}</p>
          <el-button type="danger" plain>{{ t('home.enter') }}</el-button>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item logs" @click="go('logs')">
          <el-icon class="bg-icon"><Document /></el-icon>
          <h3>{{ t('home.logs') }}</h3>
          <p>{{ t('home.logsDesc') }}</p>
          <el-button type="info" plain>{{ t('home.enter') }}</el-button>
        </div>
      </el-col>
      <!-- <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item demo" @click="go('joystick-test')">
          <el-icon class="bg-icon"><Star /></el-icon>
          <h3>Joystick Test</h3>
          <p>Test USB Gamepad inputs</p>
          <el-button type="default" plain>{{ t('home.enter') }}</el-button>
        </div>
      </el-col> -->
    </el-row>

    <!-- 视频弹窗和按钮 -->
    <!-- <VideoDialog ref="videoDialog" url="ws://localhost:8085/" />
    <el-button
      type="primary"
      style="position: fixed; bottom: 32px; right: 32px; z-index: 1000"
      @click="openVideoDialog"
    >
      {{ t('home.video') }}
    </el-button> -->
  </section>
</template>

<style scoped src="./index.scss"></style>
