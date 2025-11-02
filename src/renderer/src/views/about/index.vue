<script setup lang="ts">
const info = 'This is an About page with SCSS styles.'
</script>

<template>
  <section class="about">
    <h1>About</h1>
    <p>{{ info }}</p>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>