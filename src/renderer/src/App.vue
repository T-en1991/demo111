<script setup lang="ts">
import TopBar from './components/TopBar.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

const { locale } = useI18n()
const elementLocale = computed(() => {
  return locale.value === 'zh-CN' ? zhCn : en
})
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <TopBar />
    <router-view />

    <!-- 固定版本信息放到底部，可选 -->
    <!-- <Versions /> -->
  </el-config-provider>
</template>

<style scoped></style>
