<template>
  <section class="groups-page">
    <div class="toolbar">
      <span class="toolbar-title">班级管理</span>
      <button class="btn-primary" type="button" @click="openCreate">创建班级</button>
    </div>

    <div v-if="error" class="alert">{{ error }}</div>

    <section class="table-panel">
      <div v-if="loading" class="empty">正在加载...</div>
      <div v-else-if="groups.length === 0" class="empty">暂无班级</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>班级名称</th>
              <th>描述</th>
              <th>学生数</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in groups" :key="group.id">
              <td class="primary-cell">{{ group.name }}</td>
              <td>{{ group.description || '-' }}</td>
              <td>{{ group.student_count }}</td>
              <td>{{ formatDate(group.created_at) }}</td>
              <td>
                <div class="actions">
                  <button type="button" @click="openDetail(group)">管理</button>
                  <button type="button" @click="openEdit(group)">编辑</button>
                  <button type="button" class="danger" @click="deleteGroup(group)">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Create / Edit Modal -->
    <div v-if="showModal" class="modal-backdrop" @click.self="closeModal">
      <form class="modal" @submit.prevent="saveGroup">
        <div class="modal-header">
          <h2>{{ modalMode === 'create' ? '创建班级' : '编辑班级' }}</h2>
          <button type="button" class="icon-button" @click="closeModal">×</button>
        </div>
        <label>
          <span>班级名称</span>
          <input v-model="form.name" class="admin-input" required />
        </label>
        <label>
          <span>描述</span>
          <input v-model="form.description" class="admin-input" placeholder="可选" />
        </label>
        <div v-if="modalError" class="alert">{{ modalError }}</div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" @click="closeModal">取消</button>
          <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? '保存中...' : '保存' }}</button>
        </div>
      </form>
    </div>

    <!-- Detail Modal (manage students & categories) -->
    <div v-if="showDetail" class="modal-backdrop" @click.self="closeDetail">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h2>{{ detailGroup.name }} - 班级管理</h2>
          <button type="button" class="icon-button" @click="closeDetail">×</button>
        </div>

        <div class="detail-section">
          <h3>学生列表</h3>
          <div class="add-row">
            <select v-model="addStudentId" class="admin-select">
              <option value="">选择学生添加</option>
              <option v-for="s in availableStudents" :key="s.id" :value="s.id">{{ s.real_name || s.username }}{{ s.real_name ? ` (${s.username})` : '' }}</option>
            </select>
            <button type="button" class="btn-primary" @click="addStudent" :disabled="!addStudentId">添加</button>
          </div>
          <div v-if="detailStudents.length === 0" class="empty-detail">暂无学生</div>
          <div v-else class="detail-list">
            <div v-for="s in detailStudents" :key="s.id" class="detail-item">
              <span>{{ s.real_name || s.username }}{{ s.real_name ? ` (${s.username})` : '' }}</span>
              <button type="button" class="btn-remove" @click="removeStudent(s.id)">移除</button>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3>可访问分类</h3>
          <div class="category-checks">
            <label v-for="cat in allCategories" :key="cat.id" class="category-check">
              <input type="checkbox" :value="cat.id" v-model="selectedCategories" />
              <span>{{ cat.name }}</span>
            </label>
          </div>
          <div v-if="allCategories.length === 0" class="empty-detail">暂无分类，请先在分类管理中创建</div>
          <button type="button" class="btn-primary" style="margin-top: 12px;" @click="saveCategories">保存分类权限</button>
        </div>

        <div v-if="detailError" class="alert" style="margin-top: 12px;">{{ detailError }}</div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue'
import adminApi from '../../lib/adminApi'
import axios from 'axios'

const groups = ref([])
const loading = ref(false)
const error = ref('')
const saving = ref(false)
const modalError = ref('')
const showModal = ref(false)
const modalMode = ref('create')
const form = ref({ id: null, name: '', description: '' })

const showDetail = ref(false)
const detailGroup = ref({})
const detailStudents = ref([])
const allCategories = ref([])
const allStudents = ref([])
const selectedCategories = ref([])
const addStudentId = ref('')
const detailError = ref('')

onMounted(fetchGroups)

