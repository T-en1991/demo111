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
const router = useRouter()

function go(name: string): void {
  router.push({ name })
}
</script>

<template>
  <section class="home">
    <header class="hero">
      <div class="brand-dot" />
      <h1>OceanFish 控制台</h1>
      <p class="sub">请选择页面以继续操作</p>
    </header>

    <el-row :gutter="18" class="menu">
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item screen" @click="go('screen')">
          <el-icon class="bg-icon"><Monitor /></el-icon>
          <h3>实时监控</h3>
          <p>展示数据可视化与监控总览</p>
          <el-button type="primary" plain>进入</el-button>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item fish" @click="go('fish')">
          <el-icon class="bg-icon"><Cpu /></el-icon>
          <h3>机器鱼管理</h3>
          <p>支持增删改查</p>
          <el-button type="success" plain>进入</el-button>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item upload" @click="go('upload')">
          <el-icon class="bg-icon"><UploadFilled /></el-icon>
          <h3>上传数据</h3>
          <p>选择文件以导入到系统</p>
          <el-button type="primary" plain>进入</el-button>
        </div>
      </el-col>
    </el-row>
    <el-row :gutter="18" class="menu" style="margin-top: 12px">
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item history" @click="go('history')">
          <el-icon class="bg-icon"><List /></el-icon>
          <h3>历史记录</h3>
          <p>多条件过滤与列表分页</p>
          <el-button type="warning" plain>进入</el-button>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item alerts" @click="go('alerts')">
          <el-icon class="bg-icon"><WarningFilled /></el-icon>
          <h3>报警记录</h3>
          <p>系统告警与异常事件</p>
          <el-button type="danger" plain>进入</el-button>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item logs" @click="go('logs')">
          <el-icon class="bg-icon"><Document /></el-icon>
          <h3>日志记录</h3>
          <p>系统运行事件与异常</p>
          <el-button type="info" plain>进入</el-button>
        </div>
      </el-col>
    </el-row>


    <!-- 视频弹窗和按钮 -->
    <!-- <VideoDialog ref="videoDialog" url="ws://localhost:8085/" />
    <el-button
      type="primary"
      style="position: fixed; bottom: 32px; right: 32px; z-index: 1000"
      @click="openVideoDialog"
    >
      查看实时视频
    </el-button> -->
  </section>
</template>

<style scoped src="./index.scss"></style>
