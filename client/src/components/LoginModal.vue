<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="close">
      <div class="modal-card">
        <!-- Tabs -->
        <div class="modal-tabs">
          <button
            :class="['tab', { active: mode === 'login' }]"
            @click="mode = 'login'"
          >登录</button>
          <button
            :class="['tab', { active: mode === 'register' }]"
            @click="mode = 'register'"
          >注册</button>
        </div>

        <!-- Error -->
        <div v-if="error" class="modal-error">{{ error }}</div>

        <!-- Form -->
        <form @submit.prevent="handleSubmit">
          <div class="field">
            <label>用户名</label>
            <input
              v-model="username"
              class="input"
              placeholder="请输入用户名"
              autocomplete="username"
              required
            />
          </div>
          <div class="field">
            <label>密码</label>
            <input
              v-model="password"
              class="input"
              type="password"
              placeholder="请输入密码"
              autocomplete="current-password"
              required
            />
          </div>
          <button class="btn btn-primary btn-block" :disabled="loading">
            {{ loading ? '请稍候...' : (mode === 'login' ? '登录' : '注册') }}
          </button>
        </form>

        <p class="modal-footer-text">
          <template v-if="mode === 'login'">
            还没有账号？<a @click="mode = 'register'">立即注册</a>
          </template>
          <template v-else>
            已有账号？<a @click="mode = 'login'">去登录</a>
          </template>
        </p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['update:visible', 'success'])

const mode = ref('login')
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

function close() {
  emit('update:visible', false)
  error.value = ''
}

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    const endpoint = mode.value === 'login' ? '/api/auth/student/login' : '/api/auth/student/register'
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value })
    })
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error || '操作失败'
      return
    }
    // Save token
    localStorage.setItem('token', data.token)
    localStorage.setItem('studentUsername', data.username)
    if (data.role === 'admin') localStorage.setItem('adminToken', data.token)
    close()
    emit('success')
  } catch {
    error.value = '网络错误，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: oklch(0.15 0 0 / 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: fadeIn 200ms var(--ease-out-expo, ease-out);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-card {
  background: var(--color-surface, #fff);
  border-radius: var(--radius-xl, 24px);
  padding: var(--space-8, 32px);
  width: 380px;
  max-width: 90vw;
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.1));
  animation: slideUp 250ms var(--ease-out-expo, ease-out);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.modal-tabs {
  display: flex;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-6, 24px);
  background: var(--color-bg, #faf9f7);
  border-radius: var(--radius-md, 10px);
  padding: 3px;
}

.tab {
  flex: 1;
  padding: var(--space-2, 8px) var(--space-4, 16px);
  border: none;
  border-radius: var(--radius-sm, 6px);
  font-family: var(--font-sans, system-ui);
  font-size: var(--text-sm, 14px);
  font-weight: 600;
  color: var(--color-ink-secondary);
  background: transparent;
  cursor: pointer;
  transition: all 150ms ease-out;
}

.tab.active {
  background: var(--color-surface, #fff);
  color: var(--color-ink);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05));
}

.modal-error {
  padding: var(--space-3, 12px);
  border-radius: var(--radius-md, 10px);
  background: var(--color-error-subtle, #fef2f2);
  border: 1px solid oklch(0.85 0.05 25);
  color: var(--color-error);
  font-size: var(--text-sm, 14px);
  margin-bottom: var(--space-4, 16px);
}

.field {
  margin-bottom: var(--space-4, 16px);
}

.field label {
  display: block;
  font-size: var(--text-sm, 14px);
  font-weight: 500;
  color: var(--color-ink-secondary);
  margin-bottom: var(--space-2, 8px);
}

.btn-block {
  width: 100%;
  padding: var(--space-3, 12px) 0;
  margin-top: var(--space-2, 8px);
}

.modal-footer-text {
  text-align: center;
  margin-top: var(--space-5, 20px);
  font-size: var(--text-sm, 14px);
  color: var(--color-ink-tertiary);
}

.modal-footer-text a {
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
}
</style>
