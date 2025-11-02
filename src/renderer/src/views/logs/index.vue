<script setup lang="ts">
import { ref } from 'vue'

type LogLevel = '信息' | '警告' | '错误'
interface LogItem { id: string; time: string; level: LogLevel; message: string }

const logs = ref<LogItem[]>([
  { id: 'lg-1', time: new Date(Date.now() - 3600 * 1000).toISOString(), level: '信息', message: '系统启动完成' },
  { id: 'lg-2', time: new Date(Date.now() - 1800 * 1000).toISOString(), level: '警告', message: '探测器信号波动' },
  { id: 'lg-3', time: new Date(Date.now() - 300 * 1000).toISOString(), level: '错误', message: '通信中断 2s' },
])

function addLog(): void {
  const levels: LogLevel[] = ['信息', '警告', '错误']
  const level = levels[Math.floor(Math.random() * levels.length)]
  const id = 'lg-' + (logs.value.length + 1)
  const templates: Record<LogLevel, string[]> = {
    信息: ['状态心跳正常', '配置已保存', '数据同步完成'],
    警告: ['电量低于 30%', '温度偏高', '信号弱'],
    错误: ['传感器异常', '网络断开', '定位失败'],
  }
  const message = templates[level][Math.floor(Math.random() * templates[level].length)]
  logs.value.unshift({ id, time: new Date().toISOString(), level, message })
}

function fmt(t: string): string {
  const d = new Date(t)
  const Y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${Y}-${M}-${D} ${hh}:${mm}:${ss}`
}

function levelClass(level: LogLevel): string {
  return level === '错误' ? 'lv-error' : level === '警告' ? 'lv-warn' : 'lv-info'
}
</script>

<template>
  <section class="logs-page">
    <header class="page-header">
      <h1>日志记录</h1>
      <p class="sub">系统运行事件与异常</p>
    </header>

    <el-card class="toolbar" shadow="hover">
      <el-button type="primary" @click="addLog">新增日志</el-button>
    </el-card>

    <el-card class="list-card" shadow="never">
      <div class="logs-list">
        <div class="log-item" v-for="l in (logs as LogItem[])" :key="l.id">
          <div class="log-time">{{ fmt(l.time) }}</div>
          <div class="level-tag" :class="levelClass(l.level)">{{ l.level }}</div>
          <div class="log-msg" :title="l.message">{{ l.message }}</div>
        </div>
      </div>
    </el-card>
  </section>
</template>

<style lang="scss" scoped>
@import './index.scss';
</style>