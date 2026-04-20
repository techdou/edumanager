<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="logo">📚</div>
        <h1 class="title">学生注册</h1>
        <p class="subtitle">创建账号后即可浏览全部讲义</p>
      </div>
      
      <form @submit.prevent="register" class="form">
        <div class="form-group">
          <label class="form-label">用户名</label>
          <input 
            v-model="username" 
            placeholder="创建用户名" 
            required 
            class="input"
          />
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input 
            v-model="password" 
            type="password" 
            placeholder="设置密码（至少6位）" 
            required 
            minlength="6"
            class="input"
          />
        </div>
        <div class="form-group">
          <label class="form-label">确认密码</label>
          <input 
            v-model="confirmPassword" 
            type="password" 
            placeholder="再次输入密码" 
            required 
            class="input"
          />
        </div>
        
        <div v-if="error" class="error-alert">
          <span>⚠️</span>
          <span>{{ error }}</span>
        </div>
        
        <button type="submit" class="btn btn-primary" :disabled="loading">
          <span v-if="loading">正在注册...</span>
          <span v-else>创建账号</span>
        </button>
      </form>
      
      <p class="hint">已有账号？<router-link to="/login" style="color: var(--color-primary)">立即登录</router-link></p>
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
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

async function register() {
  if (password.value.length < 6) {
    error.value = '密码至少6位'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = '两次密码输入不一致'
    return
  }
  
  loading.value = true
  error.value = ''
  try {
    const res = await axios.post('/api/auth/student/register', {
      username: username.value,
      password: password.value
    })
    const { token, username: uname, role } = res.data
    if (role === 'admin') {
      localStorage.setItem('adminToken', token)
      router.push('/admin/dashboard')
    } else {
      localStorage.setItem('token', token)
      localStorage.setItem('studentUsername', uname)
      router.push('/')
    }
  } catch (e) {
    const msg = e.response?.data?.error
    if (msg?.includes('exists')) {
      error.value = '该用户名已被使用，请换个名字'
    } else {
      error.value = msg || '注册失败，请稍后重试'
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
