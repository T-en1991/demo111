<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../../store/app'
import { useFishControlStore, type Fish } from '../../store/fishControl'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const appStore = useAppStore()
const fishControlStore = useFishControlStore()
const { t } = useI18n()

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
        appStore.setSelectedRobotId(target.id)

        fishControlStore.setCurrentFish(target)
        fishControlStore.initListeners()
        // 登录成功后启动后台监听（串口/TCP）
        void (window.api as any).startMonitoring()
        void fishControlStore.connect()
      }

      router.push({ name: 'home' })
    } else {
      error.value = t('login.error')
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
        <p>{{ t('login.welcome') }}</p>
      </div>

      <div class="form">
        <label class="field">
          <span class="label">{{ t('login.account') }}</span>
          <input
            v-model.trim="form.username"
            class="input"
            type="text"
            :placeholder="t('login.placeholderAccount')"
            @keydown="onEnter"
          />
        </label>

        <label class="field">
          <span class="label">{{ t('login.password') }}</span>
          <div class="password-row">
            <input
              v-model.trim="form.password"
              class="input"
              :type="form.showPassword ? 'text' : 'password'"
              :placeholder="t('login.placeholderPassword')"
              @keydown="onEnter"
            />
            <button class="ghost" type="button" @click="form.showPassword = !form.showPassword">
              {{ form.showPassword ? t('login.hide') : t('login.show') }}
            </button>
          </div>
        </label>

        <label class="field">
          <span class="label">{{ t('login.selectRobot') }}</span>
          <el-select
            v-model="form.robotId"
            :placeholder="t('login.placeholderRobot')"
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
          {{ loading ? t('login.loggingIn') : t('login.loginBtn') }}
        </button>
      </div>

      <div class="hint">{{ t('login.hint') }}</div>
    </div>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>
