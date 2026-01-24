<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface VideoItem {
  id: number
  path: string
  name: string
  size: number | null
  camera: 'mono' | 'stereo' | 'unknown'
  recordedAt: Date | string | null
  createdAt: Date | string
}

const loading = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const keyword = ref('')
const selectedFishId = ref<number | undefined>(undefined)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fishList = ref<any[]>([])
const items = ref<VideoItem[]>([])
const playerVisible = ref(false)
const activeUrl = ref('')
const activeItem = ref<VideoItem | null>(null)

function toFileUrl(p: string): string {
  const norm = p.replace(/\\/g, '/').replace(/^([A-Za-z]):\//, '/$1:/')
  return 'file://' + norm
}

async function fetchList(): Promise<void> {
  loading.value = true
  try {
    const res = await window.api.video.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      fishId: selectedFishId.value
    })
    items.value = res.items
    total.value = res.total
  } finally {
    loading.value = false
  }
}

function onSizeChange(size: number): void {
  pageSize.value = size
  page.value = 1
  fetchList()
}
function onPageChange(p: number): void {
  page.value = p
  fetchList()
}

function play(row: VideoItem): void {
  activeItem.value = row
  activeUrl.value = toFileUrl(row.path)
  playerVisible.value = true
}

function closePlayer(): void {
  playerVisible.value = false
  activeUrl.value = ''
}

onMounted(async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fishList.value = (await window.api.fish.findAll()) as any[]
  } catch (e) {
    console.error('Failed to load fish list', e)
  }
  fetchList()
})
</script>

<template>
  <div class="video-history">
    <div class="toolbar" style="margin-bottom: 10px; display: flex; gap: 8px">
      <el-select
        v-model="selectedFishId"
        placeholder="选择机器鱼"
        clearable
        style="width: 180px"
        @change="fetchList"
      >
        <el-option
          v-for="fish in fishList"
          :key="fish.id"
          :label="fish.name"
          :value="fish.id"
        />
      </el-select>
      <el-input v-model="keyword" placeholder="按名称搜索" clearable style="max-width: 260px" />
      <el-button
        type="primary"
        @click="
          () => {
            page = 1 as any
            fetchList()
          }
        "
        >查询</el-button
      >
      <el-button
        @click="
          () => {
            keyword = '' as any
            selectedFishId = undefined
            page = 1 as any
            fetchList()
          }
        "
        >重置</el-button
      >
    </div>
    <el-table v-loading="loading" :data="items" border stripe style="width: 100%" height="560">
      <el-table-column prop="id" label="ID" width="90" />
      <el-table-column prop="name" label="名称" min-width="220" />
      <el-table-column prop="camera" label="摄像头" width="120" />
      <el-table-column label="大小" width="120">
        <template #default="{ row }">
          {{ row.size != null ? (row.size / 1024 / 1024).toFixed(2) + ' MB' : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="recordedAt" label="拍摄时间" width="180" />
      <el-table-column prop="createdAt" label="导入时间" width="180" />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" plain @click="play(row)">播放</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination" style="display: flex; justify-content: flex-end; padding-top: 12px">
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

    <el-dialog v-model="playerVisible" width="70vw">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>{{ activeItem?.name }}</span>
          <span style="color: var(--ev-c-text-2)">{{ activeItem?.path }}</span>
        </div>
      </template>
      <video
        :src="activeUrl"
        controls
        autoplay
        style="width: 100%; max-height: 62vh; background: #000"
      />
      <template #footer>
        <el-button @click="closePlayer">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.video-history {
}
</style>
