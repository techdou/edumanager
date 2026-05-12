<template>
  <section class="users-page">
    <div class="toolbar">
      <div class="search-box">
        <input
          v-model="filters.search"
          class="admin-input"
          placeholder="搜索用户名或邮箱"
          @keyup.enter="applyFilters"
        />
        <button class="btn-primary" type="button" @click="applyFilters">搜索</button>
      </div>
      <select v-model="filters.role" class="admin-select" @change="applyFilters">
        <option value="">全部角色</option>
        <option value="admin">管理员</option>
        <option value="student">学生</option>
      </select>
      <select v-model="filters.status" class="admin-select" @change="applyFilters">
        <option value="">全部状态</option>
        <option value="active">启用</option>
        <option value="disabled">禁用</option>
      </select>
      <button class="btn-primary add-button" type="button" @click="openCreate">新增用户</button>
    </div>

    <div v-if="error" class="alert">{{ error }}</div>

    <section class="table-panel">
      <div v-if="loading" class="empty">正在加载用户...</div>
      <div v-else-if="users.length === 0" class="empty">暂无匹配用户</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>真实姓名</th>
              <th>邮箱</th>
              <th>角色</th>
              <th>状态</th>
              <th>班级</th>
              <th>注册时间</th>
              <th>最后登录</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td class="primary-cell">{{ user.username }}</td>
              <td>{{ user.real_name || '-' }}</td>
              <td>{{ user.email || '-' }}</td>
              <td><span class="tag" :class="user.role">{{ roleText(user.role) }}</span></td>
              <td><span class="tag" :class="user.status">{{ statusText(user.status) }}</span></td>
              <td>
                <div v-if="user.groups && user.groups.length > 0" class="group-tags">
                  <span v-for="g in user.groups" :key="g.id" class="tag group">{{ g.name }}</span>
                </div>
                <span v-else style="color: #7a8494;">-</span>
              </td>
              <td>{{ formatDate(user.created_at) }}</td>
              <td>{{ formatDate(user.last_login) }}</td>
              <td>
                <div class="actions">
                  <button type="button" @click="openEdit(user)">编辑</button>
                  <button type="button" @click="toggleStatus(user)">
                    {{ user.status === 'disabled' ? '启用' : '禁用' }}
                  </button>
                  <button type="button" class="danger" @click="deleteUser(user)">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="pagination">
      <span>共 {{ total }} 位用户</span>
      <div>
        <button type="button" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button>
        <strong>{{ page }} / {{ totalPages || 1 }}</strong>
        <button type="button" :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button>
      </div>
    </div>

    <div v-if="showModal" class="modal-backdrop" @click.self="closeModal">
      <form class="modal" @submit.prevent="saveUser">
        <div class="modal-header">
          <h2>{{ modalMode === 'create' ? '新增用户' : '编辑用户' }}</h2>
          <button type="button" class="icon-button" @click="closeModal">×</button>
        </div>

        <label>
          <span>用户名</span>
          <input v-model="form.username" class="admin-input" required />
        </label>

        <label>
          <span>邮箱</span>
          <input v-model="form.email" class="admin-input" type="email" placeholder="可选" />
        </label>

        <label>
          <span>密码</span>
          <input
            v-model="form.password"
            class="admin-input"
            type="password"
            :placeholder="modalMode === 'create' ? '必填' : '留空则不修改'"
            :required="modalMode === 'create'"
          />
        </label>

        <div class="form-grid">
          <label>
            <span>角色</span>
            <select v-model="form.role" class="admin-select">
              <option value="student">学生</option>
              <option value="admin">管理员</option>
            </select>
          </label>

          <label>
            <span>状态</span>
            <select v-model="form.status" class="admin-select">
              <option value="active">启用</option>
              <option value="disabled">禁用</option>
            </select>
          </label>
        </div>

        <div v-if="modalError" class="alert">{{ modalError }}</div>

        <div class="modal-actions">
          <button type="button" class="btn-secondary" @click="closeModal">取消</button>
          <button type="submit" class="btn-primary" :disabled="saving">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import adminApi from '../../lib/adminApi'

const users = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const totalPages = ref(1)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const modalError = ref('')
const showModal = ref(false)
const modalMode = ref('create')

const filters = reactive({
  search: '',
  role: '',
  status: ''
})

const form = reactive({
  id: null,
  username: '',
  email: '',
  password: '',
  role: 'student',
  status: 'active'
})

onMounted(fetchUsers)

