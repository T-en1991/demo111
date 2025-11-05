<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'

type FishStatus = 'running' | 'stopped'
interface Fish {
  id: number
  name: string
  type: string
  ip?: string
  port?: number
  status: FishStatus
  createdAt: string
  updatedAt: string
}

// 响应式数据
const allFish = ref<Fish[]>([])
const loading = ref(false)

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
  loadFish()
}

// 加载机器鱼数据
async function loadFish(): Promise<void> {
  loading.value = true
  try {
    // 如果有搜索条件，使用搜索API，否则获取所有数据
    if (query.name || query.type || query.status) {
      const searchQuery: any = {}
      if (query.name) searchQuery.name = query.name.trim()
      if (query.type) searchQuery.type = query.type
      if (query.status) searchQuery.status = query.status
      allFish.value = await window.api.fish.search(searchQuery)
    } else {
      allFish.value = await window.api.fish.findAll()
    }
  } catch (error) {
    console.error('加载机器鱼失败:', error)
    ElMessage.error('加载数据失败')
  } finally {
    loading.value = false
  }
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
const saving = ref(false)
const form = reactive<Fish>({ id: 0, name: '', type: 'A-型', ip: '', port: 9200, status: 'running', createdAt: '', updatedAt: '' })

function openCreate(): void {
  isEdit.value = false
  Object.assign(form, { id: 0, name: '', type: 'A-型', status: 'running', createdAt: '', updatedAt: '' })
  dialogVisible.value = true
}

function openEdit(row: Fish): void {
  isEdit.value = true
  Object.assign(form, row)
  dialogVisible.value = true
}

async function save(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.error('请填写名称')
    return
  }

  saving.value = true
  try {
    if (isEdit.value) {
      // 更新机器鱼
      await (window as any).api.fish.update(form.id, {
          name: form.name,
          type: form.type,
          status: form.status,
          ip: form.ip && form.ip.trim() ? form.ip.trim() : undefined,
          port: form.port && form.port > 0 ? form.port : undefined
      })
      ElMessage.success('已更新机器鱼')
    } else {
      // 创建机器鱼
      await (window as any).api.fish.create({
          name: form.name,
          type: form.type,
          status: form.status,
          ip: form.ip && form.ip.trim() ? form.ip.trim() : undefined,
          port: form.port && form.port > 0 ? form.port : undefined
      })
      ElMessage.success('已新增机器鱼')
    }

    dialogVisible.value = false
    await loadFish() // 重新加载数据
  } catch (error) {
    console.error('保存失败:', error)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(row: Fish): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认删除 ${row.name} 吗？`, '提示', { type: 'warning' })

    await (window as any).api.fish.delete(row.id)
    ElMessage.success('已删除')
    await loadFish() // 重新加载数据
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

function closeDialog(): void {
  dialogVisible.value = false
}

// 组件挂载时加载数据
onMounted(() => {
  loadFish()
})

// 格式化日期为 yyyy-MM-dd HH:mm:ss
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function formatDate(input?: string | Date | null): string {
  if (!input) return ''
  const d = typeof input === 'string' ? new Date(input) : new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const MM = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const HH = pad(d.getHours())
  const mm = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`
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
          <el-button type="primary" @click="loadFish">搜索</el-button>
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
  <el-table-column prop="ip" label="IP" width="140" />
  <el-table-column prop="port" label="端口" width="100" />
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.status === 'running' ? 'success' : 'info'">
              {{ row.status === 'running' ? '运行中' : '已停止' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建日期" width="140">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" plain @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination background layout="total, sizes, prev, pager, next, jumper" :total="total" :page-size="pageSize"
          :current-page="page" :page-sizes="[5, 10, 20]" @size-change="onSizeChange" @current-change="onPageChange" />
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
        <el-form-item label="IP">
          <el-input v-model="form.ip" placeholder="绑定 IP (可选)" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="form.port" :min="0" :max="65535" />
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