<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'

interface PortInfo { path: string; manufacturer?: string; serialNumber?: string }

const ports = ref<PortInfo[]>([])
const selected = ref<string>('COM4')
const baudRate = ref<number>(115200)
const connected = ref(false)
const sendText = ref('DONE')
const logs = ref<Array<{ t: string; text: string; parsed?: { kind: 'SURF'; time: string; csq: number } }>>([])
let off: (() => void) | null = null

function now(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function refresh(): Promise<void> {
  try {
    ports.value = await window.api.serial.list()
    if (!selected.value && ports.value.length) selected.value = ports.value[0].path
  } catch (e) {
    console.error('serial list failed', e)
    ElMessage.error('枚举串口失败')
  }
}

async function connect(): Promise<void> {
  if (!selected.value) { ElMessage.warning('请选择串口'); return }
  const ok = await window.api.serial.open(selected.value, { baudRate: baudRate.value })
  if (!ok) { ElMessage.error('连接失败'); return }
  connected.value = true
  off = window.api.serial.onData((p) => {
    logs.value.push({ t: now(), text: p.line, parsed: p.parsed ?? undefined })
  })
}

async function disconnect(): Promise<void> {
  await window.api.serial.close()
  connected.value = false
  if (off) { off(); off = null }
}

async function send(): Promise<void> {
  if (!connected.value) { ElMessage.warning('未连接串口'); return }
  const ok = await window.api.serial.write(sendText.value)
  if (!ok) { ElMessage.error('发送失败'); return }
}

onMounted(async () => {
  await refresh()
  if (selected.value) {
    const ok = await window.api.serial.open(selected.value, { baudRate: baudRate.value })
    if (ok) {
      connected.value = true
      off = window.api.serial.onData((p) => {
        console.log('[serial]', p.line)
        logs.value.push({ t: now(), text: p.line, parsed: p.parsed ?? undefined })
      })
    }
  }
})
onBeforeUnmount(() => { if (off) off() })
</script>

<template>
  <el-card class="usbcom" shadow="hover">
    <div class="controls">
      <el-select v-model="selected" placeholder="选择串口" style="min-width: 260px" :disabled="connected">
        <el-option v-for="p in ports" :key="p.path" :label="p.path" :value="p.path" />
      </el-select>
      <el-input-number v-model="baudRate" :min="1200" :max="921600" :step="4800" />
      <el-button type="primary" @click="refresh" :disabled="connected">刷新</el-button>
      <el-button type="success" @click="connect" :disabled="connected">连接</el-button>
      <el-button type="warning" @click="disconnect" :disabled="!connected">断开</el-button>
    </div>
    <div class="sendbar">
      <el-input v-model="sendText" placeholder="输入待发送的指令，如 DONE" style="max-width: 360px" />
      <el-button type="primary" @click="send" :disabled="!connected">发送</el-button>
    </div>
    <div class="parsed" v-if="logs.some(l => l.parsed)">
      <div v-for="l in logs.filter(x => x.parsed)" :key="l.t + l.text">
        <strong>解析</strong>：{{ l.parsed!.kind }} 时间={{ l.parsed!.time }} CSQ={{ l.parsed!.csq }}
      </div>
    </div>
    <div class="logs">
      <div v-for="l in logs" :key="l.t + l.text" class="logline"><span class="t">[{{ l.t }}]</span> {{ l.text }}</div>
    </div>
  </el-card>
</template>

<style scoped>
.usbcom { margin-top: 16px; }
.controls { display:flex; gap:8px; align-items:center; margin-bottom: 8px; }
.sendbar { display:flex; gap:8px; align-items:center; margin-bottom: 8px; }
.logs { max-height: 320px; overflow:auto; background: #111; color: #ddd; padding: 8px; border-radius: 6px; }
.logline { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 12px; line-height: 1.6; }
.logline .t { color: #888; margin-right: 6px; }
.parsed { padding: 8px; background: #1b1b1b; border-radius: 6px; margin-bottom: 8px; }
</style>
