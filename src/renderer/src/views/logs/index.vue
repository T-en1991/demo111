<script setup lang="ts">
import { ref, reactive, computed } from 'vue'

interface LogItem {
  id: number
  actionName: string
  actionContent: string
  time: string
}

function fmt(d: Date): string {
  const Y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${Y}-${M}-${D} ${hh}:${mm}:${ss}`
}

const now = new Date()
const defaultStart = new Date(now)
defaultStart.setDate(now.getDate() - 1)
defaultStart.setHours(0, 0, 0, 0)
type DateRange = [Date, Date] | []

const query = reactive({
  range: [defaultStart, now] as DateRange
})
const activeRange = ref<DateRange>([defaultStart, now] as DateRange)

const allLogs = ref<LogItem[]>([
  { id: 1, actionName: '系统启动', actionContent: '服务初始化完成', time: fmt(new Date(now.getTime() - 23 * 3600 * 1000)) },
  { id: 2, actionName: '用户登录', actionContent: '管理员登陆成功', time: fmt(new Date(now.getTime() - 20 * 3600 * 1000)) },
  { id: 3, actionName: '保存配置', actionContent: '更新网络参数', time: fmt(new Date(now.getTime() - 12 * 3600 * 1000)) },
  { id: 4, actionName: '设备连接', actionContent: '串口设备已连接', time: fmt(new Date(now.getTime() - 8 * 3600 * 1000)) },
  { id: 5, actionName: '同步数据', actionContent: '上报 128 条状态', time: fmt(new Date(now.getTime() - 4 * 3600 * 1000)) },
  { id: 6, actionName: '清理缓存', actionContent: '释放临时文件', time: fmt(new Date(now.getTime() - 2 * 3600 * 1000)) },
  { id: 7, actionName: '导出报表', actionContent: '生成日报 CSV', time: fmt(new Date(now.getTime() - 1 * 3600 * 1000)) },
  { id: 8, actionName: '重启服务', actionContent: '通信服务重启', time: fmt(new Date(now.getTime() - 10 * 60 * 1000)) },
])

function resetQuery(): void {
  query.range = []
  activeRange.value = []
}
function applyQuery(): void {
  activeRange.value = Array.isArray(query.range) && query.range.length === 2
    ? [query.range[0], query.range[1]]
    : []
}

const filtered = computed((): LogItem[] => {
  return allLogs.value.filter((l) => {
    const byRange = Array.isArray(activeRange.value) && activeRange.value.length === 2
      ? (() => {
          const t = new Date(l.time.replace(' ', 'T'))
          return t >= activeRange.value[0] && t <= activeRange.value[1]
        })()
      : true
    return byRange
  })
})
</script>

<template>
  <section class="logs-page">
    <header class="page-header">
      <h1>日志记录</h1>
      <p class="sub">带时间查询的操作日志</p>
    </header>

    <el-card class="toolbar" shadow="hover">
      <el-form inline label-width="88px">
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="query.range"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            unlink-panels
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="applyQuery">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table :data="filtered" border stripe style="width: 100%">
        <el-table-column prop="actionName" label="操作名称" width="180" />
        <el-table-column prop="actionContent" label="操作内容" min-width="320" />
        <el-table-column prop="time" label="操作时间" width="200" />
      </el-table>
    </el-card>
  </section>
</template>

<style lang="scss" scoped>
@import './index.scss';
</style>
