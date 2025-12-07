<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import UsbComConsole from '../home/UsbComConsole.vue'

interface Fish {
  id: number
  name: string
  ip?: string
  port?: number
  rtspUrl?: string
  rtsp2?: string
  createdAt: string
  updatedAt: string
  ascendCommand?: string
  descendCommand?: string
  forwardCommand?: string
  leftCommand?: string
  rightCommand?: string
  manualCommand?: string
  exitManualCommand?: string
  returnCommand?: string
  description?: string
  track?: TrackPoint[]
  // 额外通信参数（解析自 description 的结构化内容）
  satcomIp?: string
  satcomPort1?: number
  satcomPort2?: number
}

// 渲染层用于断言后端返回的 Fish 形状（包含新增命令字段与 track）
type FishFromBackend = {
  id: number
  name: string
  ip: string | null
  port: number | null
  rtspUrl?: string | null
  rtsp2?: string | null
  createdAt: string | Date
  updatedAt: string | Date
  type?: string
  status?: 'running' | 'stopped'
  ascendCommand?: string | null
  descendCommand?: string | null
  forwardCommand?: string | null
  leftCommand?: string | null
  rightCommand?: string | null
  manualCommand?: string | null
  exitManualCommand?: string | null
  returnCommand?: string | null
  description?: string | null
  // 新增：声通与微波通信参数（后端直接返回）
  satcomIp?: string | null
  satcomPort1?: number | null
  satcomPort2?: number | null
  track?: unknown
}

// 轨迹点类型（仅前端使用，不持久化）
interface TrackPoint {
  lon: number
  lat: number
  alt: number | null
  depth: number | null
}

// 前端表单专用类型（仅在 UI 层使用，不持久化到后端）
interface FishForm {
  id: number
  name: string
  ip?: string
  port?: number
  rtspUrl: string
  rtsp2: string
  // 额外通信参数：声通与微波
  satcomIp: string
  satcomPort1: number
  satcomPort2: number
  cmdUp: string
  cmdDown: string
  cmdForward: string
  cmdLeft: string
  cmdRight: string
  cmdManual: string
  cmdExitManual: string
  cmdReturn: string
  description: string
  track: TrackPoint[]
}

// 响应式数据
const allFish = ref<Fish[]>([])
const loading = ref(false)

// 取消查询与分页：不再需要 query 与重置逻辑

// 保留 6 位小数的四舍五入（用于轨迹经纬度）
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

// 类型守卫：判断 value 是否为普通对象
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

// 解析 description 文本中的结构化通信参数（若为纯文本则作为 text 返回）
function parseExtraDesc(input: string | null | undefined): {
  text?: string
  satcomIp?: string
  satcomPort1?: number
  satcomPort2?: number
} {
  if (!input) return {}
  try {
    const parsed: unknown = JSON.parse(input)
    if (!isRecord(parsed)) {
      return { text: input }
    }
    const text = typeof parsed.text === 'string' ? parsed.text : undefined
    const satRaw = isRecord((parsed as Record<string, unknown>).satcom)
      ? (parsed as Record<string, unknown>).satcom
      : {}
    const sat = satRaw as { ip?: unknown; port1?: unknown; port2?: unknown }
    const satcomIp = typeof sat.ip === 'string' ? sat.ip : undefined
    const satcomPort1 = sat.port1 != null ? Number(sat.port1) : undefined
    const satcomPort2 = sat.port2 != null ? Number(sat.port2) : undefined
    return { text, satcomIp, satcomPort1, satcomPort2 }
  } catch {
    return { text: input }
  }
}

