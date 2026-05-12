<template>
  <section class="lectures-page">
    <div class="summary-row">
      <article>
        <span>讲义总数</span>
        <strong>{{ lectures.length }}</strong>
      </article>
      <article>
        <span>章节总数</span>
        <strong>{{ totalChapters }}</strong>
      </article>
      <router-link to="/admin/upload" class="upload-link">上传讲义</router-link>
    </div>

    <div v-if="error" class="alert">{{ error }}</div>

    <section v-if="unclassifiedLectures.length > 0" class="organize-panel">
      <div>
        <strong>{{ unclassifiedLectures.length }} 份讲义未分类</strong>
        <span>先归类，学生端筛选会更清楚。</span>
      </div>
      <router-link v-if="categories.length === 0" to="/admin/categories">先创建分类</router-link>
      <div v-else class="organize-list">
        <label v-for="lecture in unclassifiedLectures" :key="lecture.id">
          <span>{{ lecture.title }}</span>
          <select :value="lecture.category_id || ''" @change="assignCategory(lecture, $event.target.value)">
            <option value="">选择分类</option>
            <option v-for="category in categories" :key="category.id" :value="category.id">
              {{ category.name }}
            </option>
          </select>
        </label>
      </div>
    </section>

    <section class="filter-panel">
      <input v-model="filters.search" placeholder="搜索标题或 URL 标识" />
      <select v-model="filters.category">
        <option value="all">全部分类</option>
        <option value="uncategorized">未分类</option>
        <option v-for="category in categories" :key="category.id" :value="String(category.id)">
          {{ category.name }}
        </option>
      </select>
      <input v-model="filters.from" type="date" />
      <input v-model="filters.to" type="date" />
      <button type="button" @click="resetFilters">重置</button>
    </section>

    <section class="table-panel">
      <div v-if="loading" class="empty">正在加载讲义...</div>
      <div v-else-if="lectures.length === 0" class="empty">
        <p>暂无讲义</p>
        <router-link to="/admin/upload" class="upload-inline">上传第一个讲义</router-link>
      </div>
      <div v-else-if="filteredLectures.length === 0" class="empty">没有匹配的讲义</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>标题</th>
              <th>分类</th>
              <th>章节数</th>
              <th>公开</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="lecture in filteredLectures" :key="lecture.id">
              <td class="title-cell">
                <strong>{{ lecture.title }}</strong>
                <span>{{ lecture.slug }}</span>
              </td>
              <td><span class="tag">{{ lecture.category_name || '未分类' }}</span></td>
              <td>{{ lecture.chapters?.length || 0 }}</td>
              <td>
                <label class="toggle-label">
                  <input type="checkbox" :checked="lecture.is_public === 1" @change="togglePublic(lecture, $event)" />
                  <span>{{ lecture.is_public === 1 ? '公开' : '隐藏' }}</span>
                </label>
              </td>
              <td>{{ formatDate(lecture.created_at) }}</td>
              <td>
                <div class="actions">
                  <router-link :to="`/lecture/${lecture.slug}`">查看</router-link>
                  <button type="button" class="danger" @click="deleteLecture(lecture)">删除</button>
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
import { computed, onMounted, reactive, ref } from 'vue'
import axios from 'axios'

const lectures = ref([])
const categories = ref([])
const loading = ref(false)
const error = ref('')
const filters = reactive({
  search: '',
  category: 'all',
  from: '',
  to: ''
})

const totalChapters = computed(() => {
  return lectures.value.reduce((sum, lecture) => sum + (lecture.chapters?.length || 0), 0)
})

const unclassifiedLectures = computed(() => {
  return lectures.value.filter(lecture => !lecture.category_name)
})

const filteredLectures = computed(() => {
  const search = filters.search.trim().toLowerCase()
  const fromTime = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null
  const toTime = filters.to ? new Date(`${filters.to}T23:59:59`).getTime() : null

  return lectures.value.filter(lecture => {
    const created = new Date(String(lecture.created_at).replace(' ', 'T')).getTime()
    const matchesSearch = !search
      || lecture.title.toLowerCase().includes(search)
      || lecture.slug.toLowerCase().includes(search)
    const matchesCategory = filters.category === 'all'
      || (filters.category === 'uncategorized' && !lecture.category_name)
      || String(lecture.category_id) === filters.category
    const matchesFrom = !fromTime || created >= fromTime
    const matchesTo = !toTime || created <= toTime
    return matchesSearch && matchesCategory && matchesFrom && matchesTo
  })
})

onMounted(fetchLectures)

async function fetchLectures() {
  loading.value = true
  error.value = ''
  try {
    const [lectureRes, categoryRes] = await Promise.all([
      axios.get('/api/lectures'),
      axios.get('/api/categories')
    ])
    lectures.value = lectureRes.data
    categories.value = categoryRes.data
  } catch (e) {
    error.value = e.response?.data?.error || '讲义加载失败'
  } finally {
    loading.value = false
  }
}

