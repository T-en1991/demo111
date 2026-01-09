<script setup lang="ts">
import { useRouter } from 'vue-router'
import { onMounted, onUnmounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 修复 Leaflet 默认图标在 Vite/Webpack 构建下的路径问题
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl
})

const router = useRouter()
const mapContainer = ref<HTMLElement | null>(null)
let map: L.Map | null = null

function goBack(): void {
  router.back()
}

onMounted(() => {
  if (mapContainer.value) {
    // 初始化地图，设置中心点和缩放级别
    map = L.map(mapContainer.value).setView([31.2304, 121.4737], 13)

    // 添加 OpenStreetMap 图层
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map)

    // 添加一个示例标记
    L.marker([31.2304, 121.4737])
      .addTo(map)
      .bindPopup(t('demo.popup'))
      .openPopup()
  }
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div class="demo-page">
    <el-page-header @back="goBack">
      <template #content>
        <span class="text-large font-600 mr-3"> {{ t('demo.title') }} </span>
      </template>
    </el-page-header>

    <div class="content">
      <div ref="mapContainer" class="map-container"></div>
    </div>
  </div>
</template>

<style scoped>
.demo-page {
  padding: 20px;
  height: calc(100vh - 48px); /* 减去顶部导航栏高度 */
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.content {
  flex: 1;
  position: relative;
  margin-top: 20px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  background-color: #f5f5f5; /* 添加背景色以便调试 */
}

.map-container {
  width: 100%;
  height: 100%;
  z-index: 1;
}
</style>
