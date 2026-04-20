<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="logo">🛡️</div>
        <h1 class="title">创建管理员</h1>
        <p class="subtitle">仅限首位管理员注册</p>
      </div>
      
      <form @submit.prevent="register" class="form">
        <div class="form-group">
          <label class="form-label">用户名</label>
          <input v-model="username" placeholder="设置管理员用户名" required class="input" />
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input v-model="password" type="password" placeholder="设置密码" required class="input" />
        </div>
        <button type="submit" class="btn btn-primary" :disabled="loading">
          <span v-if="loading">正在创建...</span>
          <span v-else>创建管理员账号</span>
        </button>
      </form>
      
      <div v-if="error" class="error-alert" style="margin-top: var(--space-4)">
        <span>⚠️</span>
        <span>{{ error }}</span>
      </div>
      
      <p class="hint"><router-link to="/admin" style="color: var(--color-primary)">返回登录</router-link></p>
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

async function register() {
  loading.value = true
  error.value = ''
  try {
    const res = await axios.post('/api/auth/admin/register', {
      username: username.value,
      password: password.value
    })
    localStorage.setItem('adminToken', res.data.token)
    router.push('/admin/dashboard')
  } catch (e) {
    error.value = e.response?.data?.error || '注册失败'
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
