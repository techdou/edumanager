<template>
  <section class="categories-page">
    <form class="create-panel" @submit.prevent="createCategory">
      <input v-model="newName" class="admin-input" placeholder="输入新分类名称" />
      <button class="btn-primary" type="submit" :disabled="saving">
        {{ saving ? '保存中...' : '添加分类' }}
      </button>
    </form>

    <div v-if="error" class="alert">{{ error }}</div>

    <section class="table-panel">
      <div v-if="loading" class="empty">正在加载分类...</div>
      <div v-else-if="categories.length === 0" class="empty">暂无分类</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>分类名称</th>
              <th>讲义数量</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="category in categories" :key="category.id">
              <td class="primary-cell">
                <template v-if="editingId === category.id">
                  <input v-model="editingName" class="admin-input compact" @keyup.enter="saveEdit(category)" />
                </template>
                <template v-else>{{ category.name }}</template>
              </td>
              <td>{{ category.lecture_count || 0 }}</td>
              <td>{{ formatDate(category.created_at) }}</td>
              <td>
                <div class="actions" v-if="editingId === category.id">
                  <button type="button" @click="saveEdit(category)">保存</button>
                  <button type="button" @click="cancelEdit">取消</button>
                </div>
                <div class="actions" v-else>
                  <button type="button" @click="startEdit(category)">编辑</button>
                  <button type="button" class="danger" @click="deleteCategory(category)">删除</button>
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
  gap: 18px;
}

.create-panel {
  display: grid;
  grid-template-columns: minmax(220px, 420px) auto;
  justify-content: start;
  gap: 12px;
  padding: 18px;
  border: 1px solid #e6eaf0;
  border-radius: 8px;
  background: #ffffff;
}

.admin-input {
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

.admin-input.compact {
  min-height: 36px;
  max-width: 320px;
}

.admin-input:focus {
  border-color: #2f6fed;
  box-shadow: 0 0 0 3px #eaf1ff;
  outline: none;
}

.btn-primary,
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

.btn-primary:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

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
  min-width: 720px;
  border-collapse: collapse;
}

th,
td {
  padding: 14px 16px;
  border-bottom: 1px solid #eef1f5;
  color: #4d596d;
  font-size: 14px;
  text-align: left;
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

.actions {
  display: flex;
  gap: 8px;
}

.empty {
  padding: 34px;
  color: #7a8494;
  text-align: center;
}

@media (max-width: 620px) {
  .create-panel {
    grid-template-columns: 1fr;
  }
}
</style>
