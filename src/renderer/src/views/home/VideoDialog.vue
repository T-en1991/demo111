<template>
    <el-dialog v-model="visible" title="实时视频" width="700px" @close="onClose">
        <VideoPlayerJSMpeg :url="url" />
        <template #footer>
            <el-button @click="visible = false">关闭</el-button>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, defineExpose } from 'vue'
import VideoPlayerJSMpeg from '../../components/VideoPlayerJSMpeg.vue'

const props = defineProps<{ url: string }>()
const visible = ref(false)

function open() {
    visible.value = true
}
function onClose() {
    visible.value = false
}
defineExpose({ open })
</script>