async function fetchUsers() {
  loading.value = true
  error.value = ''
  try {
    const res = await adminApi.get('/users', {
      params: {
        page: page.value,
        pageSize,
        search: filters.search || undefined,
        role: filters.role || undefined,
        status: filters.status || undefined
      }
    })
    users.value = res.data.items || []
    total.value = res.data.total || 0
    totalPages.value = res.data.totalPages || 1
  } catch (e) {
    error.value = e.response?.data?.error || '用户列表加载失败'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  fetchUsers()
}

function changePage(nextPage) {
  page.value = nextPage
  fetchUsers()
}

function resetForm() {
  Object.assign(form, {
    id: null,
    username: '',
    email: '',
    password: '',
    role: 'student',
    status: 'active'
  })
  modalError.value = ''
}

function openCreate() {
  resetForm()
  modalMode.value = 'create'
  showModal.value = true
}

async function openEdit(user) {
  resetForm()
  modalMode.value = 'edit'
  showModal.value = true
  try {
    const res = await adminApi.get(`/users/${user.id}`)
    Object.assign(form, {
      id: res.data.id,
      username: res.data.username,
      email: res.data.email || '',
      password: '',
      role: res.data.role,
      status: res.data.status
    })
  } catch (e) {
    modalError.value = e.response?.data?.error || '用户详情加载失败'
  }
}

function closeModal() {
  showModal.value = false
  resetForm()
}

async function saveUser() {
  saving.value = true
  modalError.value = ''
  try {
    const payload = {
      username: form.username,
      email: form.email,
      role: form.role,
      status: form.status
    }
    if (form.password) payload.password = form.password

    if (modalMode.value === 'create') {
      await adminApi.post('/users', payload)
    } else {
      await adminApi.put(`/users/${form.id}`, payload)
    }
    closeModal()
    fetchUsers()
  } catch (e) {
    modalError.value = e.response?.data?.error || '保存失败'
  } finally {
    saving.value = false
  }
}

async function toggleStatus(user) {
  try {
    const res = await adminApi.put(`/users/${user.id}/toggle-status`)
    users.value = users.value.map(item => item.id === user.id ? res.data : item)
  } catch (e) {
    error.value = e.response?.data?.error || '状态更新失败'
  }
}

async function deleteUser(user) {
  if (!confirm(`确定删除用户「${user.username}」吗？此操作无法恢复。`)) return
  try {
    await adminApi.delete(`/users/${user.id}`)
    fetchUsers()
  } catch (e) {
    error.value = e.response?.data?.error || '删除失败'
  }
}

function roleText(role) {
  return role === 'admin' ? '管理员' : '学生'
}

function statusText(status) {
  return status === 'disabled' ? '禁用' : '启用'
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(String(value).replace(' ', 'T')).toLocaleString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.users-page {
  display: grid;
  gap: 18px;
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 150px 150px auto;
  gap: 12px;
  align-items: center;
}

.search-box {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.admin-input,
.admin-select {
  width: 100%;
  min-height: 42px;
  padding: 9px 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
  color: #172033;
  font: inherit;
  font-size: 14px;
}

.admin-input:focus,
.admin-select:focus {
  border-color: #2f6fed;
  box-shadow: 0 0 0 3px #eaf1ff;
  outline: none;
}

.btn-primary,
.btn-secondary,
.pagination button,
.actions button {
  min-height: 38px;
  padding: 8px 13px;
  border: 1px solid transparent;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  font-weight: 750;
  cursor: pointer;
}

.btn-primary {
  background: #2f6fed;
  color: white;
}

.btn-primary:disabled,
.pagination button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.btn-secondary,
.pagination button,
.actions button {
  background: #ffffff;
  border-color: #d8dee8;
  color: #4d596d;
}

.actions .danger {
  color: #b42318;
}

.alert {
  padding: 12px 14px;
  border: 1px solid #ffd4d0;
  border-radius: 8px;
  background: #fff4f2;
  color: #b42318;
  font-weight: 650;
}

.table-panel {
  overflow: hidden;
  border: 1px solid #e6eaf0;
  border-radius: 8px;
  background: #ffffff;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 1100px;
  border-collapse: collapse;
}

th,
td {
  padding: 14px 16px;
  border-bottom: 1px solid #eef1f5;
  color: #4d596d;
  font-size: 14px;
  text-align: left;
  white-space: nowrap;
}

th {
  background: #f8fafc;
  color: #6d7788;
  font-size: 12px;
  font-weight: 800;
}

tbody tr:last-child td {
  border-bottom: 0;
}

.primary-cell {
  color: #172033;
  font-weight: 800;
}

.tag {
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  background: #edf2f7;
  color: #4d596d;
  font-size: 12px;
  font-weight: 800;
}

.tag.admin,
.tag.active {
  background: #eaf1ff;
  color: #1f5fce;
}

.tag.disabled {
  background: #fff4f2;
  color: #b42318;
}

.tag.group {
  background: #f0f4ff;
  color: #2f6fed;
}

.group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.actions {
  display: flex;
  gap: 8px;
}

.empty {
  padding: 34px;
  color: #7a8494;
  text-align: center;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #6d7788;
  font-size: 14px;
}

.pagination div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pagination strong {
  color: #172033;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(15, 23, 42, 0.42);
}

.modal {
  width: min(520px, 100%);
  display: grid;
  gap: 16px;
  padding: 22px;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal h2 {
  color: #172033;
  font-size: 20px;
}

.icon-button {
  width: 34px;
  height: 34px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: white;
  color: #4d596d;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.modal label {
  display: grid;
  gap: 7px;
  color: #4d596d;
  font-size: 13px;
  font-weight: 800;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 980px) {
  .toolbar {
    grid-template-columns: 1fr 1fr;
  }

  .search-box {
    grid-column: 1 / -1;
  }

  .add-button {
    grid-column: 2;
  }
}

@media (max-width: 620px) {
  .toolbar,
  .search-box,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .add-button {
    grid-column: auto;
  }

  .pagination {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
