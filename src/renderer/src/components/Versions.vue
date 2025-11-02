<script setup lang="ts">
import { reactive } from 'vue'

// 兼容纯浏览器预览（open_preview）下无 preload 注入的情况
type VersionMap = Partial<Record<string, string>>
const safeVersions: VersionMap =
  (typeof window !== 'undefined' && window.electron?.process?.versions) || {}
const versions = reactive<VersionMap>({ ...safeVersions })
</script>

<template>
  <ul class="versions">
    <li class="electron-version">Electron v{{ versions.electron }}</li>
    <li class="chrome-version">Chromium v{{ versions.chrome }}</li>
    <li class="node-version">Node v{{ versions.node }}</li>
  </ul>
</template>