// 加载机器鱼数据
async function loadFish(): Promise<void> {
  loading.value = true
  try {
    // 简化为始终获取全部数据
    const raw = (await window.api.fish.findAll()) as FishFromBackend[]
    const toTrackPoints = (json: unknown): TrackPoint[] => {
      if (!Array.isArray(json)) return []
      return (json as unknown[]).map((tp) => {
        const o = tp as Record<string, unknown>
        const lon = typeof o.lon === 'number' ? o.lon : Number(o.lon)
        const lat = typeof o.lat === 'number' ? o.lat : Number(o.lat)
        const altRaw = o.alt
        const depthRaw = o.depth
        const altNum = altRaw === null || altRaw === undefined ? null : Number(altRaw)
        const depthNum = depthRaw === null || depthRaw === undefined ? null : Number(depthRaw)
        return {
          lon: Number.isFinite(lon) ? lon : 0,
          lat: Number.isFinite(lat) ? lat : 0,
          alt: altNum !== null && !Number.isFinite(altNum as number) ? null : altNum,
          depth: depthNum !== null && !Number.isFinite(depthNum as number) ? null : depthNum
        }
      })
    }

    const normalized: Fish[] = raw.map((f) => {
      const extra = parseExtraDesc(f.description ?? undefined)
      return {
        id: f.id,
        name: f.name,
        ip: f.ip ?? undefined,
        port: f.port ?? undefined,
        rtspUrl: f.rtspUrl ?? undefined,
        rtsp2: f.rtsp2 ?? undefined,
        createdAt:
          typeof f.createdAt === 'string' ? f.createdAt : new Date(f.createdAt).toISOString(),
        updatedAt:
          typeof f.updatedAt === 'string' ? f.updatedAt : new Date(f.updatedAt).toISOString(),
        ascendCommand: f.ascendCommand ?? undefined,
        descendCommand: f.descendCommand ?? undefined,
        forwardCommand: f.forwardCommand ?? undefined,
        leftCommand: f.leftCommand ?? undefined,
        rightCommand: f.rightCommand ?? undefined,
        manualCommand: f.manualCommand ?? undefined,
        exitManualCommand: f.exitManualCommand ?? undefined,
        returnCommand: f.returnCommand ?? undefined,
        description: typeof extra.text === 'string' ? extra.text : (f.description ?? undefined),
        track: toTrackPoints(f.track as unknown),
        // 额外通信参数：优先使用后端字段，其次兼容旧的 description JSON
        satcomIp: f.satcomIp ?? extra.satcomIp,
        satcomPort1: f.satcomPort1 ?? extra.satcomPort1,
        satcomPort2: f.satcomPort2 ?? extra.satcomPort2
      }
    })
    allFish.value = normalized
  } catch (error) {
    console.error('加载机器鱼失败:', error)
    ElMessage.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

// 取消过滤与分页：列表直接展示全部数据

// 概览统计卡片已移除；关联的统计计算属性一并删除以通过类型检查

// 类型与状态已不在 UI 中使用

// 新增 / 编辑
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const form = reactive<FishForm>({
  id: 0,
  name: '',
  ip: '',
  port: 9200,
  rtspUrl: '',
  rtsp2: '',
  satcomIp: '',
  satcomPort1: 0,
  satcomPort2: 0,
  cmdUp: '',
  cmdDown: '',
  cmdForward: '',
  cmdLeft: '',
  cmdRight: '',
  cmdManual: '',
  cmdExitManual: '',
  cmdReturn: '',
  description: '',
  track: []
})

function openCreate(): void {
  isEdit.value = false
  Object.assign(form, {
    id: 0,
    name: '',
    ip: '',
    port: 9200,
    rtspUrl: '',
    rtsp2: '',
    satcomIp: '',
    satcomPort1: 0,
    satcomPort2: 0,
    cmdUp: '',
    cmdDown: '',
    cmdForward: '',
    cmdLeft: '',
    cmdRight: '',
    cmdManual: '',
    cmdExitManual: '',
    cmdReturn: '',
    description: '',
    track: []
  })
  dialogVisible.value = true
}

function openEdit(row: Fish): void {
  isEdit.value = true
  Object.assign(form, {
    id: row.id,
    name: row.name,
    ip: row.ip ?? '',
    port: row.port ?? 9200,
    rtspUrl: row.rtspUrl ?? '',
    rtsp2: row.rtsp2 ?? '',
    satcomIp: row.satcomIp ?? '',
    satcomPort1: row.satcomPort1 ?? 0,
    satcomPort2: row.satcomPort2 ?? 0,
    // 从后端读取的命令与描述
    cmdUp: row.ascendCommand ?? '',
    cmdDown: row.descendCommand ?? '',
    cmdForward: row.forwardCommand ?? '',
    cmdLeft: row.leftCommand ?? '',
    cmdRight: row.rightCommand ?? '',
    cmdManual: row.manualCommand ?? '',
    cmdExitManual: row.exitManualCommand ?? '',
    cmdReturn: row.returnCommand ?? '',
    description: row.description ?? '',
    track: (row.track ?? []).map((p) => ({ ...p }))
  })
  dialogVisible.value = true
}

function addTrackPoint(): void {
  form.track.push({ lon: 0, lat: 0, alt: null, depth: null })
}

function removeTrackPoint(index: number): void {
  if (index >= 0 && index < form.track.length) {
    form.track.splice(index, 1)
  }
}

// 轨迹校验：高度与深度必须二选一（有且只有一个）
const trackErrors = ref<number[]>([])
function recomputeTrackErrors(): void {
  const errs: number[] = []
  form.track.forEach((p, idx) => {
    const hasAlt = p.alt !== null && p.alt !== undefined
    const hasDepth = p.depth !== null && p.depth !== undefined
    if (hasAlt === hasDepth) {
      errs.push(idx)
    }
  })
  trackErrors.value = errs
}
watch(
  () => form.track,
  () => recomputeTrackErrors(),
  { deep: true, immediate: true }
)
const trackErrorDesc = computed(() =>
  trackErrors.value.length ? `问题行：${trackErrors.value.map((i) => i + 1).join(', ')}` : ''
)

async function save(): Promise<void> {
  let rtspChanged = false
  if (!form.name.trim()) {
    ElMessage.error('请填写名称')
    return
  }
  if (form.name.trim().length > 20) {
    ElMessage.error('名称不能超过 20 个字')
    return
  }
  // 轨迹校验：若存在错误行则阻止保存
  recomputeTrackErrors()
  if (trackErrors.value.length) {
    ElMessage.error('轨迹校验失败：每行高度与深度必须二选一')
    return
  }

  saving.value = true
  try {
    if (isEdit.value) {
      // 检查rtspUrl/rtsp2是否变更
      const oldFish = allFish.value.find((f) => f.id === form.id)
      if (oldFish && (oldFish.rtspUrl !== form.rtspUrl || oldFish.rtsp2 !== form.rtsp2)) {
        rtspChanged = true
      }
      // 更新机器鱼
      await window.api.fish.update(form.id, {
        name: form.name.trim(),
        ip: form.ip && form.ip.trim() ? form.ip.trim() : undefined,
        port: form.port && form.port > 0 ? form.port : undefined,
        rtspUrl: form.rtspUrl || null,
        rtsp2: form.rtsp2 || null,
        // 新增字段直接写入后端
        satcomIp: form.satcomIp || null,
        satcomPort1: form.satcomPort1 || null,
        satcomPort2: form.satcomPort2 || null,
        ascendCommand: form.cmdUp || null,
        descendCommand: form.cmdDown || null,
        forwardCommand: form.cmdForward || null,
        leftCommand: form.cmdLeft || null,
        rightCommand: form.cmdRight || null,
        manualCommand: form.cmdManual || null,
        exitManualCommand: form.cmdExitManual || null,
        returnCommand: form.cmdReturn || null,
        // 描述仅保存纯文本
        description: form.description || null,
        track: form.track.length
          ? form.track.map((p) => ({
              lon: round6(p.lon),
              lat: round6(p.lat),
              alt: p.alt,
              depth: p.depth
            }))
          : []
      })
      ElMessage.success('已更新机器鱼')
    } else {
      // 创建机器鱼
      await window.api.fish.create({
        name: form.name.trim(),
        ip: form.ip && form.ip.trim() ? form.ip.trim() : undefined,
        port: form.port && form.port > 0 ? form.port : undefined,
        rtspUrl: form.rtspUrl || null,
        rtsp2: form.rtsp2 || null,
        // 新增字段直接写入后端
        satcomIp: form.satcomIp || null,
        satcomPort1: form.satcomPort1 || null,
        satcomPort2: form.satcomPort2 || null,
        ascendCommand: form.cmdUp || null,
        descendCommand: form.cmdDown || null,
        forwardCommand: form.cmdForward || null,
        leftCommand: form.cmdLeft || null,
        rightCommand: form.cmdRight || null,
        manualCommand: form.cmdManual || null,
        exitManualCommand: form.cmdExitManual || null,
        returnCommand: form.cmdReturn || null,
        // 描述仅保存纯文本
        description: form.description || null,
        track: form.track.length
          ? form.track.map((p) => ({
              lon: round6(p.lon),
              lat: round6(p.lat),
              alt: p.alt,
              depth: p.depth
            }))
          : []
      })
      ElMessage.success('已新增机器鱼')
    }

    dialogVisible.value = false
    await loadFish() // 重新加载数据
    if (rtspChanged) {
      ElMessageBox.alert('RTSP流地址已变更，需重启应用才能生效。', '提示', { type: 'warning' })
    }
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

    await window.api.fish.delete(row.id)
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

// 假数据逻辑已移除

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
      <p class="sub">这是一段介绍文字</p>
    </header>
    <el-card class="toolbar" shadow="hover">
      <el-form inline label-width="80px">
        <div class="spacer" />
        <el-form-item>
          <el-button type="success" @click="openCreate">新增机器鱼</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <UsbComConsole />

    <el-card v-loading="loading" class="table-card" shadow="never">
      <el-table :data="allFish" border stripe style="width: 100%" height="560">
        <el-table-column type="index" label="#" width="60" />
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="名称" min-width="160" />
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
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑机器鱼' : '新增机器鱼'"
      width="60%"
      class="fish-dialog"
    >
      <el-form label-width="120px">
        <!-- 第一行：名称 -->
        <el-row :gutter="12">
          <el-col :span="24">
            <el-form-item label="名称">
              <el-input v-model="form.name" placeholder="请输入名称" />
            </el-form-item>
          </el-col>
        </el-row>
        <!-- 第二行：声通IP、声通端口1、声通端口2 -->
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="声通 IP">
              <el-input v-model="form.satcomIp" placeholder="声通 IP" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="声通端口1">
              <el-input-number
                v-model="form.satcomPort1"
                :min="0"
                :max="65535"
                controls-position="right"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="声通端口2">
              <el-input-number
                v-model="form.satcomPort2"
                :min="0"
                :max="65535"
                controls-position="right"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="上浮命令">
          <el-input v-model="form.cmdUp" placeholder="上浮命令" />
        </el-form-item>
        <el-form-item label="下潜命令">
          <el-input v-model="form.cmdDown" placeholder="下潜命令" />
        </el-form-item>
        <el-form-item label="向前命令">
          <el-input v-model="form.cmdForward" placeholder="向前命令" />
        </el-form-item>
        <el-form-item label="向左命令">
          <el-input v-model="form.cmdLeft" placeholder="向左命令" />
        </el-form-item>
        <el-form-item label="向右命令">
          <el-input v-model="form.cmdRight" placeholder="向右命令" />
        </el-form-item>
        <el-form-item label="人工命令">
          <el-input v-model="form.cmdManual" placeholder="人工命令" />
        </el-form-item>
        <el-form-item label="退出人工命令">
          <el-input v-model="form.cmdExitManual" placeholder="退出人工命令" />
        </el-form-item>
        <el-form-item label="返航命令">
          <el-input v-model="form.cmdReturn" placeholder="返航命令" />
        </el-form-item>
        <el-form-item label="轨迹">
          <div style="width: 100%">
            <div style="margin-bottom: 8px">
              <el-button type="primary" plain @click="addTrackPoint">添加轨迹点</el-button>
            </div>
            <el-table :data="form.track" border stripe style="width: 100%" size="small">
              <el-table-column label="经度">
                <template #default="{ $index }">
                  <el-input-number
                    v-model="form.track[$index].lon"
                    :min="-180"
                    :max="180"
                    :step="0.000001"
                    :precision="6"
                    controls-position="right"
                  />
                </template>
              </el-table-column>
              <el-table-column label="纬度">
                <template #default="{ $index }">
                  <el-input-number
                    v-model="form.track[$index].lat"
                    :min="-90"
                    :max="90"
                    :step="0.000001"
                    :precision="6"
                    controls-position="right"
                  />
                </template>
              </el-table-column>
              <el-table-column label="高度">
                <template #default="{ $index }">
                  <el-input-number
                    v-model="form.track[$index].alt"
                    :min="0"
                    :step="0.1"
                    controls-position="right"
                  />
                </template>
              </el-table-column>
              <el-table-column label="深度">
                <template #default="{ $index }">
                  <el-input-number
                    v-model="form.track[$index].depth"
                    :min="0"
                    :step="0.1"
                    controls-position="right"
                  />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="120" fixed="right">
                <template #default="{ $index }">
                  <el-button size="small" type="danger" plain @click="removeTrackPoint($index)"
                    >删除</el-button
                  >
                </template>
              </el-table-column>
            </el-table>
            <div v-if="trackErrors.length" style="margin-top: 8px">
              <el-alert
                type="error"
                show-icon
                :closable="false"
                :title="'轨迹校验失败：高度与深度必须二选一'"
                :description="trackErrorDesc"
              />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="RTSP流地址1">
          <el-input v-model="form.rtspUrl" placeholder="rtsp://..." />
        </el-form-item>
        <el-form-item label="RTSP流地址2">
          <el-input v-model="form.rtsp2" placeholder="rtsp://... (第二路, 可选)" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" placeholder="描述" :rows="3" />
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
