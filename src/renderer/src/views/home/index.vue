<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()

function go(name: string): void {
  router.push({ name })
}
</script>

<template>
  <section class="home">
    <header class="hero">
      <div class="brand-dot" />
      <h1>OceanFish 控制台</h1>
      <p class="sub">请选择页面以继续操作</p>
    </header>

    <el-row :gutter="18" class="menu">
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item screen" @click="go('screen')">
          <h3>大屏页面</h3>
          <p>展示数据可视化与监控总览</p>
          <el-button type="primary" plain>进入</el-button>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item fish" @click="go('fish')">
          <h3>机器鱼管理</h3>
          <p>支持增删改查、搜索与分页</p>
          <el-button type="success" plain>进入</el-button>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item alerts" @click="go('alerts')">
          <h3>报警查询</h3>
          <p>多条件过滤与列表分页</p>
          <el-button type="warning" plain>进入</el-button>
        </div>
      </el-col>
    </el-row>
    <el-row :gutter="18" class="menu" style="margin-top: 12px">
      <el-col :xs="24" :sm="12" :md="8">
        <div class="menu-item logs" @click="go('logs')">
          <h3>日志记录</h3>
          <p>系统运行事件与异常</p>
          <el-button type="info" plain>进入</el-button>
        </div>
      </el-col>
    </el-row>
  </section>
</template>

<style scoped src="./index.scss"></style>
