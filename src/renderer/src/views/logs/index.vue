<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'

interface LogItem {
  id: number
  time: string
  content: string
  type: string
}

const now = new Date()
const defaultStart = new Date(now)
defaultStart.setDate(now.getDate() - 1)
defaultStart.setHours(0, 0, 0, 0)
type DateRange = [Date, Date] | []

const query = reactive({
  range: [defaultStart, now] as DateRange,
  type: ''
})

const logs = ref<LogItem[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)
const loading = ref(false)

function fmt(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const Y = date.getFullYear()
  const M = String(date.getMonth() + 1).padStart(2, '0')
  const D = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${Y}-${M}-${D} ${hh}:${mm}:${ss}`
}

async function fetchLogs() {
  loading.value = true
  try {
    const startTime =
      query.range && query.range.length === 2 ? query.range[0].toISOString() : undefined
    const endTime =
      query.range && query.range.length === 2 ? query.range[1].toISOString() : undefined

    const res = await window.api.systemLog.list({
      page: currentPage.value,
      pageSize: pageSize.value,
      startTime,
      endTime,
      type: query.type || undefined
    })
    logs.value = res.items
    total.value = res.total
  } catch (err) {
    console.error('Failed to fetch logs:', err)
  } finally {
    loading.value = false
  }
}

function resetQuery() {
  query.range = []
  query.type = ''
  currentPage.value = 1
  fetchLogs()
}

function applyQuery() {
  currentPage.value = 1
  fetchLogs()
}

function handlePageChange(page: number) {
  currentPage.value = page
  fetchLogs()
}

function handleSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1
  fetchLogs()
}

onMounted(() => {
  fetchLogs()
})
</script>

<template>
  <section class="logs-page">
    <header class="page-header">
      <h1>日志记录</h1>
      <p class="sub">查看系统发送和接收的日志信息</p>
    </header>

    <el-card class="toolbar" shadow="hover">
      <el-form inline>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="query.range"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :default-time="[new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 1, 1, 23, 59, 59)]"
          />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.type" placeholder="全部" clearable style="width: 120px">
            <el-option label="发送" value="send" />
            <el-option label="接收" value="receive" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="applyQuery">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table :data="logs" border stripe style="width: 100%" v-loading="loading">
        <el-table-column prop="time" label="时间" width="200">
          <template #default="{ row }">
            {{ fmt(row.time) }}
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.type === 'send' ? 'success' : 'warning'">
              {{ row.type === 'send' ? '发送' : '接收' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容" min-width="320" />
      </el-table>
      
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>
  </section>
</template>

<style lang="scss" scoped>
@import './index.scss';

.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
