<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../../store/app'
import { useFishControlStore, type Fish } from '../../store/fishControl'

const router = useRouter()
const appStore = useAppStore()
const fishControlStore = useFishControlStore()

const VALID_USERNAME = 'admin_123'
const VALID_PASSWORD = 'admin_123'

const fishList = ref<Fish[]>([])

const form = reactive({
  username: 'admin_123',
  password: 'admin_123',
  robotId: null as number | null,
  showPassword: false
})

onMounted(async () => {
  try {
    const list = await window.api.fish.findAll()
    fishList.value = list
    if (list.length > 0) {
      form.robotId = list[0].id
    }
  } catch (err) {
    console.error('Failed to fetch fish list:', err)
  }
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

      const target = fishList.value.find(f => f.id === form.robotId)
      if (target) {
        // 兼容旧逻辑，虽然后续可能不再使用 string ID
        appStore.setSelectedRobotId(String(target.id))

        fishControlStore.setCurrentFish(target)
        fishControlStore.initListeners()
        void fishControlStore.connect()
      }

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
            v-model.trim="form.username"
            class="input"
            type="text"
            placeholder="请输入账号"
            @keydown="onEnter"
          />
        </label>

        <label class="field">
          <span class="label">密码</span>
          <div class="password-row">
            <input
              v-model.trim="form.password"
              class="input"
              :type="form.showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              @keydown="onEnter"
            />
            <button class="ghost" type="button" @click="form.showPassword = !form.showPassword">
              {{ form.showPassword ? '隐藏' : '显示' }}
            </button>
          </div>
        </label>

        <label class="field">
          <span class="label">选择机器人</span>
          <el-select
            v-model="form.robotId"
            placeholder="请选择机器人"
            size="large"
            style="width: 100%"
          >
            <el-option
              v-for="item in fishList"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <button class="submit" :disabled="isDisabled()" @click="submit">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </div>

      <div class="hint">体验账号：<code>admin_123</code> / 密码：<code>admin_123</code></div>
    </div>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>
