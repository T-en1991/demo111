<template>
  <div class="jsmpeg-player-wrapper">
    <div
      ref="videoContainer"
      class="jsmpeg-player"
      style="width: 100%; height: 480px; background: #000"
    ></div>
    <div class="jsmpeg-controls">
      <el-button size="small" @click="togglePlay">{{ isPlaying ? '暂停' : '播放' }}</el-button>
      <div class="progress-volume-row">
        <label style="margin-right: 8px">进度</label>
        <input
          v-model="progress"
          type="range"
          min="0"
          :max="duration"
          step="0.01"
          style="width: 180px"
          @input="onSeek"
        />
        />
        <span style="margin-left: 8px"
          >{{ formatTime(progress) }} / {{ formatTime(duration) }}</span
        >
        <label style="margin: 0 8px 0 24px">音量</label>
        <input
          v-model.number="volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          style="width: 80px"
          @input="onVolume"
        />
        />
        <span style="margin-left: 8px">{{ Math.round(volume * 100) }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
// @ts-ignore: No types for @cycjimmy/jsmpeg-player, safe to ignore for runtime import
import JSMpeg from '@cycjimmy/jsmpeg-player'

const props = defineProps<{ url: string }>()
const videoContainer = ref<HTMLElement | null>(null)
let player: any = null
const isPlaying = ref(false)
const progress = ref(0)
const duration = ref(0)
const volume = ref(1)
let progressTimer: any = null

function togglePlay() {
  if (!player) return
  if (isPlaying.value) {
    player.pause()
    isPlaying.value = false
  } else {
    player.play()
    isPlaying.value = true
  }
}

function onSeek(e: Event) {
  if (!player || !player.player) return
  const val = Number((e.target as HTMLInputElement).value)
  player.player.currentTime = val
  progress.value = val
}

function onVolume(e: Event) {
  if (!player || !player.player) return
  const val = Number((e.target as HTMLInputElement).value)
  player.player.volume = val
  volume.value = val
}

function formatTime(sec: number) {
  if (!sec || isNaN(sec)) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function syncProgress() {
  if (!player || !player.player) return
  progress.value = player.player.currentTime
  duration.value = player.player.duration || 0
  isPlaying.value = player.player.isPlaying
}

onMounted(() => {
  if (videoContainer.value) {
    player = new JSMpeg.VideoElement(videoContainer.value, props.url, {
      autoplay: true,
      audio: true,
      loop: true,
      control: true
    })
    setTimeout(() => {
      if (player && player.player) {
        player.player.volume = volume.value
        syncProgress()
      }
    }, 500)
    progressTimer = setInterval(syncProgress, 500)
  }
})

onBeforeUnmount(() => {
  if (progressTimer) clearInterval(progressTimer)
  if (player && player.destroy) player.destroy()
})
</script>

<style scoped>
.jsmpeg-player-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.jsmpeg-player {
  width: 100%;
  height: 100%;
  background: #000;
}

.jsmpeg-controls {
  margin-top: 8px;
  text-align: center;
  width: 100%;
}

.progress-volume-row {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
}

input[type='range'] {
  vertical-align: middle;
}
</style>
