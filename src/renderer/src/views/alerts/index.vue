<script setup lang="ts">
import { ref, reactive, computed } from 'vue'

type Severity = 'low' | 'medium' | 'high'
interface AlertItem {
  id: number
  title: string
  severity: Severity
  time: string
  status: 'open' | 'closed'
}

const allAlerts = ref<AlertItem[]>([
  { id: 1, title: '电池电量低', severity: 'medium', time: '2025-10-02 10:12', status: 'open' },
  { id: 2, title: '姿态异常', severity: 'high', time: '2025-10-03 08:40', status: 'open' },
  { id: 3, title: '传感器校准', severity: 'low', time: '2025-10-03 13:05', status: 'closed' },
  { id: 4, title: '通信中断短时', severity: 'medium', time: '2025-10-04 09:33', status: 'closed' },
  { id: 5, title: '温度过高', severity: 'high', time: '2025-10-05 15:21', status: 'open' },
  { id: 6, title: '压力异常', severity: 'high', time: '2025-10-06 11:09', status: 'open' }
])

const query = reactive({
  keyword: '',
  severity: '' as '' | Severity,
  status: '' as '' | 'open' | 'closed',
  range: [] as [Date, Date] | []
})

function resetQuery(): void {
  query.keyword = ''
  query.severity = ''
  query.status = ''
  query.range = []
}

const filtered = computed((): AlertItem[] => {
  return allAlerts.value.filter((a) => {
    const byKw = query.keyword ? a.title.includes(query.keyword.trim()) : true
    const bySev = query.severity ? a.severity === query.severity : true
    const bySt = query.status ? a.status === query.status : true
    const byRange = Array.isArray(query.range) && query.range.length === 2
      ? (() => {
          const t = new Date(a.time.replace(' ', 'T'))
          return t >= query.range[0] && t <= query.range[1]
        })()
      : true
    return byKw && bySev && bySt && byRange
  })
})

const page = ref(1)
const pageSize = ref(10)
const total = computed((): number => filtered.value.length)
const currentPageData = computed((): AlertItem[] => {
  const start = (page.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

function onSizeChange(size: number): void { pageSize.value = size; page.value = 1 }
function onPageChange(p: number): void { page.value = p }
</script>

<template>
  <section class="alerts-page">
    <header class="page-header">
      <h1>报警查询</h1>
      <p class="sub">支持条件过滤与分页</p>
    </header>

    <el-card class="toolbar" shadow="hover">
      <el-form inline label-width="88px">
        <el-form-item label="关键字">
          <el-input v-model="query.keyword" placeholder="输入报警标题关键词" clearable />
        </el-form-item>
        <el-form-item label="级别">
          <el-select v-model="query.severity" placeholder="全部" clearable style="width: 120px">
            <el-option label="低" value="low" />
            <el-option label="中" value="medium" />
            <el-option label="高" value="high" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="全部" clearable style="width: 120px">
            <el-option label="未关闭" value="open" />
            <el-option label="已关闭" value="closed" />
          </el-select>
        </el-form-item>
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
          <el-button type="primary">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table :data="currentPageData" border stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="title" label="报警标题" min-width="200" />
        <el-table-column label="级别" width="120">
          <template #default="{ row }">
            <el-tag :type="row.severity === 'high' ? 'danger' : row.severity === 'medium' ? 'warning' : 'info'">
              {{ row.severity === 'high' ? '高' : row.severity === 'medium' ? '中' : '低' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="time" label="时间" width="160" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.status === 'open' ? 'success' : 'info'">
              {{ row.status === 'open' ? '未关闭' : '已关闭' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          :page-sizes="[10, 20, 50]"
          @size-change="onSizeChange"
          @current-change="onPageChange"
        />
      </div>
    </el-card>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>