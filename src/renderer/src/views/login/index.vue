<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../../store/app'

const router = useRouter()
const appStore = useAppStore()

const VALID_USERNAME = 'admin_123'
const VALID_PASSWORD = 'admin_123'

const form = reactive({
  username: 'admin_123',
  password: 'admin_123',
  showPassword: false
})

const loading = ref(false)
const error = ref('')

const canSubmit = computed<boolean>(() => !!form.username.trim() && !!form.password.trim())
function isDisabled(): boolean {
  return !canSubmit.value || loading.value
}

function submit(): void {
  error.value = ''
  if (!canSubmit.value) return
  loading.value = true
  setTimeout(() => {
    loading.value = false
    const ok = form.username === VALID_USERNAME && form.password === VALID_PASSWORD
    if (ok) {
      appStore.login()
      router.push({ name: 'home' })
    } else {
      error.value = '账号或密码错误'
    }
  }, 400)
}

function onEnter(e: KeyboardEvent): void {
  if (e.key === 'Enter') submit()
}
</script>

<template>
  <section class="login-wrap">
    <div class="login-card">
      <div class="brand">
        <div class="logo-dot" />
        <h1>OceanFish</h1>
        <p>欢迎登录</p>
      </div>

      <div class="form">
        <label class="field">
          <span class="label">账号</span>
          <input
            class="input"
            type="text"
            placeholder="请输入账号"
            v-model.trim="form.username"
            @keydown="onEnter"
          />
        </label>

        <label class="field">
          <span class="label">密码</span>
          <div class="password-row">
            <input
              class="input"
              :type="form.showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              v-model.trim="form.password"
              @keydown="onEnter"
            />
            <button class="ghost" type="button" @click="form.showPassword = !form.showPassword">
              {{ form.showPassword ? '隐藏' : '显示' }}
            </button>
          </div>
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <button class="submit" :disabled="isDisabled()" @click="submit">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </div>

      <div class="hint">
        体验账号：<code>admin_123</code> / 密码：<code>admin_123</code>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>
