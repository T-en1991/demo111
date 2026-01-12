<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const gamepads = ref<Gamepad[]>([])
const connected = ref(false)
let rafId: number

function updateGamepads() {
  const gps = navigator.getGamepads()
  const activeGps: Gamepad[] = []
  for (const gp of gps) {
    if (gp) activeGps.push(gp)
  }
  gamepads.value = activeGps
  connected.value = activeGps.length > 0
  rafId = requestAnimationFrame(updateGamepads)
}

onMounted(() => {
  window.addEventListener('gamepadconnected', () => {
    console.log('Gamepad connected')
  })
  window.addEventListener('gamepaddisconnected', () => {
    console.log('Gamepad disconnected')
  })
  updateGamepads()
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
})

function back() {
  router.back()
}
</script>

<template>
  <div class="joystick-test">
    <div class="header">
      <h2>Joystick Test</h2>
      <button @click="back">Back</button>
    </div>

    <div v-if="!connected" class="no-pad">
      Please connect a USB Gamepad and press any button...
    </div>

    <div v-else class="pads-container">
      <div v-for="(gp, idx) in gamepads" :key="idx" class="pad-card">
        <h3>{{ gp.id }} (Index: {{ gp.index }})</h3>
        
        <div class="section">
          <h4>Axes (Joysticks)</h4>
          <div class="grid">
            <div v-for="(axis, aIdx) in gp.axes" :key="aIdx" class="item">
              <span class="label">Axis {{ aIdx }}</span>
              <div class="bar-bg">
                <div 
                  class="bar-fill" 
                  :style="{ 
                    width: '50%', 
                    left: '50%',
                    transform: `scaleX(${axis})`,
                    transformOrigin: axis > 0 ? 'left' : 'right',
                    backgroundColor: Math.abs(axis) > 0.1 ? '#409eff' : '#555'
                  }"
                ></div>
              </div>
              <span class="val">{{ axis.toFixed(3) }}</span>
            </div>
          </div>
        </div>

        <div class="section">
          <h4>Buttons</h4>
          <div class="buttons-grid">
            <div 
              v-for="(btn, bIdx) in gp.buttons" 
              :key="bIdx" 
              class="btn-item"
              :class="{ pressed: btn.pressed }"
            >
              B{{ bIdx }}
              <div class="btn-val">{{ btn.value.toFixed(2) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.joystick-test {
  padding: 20px;
  color: #fff;
  background: #1a1a1a;
  min-height: 100vh;
  font-family: monospace;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.pad-card {
  border: 1px solid #444;
  padding: 20px;
  margin-bottom: 20px;
  border-radius: 8px;
  background: #252525;
}
.section {
  margin-top: 15px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bar-bg {
  flex: 1;
  height: 10px;
  background: #333;
  position: relative;
  border-radius: 5px;
  overflow: hidden;
}
.bar-fill {
  position: absolute;
  height: 100%;
  background: #409eff;
}
.buttons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 8px;
}
.btn-item {
  border: 1px solid #444;
  border-radius: 4px;
  padding: 5px;
  text-align: center;
  background: #333;
  transition: all 0.1s;
}
.btn-item.pressed {
  background: #67c23a;
  color: #000;
  font-weight: bold;
  transform: scale(1.1);
}
.val {
  width: 50px;
  text-align: right;
}
</style>
