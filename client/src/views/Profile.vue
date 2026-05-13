<template>
  <div class="profile-page">
    <header class="main-header">
      <div class="container header-content">
        <div class="brand">
          <svg class="brand-icon" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor" opacity="0.9"/><path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="brand-name">EduManager</span>
        </div>
        <nav class="nav">
          <router-link to="/" class="nav-link">首页</router-link>
          <router-link to="/learn" class="nav-link">学习中心</router-link>
          <router-link to="/profile" class="nav-link" style="color: var(--color-primary); font-weight: 600;">学生中心</router-link>
          <button class="nav-link" @click="logout">退出</button>
        </nav>
      </div>
    </header>

    <main class="main-content">
      <div class="container">
        <section class="library-header">
          <div>
            <p class="eyebrow">个人中心</p>
            <h1>学生信息</h1>
          </div>
        </section>

        <div v-if="loading" style="padding: 40px; text-align: center; color: var(--color-ink-tertiary);">加载中...</div>

        <template v-else-if="profile">
          <div v-if="message" :class="['alert-banner', messageType]">
            <svg v-if="messageType === 'success'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>{{ message }}</span>
          </div>

          <div class="profile-grid">
            <div class="info-card card">
              <div class="card-header-row">
                <h3 class="card-title">基本信息</h3>
                <button v-if="!editing" class="btn-edit" @click="startEdit">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  编辑
                </button>
              </div>

              <div v-if="editing" class="edit-form">
                <div class="form-row">
                  <label class="form-label">用户名</label>
                  <input class="form-input" :value="profile.username" disabled />
                  <span class="form-hint">用户名不可修改</span>
                </div>
                <div class="form-row">
                  <label class="form-label">真实姓名</label>
                  <input v-model="editForm.real_name" class="form-input" placeholder="请输入真实姓名" />
                </div>
                <div class="form-row">
                  <label class="form-label">邮箱</label>
                  <input v-model="editForm.email" class="form-input" placeholder="请输入邮箱" type="email" />
                </div>
                <div class="form-actions">
                  <button class="btn-save" @click="saveProfile" :disabled="saving">
                    <svg v-if="saving" class="spinner" width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="31.4 31.4"/></svg>
                    <span>{{ saving ? '保存中' : '保存' }}</span>
                  </button>
                  <button class="btn-cancel" @click="cancelEdit">取消</button>
                </div>
              </div>

              <div v-else class="info-list">
                <div class="info-row">
                  <span class="info-label">用户名</span>
                  <span class="info-value">{{ profile.username }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">真实姓名</span>
                  <span class="info-value">{{ profile.real_name || '未填写' }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">邮箱</span>
                  <span class="info-value">{{ profile.email || '未填写' }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">注册时间</span>
                  <span class="info-value">{{ formatDate(profile.created_at) }}</span>
                </div>
              </div>
            </div>

            <div class="info-card card">
              <h3 class="card-title">所属班级</h3>
              <div v-if="profile.groups.length === 0" class="empty-info">暂未分配班级</div>
              <div v-else class="tag-list">
                <span v-for="group in profile.groups" :key="group.id" class="group-tag">{{ group.name }}</span>
              </div>
            </div>

            <div class="info-card card">
              <h3 class="card-title">可访问分类</h3>
              <div v-if="profile.accessibleCategories.length === 0" class="empty-info">暂无可访问分类</div>
              <div v-else class="tag-list">
                <span v-for="cat in profile.accessibleCategories" :key="cat.id" class="category-tag">{{ cat.name }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const profile = ref(null)
const loading = ref(true)
const editing = ref(false)
const saving = ref(false)
const message = ref('')
const messageType = ref('')
const editForm = ref({ real_name: '', email: '' })

function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('studentUsername')
  router.push('/')
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(String(value).replace(' ', 'T')).toLocaleString('zh-CN', { hour12: false })
}

function startEdit() {
  editForm.value = {
    real_name: profile.value.real_name || '',
    email: profile.value.email || ''
  }
  editing.value = true
  message.value = ''
}

function cancelEdit() {
  editing.value = false
  message.value = ''
}

async function saveProfile() {
  saving.value = true
  message.value = ''
  try {
    const token = localStorage.getItem('token')
    const res = await axios.put('/api/auth/student/profile', {
      real_name: editForm.value.real_name.trim() || null,
      email: editForm.value.email.trim() || null
    }, {
      headers: { Authorization: `Bearer ${token}` }
    })
    profile.value = res.data
    editing.value = false
    message.value = '个人信息已更新'
    messageType.value = 'success'
  } catch (e) {
    message.value = e.response?.data?.error || '更新失败'
    messageType.value = 'error'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  const token = localStorage.getItem('token')
  if (!token) { router.push('/'); return }
  try {
    const res = await axios.get('/api/auth/student/profile', {
      headers: { Authorization: `Bearer ${token}` }
    })
    profile.value = res.data
  } catch (e) {
    if (e.response?.status === 401) router.push('/')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.main-header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
  background: oklch(1 0 0 / 0.85);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: var(--space-4);
  padding-bottom: var(--space-4);
}

.brand { display: flex; align-items: center; gap: var(--space-3); }
.brand-icon { color: var(--color-brand); flex-shrink: 0; }
.brand-name {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-brand);
  letter-spacing: -0.02em;
}

.nav { display: flex; gap: var(--space-2); }
.nav-link {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink-secondary);
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out-expo);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
}
.nav-link:hover { background: var(--color-bg); color: var(--color-ink); }

.main-content { padding-top: var(--space-8); padding-bottom: var(--space-16); }

.library-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-6);
  margin-bottom: var(--space-6);
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.eyebrow { color: var(--color-brand); font-size: var(--text-xs); font-weight: 700; }
.library-header h1 {
  margin-top: var(--space-1);
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  line-height: 1.2;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: var(--space-6);
}

.info-card { display: flex; flex-direction: column; gap: var(--space-4); }
.card-title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-ink);
}