async function fetchGroups() {
  loading.value = true
  error.value = ''
  try {
    const res = await adminApi.get('/groups')
    groups.value = res.data
  } catch (e) {
    error.value = e.response?.data?.error || '加载失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.value = { id: null, name: '', description: '' }
  modalMode.value = 'create'
  showModal.value = true
  modalError.value = ''
}

function openEdit(group) {
  form.value = { id: group.id, name: group.name, description: group.description || '' }
  modalMode.value = 'edit'
  showModal.value = true
  modalError.value = ''
}

function closeModal() { showModal.value = false }

async function saveGroup() {
  saving.value = true
  modalError.value = ''
  try {
    const payload = { name: form.value.name, description: form.value.description }
    if (modalMode.value === 'create') {
      await adminApi.post('/groups', payload)
    } else {
      await adminApi.put(`/groups/${form.value.id}`, payload)
    }
    closeModal()
    fetchGroups()
  } catch (e) {
    modalError.value = e.response?.data?.error || '保存失败'
  } finally {
    saving.value = false
  }
}

async function deleteGroup(group) {
  if (!confirm(`确定删除班级「${group.name}」吗？`)) return
  try {
    await adminApi.delete(`/groups/${group.id}`)
    fetchGroups()
  } catch (e) {
    error.value = e.response?.data?.error || '删除失败'
  }
}

async function openDetail(group) {
  detailGroup.value = group
  detailError.value = ''
  addStudentId.value = ''
  showDetail.value = true
  try {
    const [detailRes, catRes, studentsRes] = await Promise.all([
      adminApi.get(`/groups/${group.id}`),
      adminApi.get('/categories'),
      adminApi.get('/users', { params: { pageSize: 100 } })
    ])
    detailStudents.value = detailRes.data.students || []
    selectedCategories.value = (detailRes.data.categories || []).map(c => c.id)
    allCategories.value = catRes.data
    allStudents.value = (studentsRes.data.items || []).filter(s => s.role !== 'admin')
  } catch (e) {
    detailError.value = e.response?.data?.error || '加载失败'
  }
}

function closeDetail() { showDetail.value = false }

const availableStudents = computed(() => {
  const ids = new Set(detailStudents.value.map(s => s.id))
  return allStudents.value.filter(s => !ids.has(s.id))
})

async function addStudent() {
  if (!addStudentId.value) return
  detailError.value = ''
  try {
    await adminApi.post(`/groups/${detailGroup.value.id}/students`, { studentId: Number(addStudentId.value) })
    const student = allStudents.value.find(s => s.id === Number(addStudentId.value))
    if (student) detailStudents.value.push({ id: student.id, username: student.username, real_name: student.real_name })
    addStudentId.value = ''
  } catch (e) {
    detailError.value = e.response?.data?.error || '添加失败'
  }
}

async function removeStudent(studentId) {
  detailError.value = ''
  try {
    await adminApi.delete(`/groups/${detailGroup.value.id}/students/${studentId}`)
    detailStudents.value = detailStudents.value.filter(s => s.id !== studentId)
  } catch (e) {
    detailError.value = e.response?.data?.error || '移除失败'
  }
}

async function saveCategories() {
  detailError.value = ''
  try {
    await adminApi.post(`/groups/${detailGroup.value.id}/categories`, { categoryIds: selectedCategories.value })
    detailError.value = ''
    fetchGroups()
  } catch (e) {
    detailError.value = e.response?.data?.error || '保存失败'
  }
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(String(value).replace(' ', 'T')).toLocaleString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.groups-page { display: grid; gap: 18px; }

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar-title {
  font-family: 'Sora', system-ui, sans-serif;
  font-size: 20px;
  font-weight: 600;
  color: #172033;
}

.admin-input, .admin-select {
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

.admin-input:focus, .admin-select:focus {
  border-color: #2f6fed;
  box-shadow: 0 0 0 3px #eaf1ff;
  outline: none;
}

.btn-primary, .btn-secondary, .actions button {
  min-height: 38px;
  padding: 8px 13px;
  border: 1px solid transparent;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  font-weight: 750;
  cursor: pointer;
}

.btn-primary { background: #2f6fed; color: white; }
.btn-primary:disabled { cursor: not-allowed; opacity: 0.55; }
.btn-secondary, .actions button { background: #ffffff; border-color: #d8dee8; color: #4d596d; }
.actions .danger { color: #b42318; }

.alert {
  padding: 12px 14px;
  border: 1px solid #ffd4d0;
  border-radius: 8px;
  background: #fff4f2;
  color: #b42318;
  font-weight: 650;
}

.table-panel { overflow: hidden; border: 1px solid #e6eaf0; border-radius: 8px; background: #ffffff; }
.table-wrap { overflow-x: auto; }
table { width: 100%; min-width: 800px; border-collapse: collapse; }
th, td { padding: 14px 16px; border-bottom: 1px solid #eef1f5; color: #4d596d; font-size: 14px; text-align: left; white-space: nowrap; }
th { background: #f8fafc; color: #6d7788; font-size: 12px; font-weight: 800; }
tbody tr:last-child td { border-bottom: 0; }
.primary-cell { color: #172033; font-weight: 800; }
.actions { display: flex; gap: 8px; }
.empty { padding: 34px; color: #7a8494; text-align: center; }

.modal-backdrop {
  position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 18px;
  background: rgba(15, 23, 42, 0.42);
}
.modal {
  width: min(520px, 100%); display: grid; gap: 16px; padding: 22px; border-radius: 8px;
  background: #ffffff; box-shadow: 0 24px 70px rgba(15, 23, 42, 0.2);
}
.modal-lg { width: min(680px, 100%); max-height: 90vh; overflow-y: auto; }
.modal-header { display: flex; justify-content: space-between; align-items: center; }
.modal h2 { color: #172033; font-size: 20px; }
.icon-button {
  width: 34px; height: 34px; border: 1px solid #d8dee8; border-radius: 8px;
  background: white; color: #4d596d; font-size: 22px; line-height: 1; cursor: pointer;
}
.modal label { display: grid; gap: 7px; color: #4d596d; font-size: 13px; font-weight: 800; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }

.detail-section { margin-bottom: 20px; }
.detail-section h3 { color: #172033; font-size: 16px; font-weight: 700; margin-bottom: 12px; }
.add-row { display: flex; gap: 10px; margin-bottom: 12px; }
.add-row .admin-select { flex: 1; }
.detail-list { display: grid; gap: 8px; }
.detail-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; border: 1px solid #e6eaf0; border-radius: 8px; background: #ffffff;
}
.detail-item span { color: #172033; font-size: 14px; font-weight: 650; }
.btn-remove {
  padding: 4px 10px; border: 1px solid #d8dee8; border-radius: 6px;
  background: white; color: #b42318; font-size: 12px; font-weight: 700; cursor: pointer;
}
.category-checks { display: flex; flex-wrap: wrap; gap: 12px; }
.category-check {
  display: flex; align-items: center; gap: 6px; font-size: 14px; color: #172033; cursor: pointer;
}
.empty-detail { color: #7a8494; font-size: 14px; padding: 8px 0; }

@media (max-width: 640px) {
  .toolbar { flex-direction: column; gap: 12px; align-items: stretch; }
  .add-row { flex-direction: column; }
  .category-checks { flex-direction: column; }
}
</style>
