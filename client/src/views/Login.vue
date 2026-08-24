<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="logo">E</div>
        <h1 class="title">学生登录</h1>
        <p class="subtitle">登录后即可浏览全部讲义</p>
      </div>
      
      <form @submit.prevent="login" class="form">
        <div class="role-tabs" role="tablist" aria-label="登录身份">
          <button
            type="button"
            role="tab"
            :class="['role-tab', { active: role === 'student' }]"
            :aria-selected="role === 'student'"
            @click="role = 'student'"
          >学生登录</button>
          <button
            type="button"
            role="tab"
            :class="['role-tab', { active: role === 'admin' }]"
            :aria-selected="role === 'admin'"
            @click="role = 'admin'"
          >管理员登录</button>
        </div>
        <div class="form-group">
          <label class="form-label">用户名</label>
          <input
            v-model="username"
            placeholder="请输入用户名"
            required
            class="input"
          />
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input
            v-model="password"
            type="password"
            placeholder="请输入密码"
            required
            class="input"
          />
        </div>

        <div v-if="error" class="error-alert">
          <span class="alert-mark">!</span>
          <span>{{ error }}</span>
        </div>

        <button type="submit" class="btn btn-primary" :disabled="loading">
          <span v-if="loading">正在登录...</span>
          <span v-else>立即登录</span>
        </button>
      </form>
      
      <p class="hint">还没有账号？<router-link to="/register" style="color: var(--color-primary)">立即注册</router-link></p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../lib/http'

const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
// 显式选择身份，直接打对应接口——避免每次学生登录都先对管理接口做一次失败尝试
const role = ref('student')

async function login() {
  loading.value = true
  error.value = ''
  try {
    const endpoint = role.value === 'admin'
      ? '/api/auth/admin/login'
      : '/api/auth/student/login'
    const res = await api.post(endpoint, {
      username: username.value,
      password: password.value
    })

    const { token, role: resRole } = res.data
    if (resRole === 'admin') {
      localStorage.setItem('adminToken', token)
      router.push('/admin/dashboard')
    } else {
      localStorage.setItem('token', token)
      localStorage.setItem('studentUsername', res.data.username || username.value)
      router.push('/')
    }
  } catch (e) {
    if (!e.response) {
      error.value = '网络连接失败，请检查网络后重试'
    } else {
      // 不区分"用户名不存在/密码错误"——统一提示可防止用户名枚举
      error.value = e.response?.data?.error || '登录失败，请稍后重试'
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
  background: linear-gradient(135deg, var(--color-bg) 0%, oklch(0.96 0.02 250) 100%);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: var(--color-primary);
  color: #ffffff;
  font-size: var(--text-lg);
  font-weight: 800;
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

.role-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  padding: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.role-tab {
  padding: var(--space-2) 0;
  border: none;
  border-radius: calc(var(--radius-md) - 2px);
  background: transparent;
  color: var(--color-ink-secondary);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out-expo);
}

.role-tab.active {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
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

.error-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: oklch(0.95 0.05 25);
  border: 1px solid oklch(0.85 0.05 25);
  color: var(--color-error);
  font-size: var(--text-sm);
}

.alert-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid currentColor;
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 800;
}

.btn {
  margin-top: var(--space-2);
}

.hint {
  text-align: center;
  color: var(--color-ink-tertiary);
  font-size: var(--text-sm);
  margin-top: var(--space-6);
}
</style>