.info-list { display: flex; flex-direction: column; gap: var(--space-3); }
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}
.info-row:last-child { border-bottom: none; }
.info-label { color: var(--color-ink-secondary); font-size: var(--text-sm); }
.info-value { color: var(--color-ink); font-size: var(--text-sm); font-weight: 600; }

.tag-list { display: flex; flex-wrap: wrap; gap: var(--space-2); }

.group-tag {
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  font-size: var(--text-sm);
  font-weight: 600;
}

.category-tag {
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  background: var(--color-brand-subtle);
  color: var(--color-brand);
  font-size: var(--text-sm);
  font-weight: 600;
}

.empty-info { color: var(--color-ink-tertiary); font-size: var(--text-sm); }

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.btn-edit {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-ink-secondary);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out-expo);
}
.btn-edit:hover {
  background: var(--color-bg);
  border-color: var(--color-ink-tertiary);
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.form-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink-secondary);
}

.form-input {
  min-height: 40px;
  padding: 9px 12px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--text-sm);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-subtle);
  outline: none;
}
.form-input::placeholder {
  color: var(--color-ink-tertiary);
}
.form-input:disabled {
  background: var(--color-bg);
  color: var(--color-ink-tertiary);
  cursor: not-allowed;
}

.form-hint {
  font-size: var(--text-xs);
  color: var(--color-ink-tertiary);
}

.form-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.btn-save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: white;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-save:hover:not(:disabled) { opacity: 0.9; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-cancel {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-ink-secondary);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.btn-cancel:hover { background: var(--color-bg); }

.alert-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  margin-bottom: var(--space-5);
}
.alert-banner.success {
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}
.alert-banner.error {
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.spinner {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .header-content { flex-direction: column; gap: var(--space-3); }
  .profile-grid { grid-template-columns: 1fr; }
}
</style>