async function deleteLecture(lecture) {
  if (!confirm(`确定删除讲义「${lecture.title}」吗？`)) return

  try {
    const token = localStorage.getItem('adminToken')
    await axios.delete(`/api/lectures/${lecture.id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    lectures.value = lectures.value.filter(item => item.id !== lecture.id)
  } catch (e) {
    error.value = e.response?.data?.error || '删除失败'
  }
}

async function assignCategory(lecture, categoryId) {
  if (!categoryId) return
  error.value = ''
  try {
    const token = localStorage.getItem('adminToken')
    const res = await axios.put(`/api/lectures/${lecture.id}/category`, { categoryId: Number(categoryId) }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    lectures.value = lectures.value.map(item => item.id === lecture.id ? res.data : item)
  } catch (e) {
    error.value = e.response?.data?.error || '分类更新失败'
  }
}

async function togglePublic(lecture, event) {
  error.value = ''
  const isPublic = event.target.checked ? 1 : 0
  try {
    const token = localStorage.getItem('adminToken')
    const res = await axios.put(`/api/lectures/${lecture.id}/public`, { is_public: isPublic }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    lectures.value = lectures.value.map(item => item.id === lecture.id ? res.data : item)
  } catch (e) {
    error.value = e.response?.data?.error || '更新失败'
    event.target.checked = !event.target.checked
  }
}

function resetFilters() {
  filters.search = ''
  filters.category = 'all'
  filters.from = ''
  filters.to = ''
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(String(value).replace(' ', 'T')).toLocaleString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.lectures-page {
  display: grid;
  gap: 18px;
}

.summary-row {
  display: grid;
  grid-template-columns: 180px 180px auto;
  gap: 14px;
  align-items: stretch;
}

.summary-row article,
.upload-link,
.table-panel {
  border: 1px solid #e6eaf0;
  border-radius: 8px;
  background: #ffffff;
}

.summary-row article {
  display: grid;
  gap: 10px;
  padding: 18px;
}

.summary-row span {
  color: #6d7788;
  font-size: 13px;
  font-weight: 800;
}

.summary-row strong {
  color: #172033;
  font-size: 30px;
  line-height: 1;
}

.upload-link,
.upload-inline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 18px;
  background: #2f6fed;
  color: white;
  font-weight: 800;
  text-decoration: none;
}

.upload-inline {
  margin-top: 12px;
  border-radius: 8px;
}

.alert {
  padding: 12px 14px;
  border: 1px solid #ffd4d0;
  border-radius: 8px;
  background: #fff4f2;
  color: #b42318;
  font-weight: 650;
}

.organize-panel,
.filter-panel {
  border: 1px solid #e6eaf0;
  border-radius: 8px;
  background: #ffffff;
}

.organize-panel {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.organize-panel strong,
.organize-panel span {
  display: block;
}

.organize-panel strong {
  color: #172033;
}

.organize-panel span {
  margin-top: 3px;
  color: #6d7788;
  font-size: 13px;
}

.organize-panel a {
  justify-self: start;
  color: #1f5fce;
  font-weight: 800;
  text-decoration: none;
}

.organize-list {
  display: grid;
  gap: 10px;
}

.organize-list label {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 10px;
  align-items: center;
}

.organize-list label span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-panel {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 180px 150px 150px auto;
  gap: 10px;
  padding: 14px;
}

.filter-panel input,
.filter-panel select,
.filter-panel button,
.organize-list select {
  min-height: 40px;
  padding: 8px 11px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
  color: #172033;
  font: inherit;
  font-size: 14px;
}

.filter-panel button {
  color: #4d596d;
  font-weight: 750;
  cursor: pointer;
}

.table-panel {
  overflow: hidden;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 800px;
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

.title-cell {
  display: grid;
  gap: 3px;
}

.title-cell strong {
  color: #172033;
}

.title-cell span {
  color: #7a8494;
  font-size: 12px;
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

.actions {
  display: flex;
  gap: 8px;
}

.actions a,
.actions button {
  min-height: 36px;
  padding: 7px 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
  color: #4d596d;
  font: inherit;
  font-size: 14px;
  font-weight: 750;
  text-decoration: none;
  cursor: pointer;
}

.actions .danger {
  color: #b42318;
}

.empty {
  padding: 34px;
  color: #7a8494;
  text-align: center;
}

.toggle-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #4d596d;
}

.toggle-label input {
  width: 16px;
  height: 16px;
  accent-color: #2f6fed;
  cursor: pointer;
}

@media (max-width: 720px) {
  .summary-row {
    grid-template-columns: 1fr;
  }

  .filter-panel,
  .organize-list label {
    grid-template-columns: 1fr;
  }
}
</style>
