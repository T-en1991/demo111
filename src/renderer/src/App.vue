<script setup lang="ts">
import TopBar from './components/TopBar.vue'
</script>

<template>
  <TopBar />
  <router-view />

  <!-- 固定版本信息放到底部，可选 -->
  <!-- <Versions /> -->
</template>

<style scoped></style>
