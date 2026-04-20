<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="logo">🛡️</div>
        <h1 class="title">管理员登录</h1>
        <p class="subtitle">管理后台访问需要管理员权限</p>
      </div>
      
      <form @submit.prevent="login" class="form">
        <div class="form-group">
          <label class="form-label">用户名</label>
          <input v-model="username" placeholder="请输入管理员账号" required class="input" />
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input v-model="password" type="password" placeholder="请输入密码" required class="input" />
        </div>
        <button type="submit" class="btn btn-primary" :disabled="loading">
          <span v-if="loading">正在验证...</span>
          <span v-else>进入管理后台</span>
        </button>
      </form>
      
      <div v-if="error" class="error-alert" style="margin-top: var(--space-4)">
        <span>⚠️</span>
        <span>{{ error }}</span>
      </div>
      
      <p class="hint">默认账号: admin / admin123</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function login() {
  loading.value = true
  error.value = ''
  try {
    const res = await axios.post('/api/auth/admin/login', {
      username: username.value,
      password: password.value
    })
    localStorage.setItem('adminToken', res.data.token)
    router.push('/admin/dashboard')
  } catch (e) {
    const msg = e.response?.data?.error
    if (msg?.includes('密码')) {
      error.value = '密码错误，请重新输入'
    } else if (msg?.includes('用户')) {
      error.value = '管理员账号不存在'
    } else {
      error.value = msg || '登录失败，请检查网络连接'
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: var(--space-6);
  background: linear-gradient(135deg, var(--color-bg) 0%, oklch(0.2 0.05 300) 100%);
}

.login-card {
  background: var(--color-surface);
  padding: var(--space-10);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 420px;
  border: 1px solid var(--color-border);
}

.login-header {
  text-align: center;
  margin-bottom: var(--space-8);
}

.logo {
  font-size: var(--text-3xl);
  margin-bottom: var(--space-4);
}

.title {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-ink);
  margin-bottom: var(--space-2);
}

.subtitle {
  font-size: var(--text-sm);
  color: var(--color-ink-tertiary);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.form-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink-secondary);
}

.hint {
  text-align: center;
  color: var(--color-ink-tertiary);
  font-size: var(--text-xs);
  margin-top: var(--space-6);
}
</style>