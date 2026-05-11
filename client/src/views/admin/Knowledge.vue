<template>
  <section class="knowledge-page">
    <form class="editor-panel" @submit.prevent="saveDoc">
      <div class="form-header">
        <div>
          <h2>{{ editingId ? '编辑知识文档' : '添加飞书知识库' }}</h2>
          <p>保存飞书网页链接，或上传 PDF / Markdown 文件并在首页预览。</p>
        </div>
        <button type="button" class="btn-secondary" @click="resetForm" v-if="editingId">取消编辑</button>
      </div>

      <div v-if="!editingId" class="type-switch">
        <button type="button" :class="{ active: form.mode === 'link' }" @click="form.mode = 'link'">飞书链接</button>
        <button type="button" :class="{ active: form.mode === 'file' }" @click="form.mode = 'file'">上传 PDF / Markdown</button>
      </div>

      <div class="form-grid">
        <label>
          <span>标题</span>
          <input v-model="form.title" required placeholder="例如：AI 工具使用规范" />
        </label>
        <label>
          <span>分类</span>
          <select v-model="form.categoryId">
            <option value="">未分类</option>
            <option v-for="category in categories" :key="category.id" :value="category.id">
              {{ category.name }}
            </option>
          </select>
        </label>
      </div>

      <label>
        <span>{{ form.mode === 'file' ? '文档文件' : '飞书网页链接' }}</span>
        <input
          v-if="form.mode === 'link' || editingId"
          v-model="form.url"
          :required="form.mode === 'link'"
          placeholder="https://xxx.feishu.cn/wiki/..."
        />
        <input
          v-else
          type="file"
          accept=".pdf,.md,.markdown,.mdown,.mkd"
          required
          @change="handleFile"
        />
      </label>

      <label>
        <span>封面图（可选）</span>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          @change="handleCover"
        />
      </label>

      <label>
        <span>知识文档简介</span>
        <textarea
          v-model="form.summary"
          rows="4"
          placeholder="写给学生看的简要说明：这篇文档讲什么、适合谁看、读完能解决什么问题。"
        ></textarea>
      </label>

      <label class="check-row">
        <input v-model="form.isFeatured" type="checkbox" />
        <span>在首页知识库区域展示</span>
      </label>

      <div v-if="error" class="alert">{{ error }}</div>
      <div class="actions">
        <button class="btn-primary" type="submit" :disabled="saving">
          {{ saving ? '保存中...' : editingId ? '保存修改' : '添加文档' }}
        </button>
      </div>
    </form>

    <section class="table-panel">
      <div v-if="loading" class="empty">正在加载知识文档...</div>
      <div v-else-if="docs.length === 0" class="empty">暂无飞书知识库文档</div>
      <div v-else class="doc-list">
        <article v-for="doc in docs" :key="doc.id" class="doc-row">
          <div class="doc-main">
            <div class="doc-head">
              <span class="tag">{{ doc.category_name || '未分类' }}</span>
              <span class="tag type">{{ typeText(doc) }}</span>
              <span v-if="doc.is_featured" class="tag featured">首页展示</span>
            </div>
            <h3>{{ doc.title }}</h3>
            <p>{{ doc.summary || '暂无简介' }}</p>
            <a :href="doc.file_url || doc.url" target="_blank" rel="noopener noreferrer">
              {{ doc.file_name || doc.url }}
            </a>
          </div>
          <div class="row-actions">
            <button type="button" @click="editDoc(doc)">编辑</button>
            <button type="button" class="danger" @click="deleteDoc(doc)">删除</button>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import axios from 'axios'

const docs = ref([])
const categories = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const editingId = ref(null)

const form = reactive({
  title: '',
  url: '',
  summary: '',
  categoryId: '',
  isFeatured: true,
  mode: 'link',
  file: null,
  cover: null
})

onMounted(loadData)

function headers() {
  const token = localStorage.getItem('adminToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const [docRes, categoryRes] = await Promise.all([
      axios.get('/api/knowledge'),
      axios.get('/api/categories')
    ])
    docs.value = docRes.data
    categories.value = categoryRes.data
  } catch (e) {
    error.value = e.response?.data?.error || '知识文档加载失败'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  editingId.value = null
  Object.assign(form, {
    title: '',
    url: '',
    summary: '',
    categoryId: '',
    isFeatured: true,
    mode: 'link',
    file: null,
    cover: null
  })
  error.value = ''
}

function editDoc(doc) {
  editingId.value = doc.id
  Object.assign(form, {
    title: doc.title,
    url: doc.url,
    summary: doc.summary || '',
    categoryId: doc.category_id || '',
    isFeatured: Boolean(doc.is_featured),
    mode: doc.file_type ? 'file' : 'link',
    file: null,
    cover: null
  })
}

