<template>
  <section class="categories-page">
    <header class="page-header">
      <h1>分类管理</h1>
      <p class="subtitle">管理讲义分类，方便学生浏览和筛选</p>
    </header>

    <section class="create-card">
      <h3>新建分类</h3>
      <form class="create-form" @submit.prevent="createCategory">
        <div class="input-group">
          <input
            v-model="newName"
            class="admin-input"
            placeholder="输入新分类名称，如：机器学习"
            maxlength="50"
          />
          <button class="btn-primary" type="submit" :disabled="saving || !newName.trim()">
            <svg v-if="saving" class="spinner" width="16" height="16" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="31.4 31.4" />
            </svg>
            <span>{{ saving ? '保存中' : '添加分类' }}</span>
          </button>
        </div>
      </form>
    </section>

    <div v-if="error" class="alert-banner" @click="error = ''">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>{{ error }}</span>
    </div>

    <section class="data-card">
      <div class="card-header">
        <h3>全部分类</h3>
        <span class="count-badge">{{ categories.length }} 个</span>
      </div>

      <div v-if="loading" class="loading-state">
        <div class="skeleton-row" v-for="n in 4" :key="n">
          <div class="skeleton-text" style="width: 30%"></div>
          <div class="skeleton-text" style="width: 15%"></div>
          <div class="skeleton-text" style="width: 20%"></div>
          <div class="skeleton-text" style="width: 20%"></div>
        </div>
      </div>

      <div v-else-if="categories.length === 0" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <p>还没有分类</p>
        <span>在上方创建第一个分类，即可开始上传讲义</span>
      </div>

      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="col-name">分类名称</th>
              <th class="col-count">讲义数量</th>
              <th class="col-date">创建时间</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="category in categories" :key="category.id">
              <td class="cell-name">
                <template v-if="editingId === category.id">
                  <input
                    v-model="editingName"
                    class="admin-input compact"
                    @keyup.enter="saveEdit(category)"
                    @keyup.esc="cancelEdit"
                    ref="editInput"
                  />
                </template>
                <template v-else>
                  <span class="category-label">{{ category.name }}</span>
                </template>
              </td>
              <td class="cell-count">
                <span class="badge" :class="{ zero: !category.lecture_count }">
                  {{ category.lecture_count || 0 }}
                </span>
              </td>
              <td class="cell-date">{{ formatDate(category.created_at) }}</td>
              <td class="cell-actions">
                <div class="actions" v-if="editingId === category.id">
                  <button type="button" class="btn-save" @click="saveEdit(category)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    保存
                  </button>
                  <button type="button" class="btn-ghost" @click="cancelEdit">取消</button>
                </div>
                <div class="actions" v-else>
                  <button type="button" class="btn-icon" @click="startEdit(category)" title="编辑">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    编辑
                  </button>
                  <button type="button" class="btn-icon danger" @click="deleteCategory(category)" title="删除">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    删除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import adminApi from '../../lib/adminApi'

const categories = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const newName = ref('')
const editingId = ref(null)
const editingName = ref('')

onMounted(fetchCategories)

async function fetchCategories() {
  loading.value = true
  error.value = ''
  try {
    const res = await adminApi.get('/categories')
    categories.value = res.data
  } catch (e) {
    error.value = e.response?.data?.error || '分类加载失败'
  } finally {
    loading.value = false
  }
}

async function createCategory() {
  if (!newName.value.trim()) return
  saving.value = true
  error.value = ''
  try {
    const res = await adminApi.post('/categories', { name: newName.value.trim() })
    categories.value = [res.data, ...categories.value]
    newName.value = ''
  } catch (e) {
    error.value = e.response?.data?.error || '创建失败'
  } finally {
    saving.value = false
  }
}

function startEdit(category) {
  editingId.value = category.id
  editingName.value = category.name
}

function cancelEdit() {
  editingId.value = null
  editingName.value = ''
}

async function saveEdit(category) {
  const name = editingName.value.trim()
  if (!name) return
  error.value = ''
  try {
    const res = await adminApi.put(`/categories/${category.id}`, { name })
    categories.value = categories.value.map(item => item.id === category.id ? res.data : item)
    cancelEdit()
  } catch (e) {
    error.value = e.response?.data?.error || '更新失败'
  }
}

async function deleteCategory(category) {
  if (!confirm(`确定删除分类「${category.name}」吗？`)) return
  error.value = ''
  try {
    await adminApi.delete(`/categories/${category.id}`)
    categories.value = categories.value.filter(item => item.id !== category.id)
  } catch (e) {
    error.value = e.response?.data?.error || '删除失败'
  }
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(String(value).replace(' ', 'T')).toLocaleString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.categories-page {
  display: grid;
  gap: 24px;
  max-width: 960px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px 0;
  letter-spacing: -0.02em;
}

.page-header .subtitle {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

.create-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px 24px;
}

.create-card h3 {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 14px 0;
}

.create-form {
  display: flex;
  gap: 12px;
  align-items: stretch;
}

.input-group {
  display: flex;
  gap: 12px;
  flex: 1;
}

.admin-input {
  flex: 1;
  min-height: 42px;
  padding: 10px 14px;
  border: 1.5px solid #d1d5db;
  border-radius: 10px;
  background: #ffffff;
  color: #1e293b;
  font: inherit;
  font-size: 14px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.admin-input.compact {
  min-height: 36px;
  padding: 7px 12px;
}

.admin-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px #dbeafe;
  outline: none;
}

.admin-input::placeholder {
  color: #9ca3af;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 20px;
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: white;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-primary:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-primary:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.alert-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.data-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #f1f5f9;
}

.card-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.count-badge {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  background: #f1f5f9;
  padding: 4px 12px;
  border-radius: 999px;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 600px;
  border-collapse: collapse;
}

th {
  padding: 12px 24px;
  border-bottom: 1px solid #e2e8f0;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

td {
  padding: 14px 24px;
  border-bottom: 1px solid #f1f5f9;
  color: #475569;
  font-size: 14px;
  vertical-align: middle;
}

tbody tr:hover {
  background: #f8fafc;
}

tbody tr:last-child td {
  border-bottom: 0;
}

.cell-name .category-label {
  color: #0f172a;
  font-weight: 600;
}

.cell-count .badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 13px;
  font-weight: 600;
}

.cell-count .badge.zero {
  background: #f1f5f9;
  color: #94a3b8;
}

.cell-date {
  color: #64748b;
  font-size: 13px;
  white-space: nowrap;
}

.actions {
  display: flex;
  gap: 6px;
}

.btn-icon {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  color: #475569;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
}

.btn-icon:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-icon.danger {
  color: #dc2626;
  border-color: #fecaca;
  background: #fef2f2;
}

.btn-icon.danger:hover {
  background: #fee2e2;
  border-color: #f87171;
}

.btn-save {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: #059669;
  color: white;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 56px 24px;
  color: #94a3b8;
}

.empty-state svg {
  color: #cbd5e1;
}

.empty-state p {
  font-size: 16px;
  font-weight: 600;
  color: #475569;
  margin: 0;
}

.empty-state span {
  font-size: 13px;
  color: #94a3b8;
}

.loading-state {
  padding: 16px 24px;
}

.skeleton-row {
  display: flex;
  gap: 24px;
  padding: 14px 0;
  border-bottom: 1px solid #f1f5f9;
}

.skeleton-text {
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@media (max-width: 640px) {
  .create-form {
    flex-direction: column;
  }

  .input-group {
    flex-direction: column;
  }

  .btn-primary {
    width: 100%;
    justify-content: center;
  }

  th, td {
    padding: 12px 16px;
  }
}
</style>
