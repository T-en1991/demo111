<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../../store/app'
import { useFishControlStore } from '../../store/fishControl'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const appStore = useAppStore()
const fishControlStore = useFishControlStore()
const { t } = useI18n()

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
      // 登录后自动加载机器鱼并连接
      // 使用 await 确保 fishControlStore 更新完毕
      window.api.fish.findAll().then(async (list) => {
        if (list && list.length > 0) {
          // 1. 加载所有鱼到 Store (修复多鱼不显示问题)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fishControlStore.setAllFish(list as any[])

          // 2. 设置当前选中的鱼（默认第一条）
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const firstFish = list[0] as any
          fishControlStore.setCurrentFish(firstFish)

          console.log('[Login] Auto connecting to fish:', firstFish.name)
          // 注意：setAllFish 内部并没有自动连接所有鱼，如果需要全部自动连接，可以在这里遍历调用 connect
          // 目前只保留对当前选中鱼的自动连接尝试（在 setCurrentFish 中触发）
        }
      })
      router.push({ name: 'screen' })
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
