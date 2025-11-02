<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'

type FishStatus = 'running' | 'stopped'
interface Fish {
  id: number
  name: string
  type: string
  status: FishStatus
  createdAt: string
}

// 模拟数据
const allFish = ref<Fish[]>([
  { id: 1, name: '蓝鲨-01', type: 'A-型', status: 'running', createdAt: '2025-10-01' },
  { id: 2, name: '蓝鲨-02', type: 'B-型', status: 'stopped', createdAt: '2025-10-02' },
  { id: 3, name: '深海-03', type: 'A-型', status: 'running', createdAt: '2025-10-05' },
  { id: 4, name: '巡航-04', type: 'C-型', status: 'stopped', createdAt: '2025-10-06' },
  { id: 5, name: '侦察-05', type: 'B-型', status: 'running', createdAt: '2025-10-10' },
  { id: 6, name: '蓝鲨-06', type: 'A-型', status: 'running', createdAt: '2025-10-12' }
])

// 搜索条件
const query = reactive({
  name: '',
  type: '',
  status: '' as '' | FishStatus
})

function resetQuery(): void {
  query.name = ''
  query.type = ''
  query.status = ''
}

// 过滤后的数据
const filtered = computed((): Fish[] => {
  return allFish.value.filter((f) => {
    const byName = query.name ? f.name.includes(query.name.trim()) : true
    const byType = query.type ? f.type === query.type : true
    const byStatus = query.status ? f.status === query.status : true
    return byName && byType && byStatus
  })
})

// 分页
const page = ref(1)
const pageSize = ref(5)
const total = computed((): number => filtered.value.length)
const currentPageData = computed((): Fish[] => {
  const start = (page.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

function onSizeChange(size: number): void {
  pageSize.value = size
  page.value = 1
}

function onPageChange(p: number): void {
  page.value = p
}

// 新增 / 编辑
const dialogVisible = ref(false)
const isEdit = ref(false)
const form = reactive<Fish>({ id: 0, name: '', type: 'A-型', status: 'running', createdAt: '' })

function openCreate(): void {
  isEdit.value = false
  Object.assign(form, { id: 0, name: '', type: 'A-型', status: 'running', createdAt: '' })
  dialogVisible.value = true
}

function openEdit(row: Fish): void {
  isEdit.value = true
  Object.assign(form, row)
  dialogVisible.value = true
}

function save(): void {
  if (!form.name.trim()) {
    ElMessage.error('请填写名称')
    return
  }
  if (isEdit.value) {
    const idx = allFish.value.findIndex((f) => f.id === form.id)
    if (idx >= 0) allFish.value[idx] = { ...form }
    ElMessage.success('已更新机器鱼')
  } else {
    const maxId = Math.max(0, ...allFish.value.map((f) => f.id))
    const createdAt = new Date().toISOString().slice(0, 10)
    allFish.value.unshift({ ...form, id: maxId + 1, createdAt })
    ElMessage.success('已新增机器鱼')
  }
  dialogVisible.value = false
}

function remove(row: Fish): void {
  ElMessageBox.confirm(`确认删除 ${row.name} 吗？`, '提示', { type: 'warning' })
    .then(() => {
      allFish.value = allFish.value.filter((f) => f.id !== row.id)
      ElMessage.success('已删除')
    })
    .catch(() => {})
}

function closeDialog(): void {
  dialogVisible.value = false
}
</script>

<template>
  <section class="fish-page">
    <header class="page-header">
      <h1>机器鱼管理</h1>
      <p class="sub">支持增删改查、搜索与分页</p>
    </header>

    <el-card class="toolbar" shadow="hover">
      <el-form inline label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="query.name" placeholder="支持模糊查询" clearable />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.type" placeholder="全部" clearable style="width: 140px">
            <el-option label="A-型" value="A-型" />
            <el-option label="B-型" value="B-型" />
            <el-option label="C-型" value="C-型" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="全部" clearable style="width: 140px">
            <el-option label="运行中" value="running" />
            <el-option label="已停止" value="stopped" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary">搜索</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
        <div class="spacer" />
        <el-form-item>
          <el-button type="success" @click="openCreate">新增机器鱼</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table :data="currentPageData" border stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column prop="type" label="类型" width="120" />
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.status === 'running' ? 'success' : 'info'">
              {{ row.status === 'running' ? '运行中' : '已停止' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建日期" width="140" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" plain @click="remove(row)">删除</el-button>
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
          :page-sizes="[5, 10, 20]"
          @size-change="onSizeChange"
          @current-change="onPageChange"
        />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑机器鱼' : '新增机器鱼'" width="520px">
      <el-form label-width="88px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="请输入名称" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width: 200px">
            <el-option label="A-型" value="A-型" />
            <el-option label="B-型" value="B-型" />
            <el-option label="C-型" value="C-型" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio-button label="running">运行中</el-radio-button>
            <el-radio-button label="stopped">已停止</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>