function handleFile(event) {
  form.file = event.target.files?.[0] || null
}

function handleCover(event) {
  const file = event.target.files?.[0] || null
  if (file && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    error.value = '封面图仅支持 JPG、PNG、WebP'
    form.cover = null
    event.target.value = ''
    return
  }
  form.cover = file
  error.value = ''
}

function appendDocFields(formData) {
  formData.append('title', form.title)
  formData.append('url', form.url)
  formData.append('summary', form.summary)
  formData.append('categoryId', form.categoryId ? String(form.categoryId) : '')
  formData.append('source', 'feishu')
  formData.append('isFeatured', form.isFeatured ? '1' : '0')
  if (form.cover) formData.append('cover', form.cover)
}

async function saveDoc() {
  saving.value = true
  error.value = ''
  try {
    const formData = new FormData()
    appendDocFields(formData)
    if (!editingId.value && form.mode === 'file') {
      if (!form.file) {
        error.value = '请选择 PDF 或 Markdown 文件'
        return
      }
      formData.append('file', form.file)
      await axios.post('/api/knowledge/upload', formData, { headers: headers() })
    } else if (editingId.value) {
      await axios.put(`/api/knowledge/${editingId.value}`, formData, { headers: headers() })
    } else {
      await axios.post('/api/knowledge', formData, { headers: headers() })
    }
    resetForm()
    await loadData()
  } catch (e) {
    error.value = e.response?.data?.error || '保存失败'
  } finally {
    saving.value = false
  }
}

async function deleteDoc(doc) {
  if (!confirm(`确定删除知识文档「${doc.title}」吗？`)) return
  error.value = ''
  try {
    await axios.delete(`/api/knowledge/${doc.id}`, { headers: headers() })
    docs.value = docs.value.filter(item => item.id !== doc.id)
  } catch (e) {
    error.value = e.response?.data?.error || '删除失败'
  }
}

function typeText(doc) {
  if (doc.file_type === 'pdf') return 'PDF'
  if (doc.file_type === 'markdown') return 'Markdown'
  return '飞书'
}
</script>

<style scoped>
.knowledge-page {
  display: grid;
  gap: 18px;
}

.editor-panel,
.table-panel {
  border: 1px solid #e6eaf0;
  border-radius: 8px;
  background: #ffffff;
}

.editor-panel {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.form-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 14px;
}

.form-header h2 {
  color: #172033;
  font-size: 18px;
}

.form-header p,
.doc-main p,
.empty {
  color: #7a8494;
}

.form-header p {
  margin-top: 4px;
  font-size: 13px;
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 12px;
}

.type-switch {
  display: inline-flex;
  gap: 6px;
  justify-self: start;
  padding: 4px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #f7f9fc;
}

.type-switch button {
  min-height: 34px;
  padding: 7px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #4d596d;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.type-switch button.active {
  background: #ffffff;
  color: #1f5fce;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

label {
  display: grid;
  gap: 7px;
  color: #4d596d;
  font-size: 13px;
  font-weight: 800;
}

input,
select,
textarea {
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

textarea {
  resize: vertical;
}

input:focus,
select:focus,
textarea:focus {
  border-color: #2f6fed;
  box-shadow: 0 0 0 3px #eaf1ff;
  outline: none;
}

.check-row {
  display: flex;
  align-items: center;
  gap: 9px;
}

.check-row input {
  width: 16px;
  min-height: 16px;
}

.btn-primary,
.btn-secondary,
.row-actions button {
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
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-secondary,
.row-actions button {
  background: #ffffff;
  border-color: #d8dee8;
  color: #4d596d;
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.alert {
  padding: 12px 14px;
  border: 1px solid #ffd4d0;
  border-radius: 8px;
  background: #fff4f2;
  color: #b42318;
  font-weight: 650;
}

.doc-list {
  display: grid;
}

.doc-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid #eef1f5;
}

.doc-row:last-child {
  border-bottom: 0;
}

.doc-main {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.doc-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 4px 9px;
  border-radius: 999px;
  background: #edf2f7;
  color: #4d596d;
  font-size: 12px;
  font-weight: 800;
}

.tag.featured {
  background: #eaf1ff;
  color: #1f5fce;
}

.tag.type {
  background: #ecfdf3;
  color: #027a48;
}

.doc-main h3 {
  color: #172033;
  font-size: 17px;
}

.doc-main p {
  font-size: 14px;
}

.doc-main a {
  min-width: 0;
  overflow: hidden;
  color: #1f5fce;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-actions .danger {
  color: #b42318;
}

.empty {
  padding: 34px;
  text-align: center;
}

@media (max-width: 760px) {
  .form-header,
  .doc-row {
    grid-template-columns: 1fr;
  }

  .form-header {
    display: grid;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .row-actions {
    justify-content: flex-start;
  }
}
</style>
