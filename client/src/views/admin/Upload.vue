<template>
  <section class="upload-page">
      <div class="upload-grid">
        <!-- Upload Form -->
        <div class="upload-form card">
          <h2 class="form-title">讲义信息</h2>
          
          <div class="form-group">
            <label class="form-label">讲义标题</label>
            <input v-model="title" placeholder="例如：AI 学习资料" required class="input" />
          </div>

          <div class="form-group">
            <label class="form-label">URL 标识</label>
            <input v-model="slug" placeholder="例如：ai_learning" required class="input" />
            <p class="form-hint">访问路径: <code>/lecture/{{ slug || '...' }}</code></p>
            <p class="form-hint">仅支持英文、数字、下划线和短横线，避免空格和中文路径。</p>
          </div>

          <div class="form-group">
            <label class="form-label">分类</label>
            <div class="category-select-row">
              <select v-model="categoryId" required class="input category-select">
                <option :value="null">选择分类</option>
                <option v-for="cat in categories" :key="cat.id" :value="Number(cat.id)">
                  {{ cat.name }}
                </option>
              </select>
              <button type="button" class="btn btn-ghost btn-sm" @click="showNewCategory = true" title="新建分类">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            </div>
            <div v-if="showNewCategory" class="inline-form">
              <p v-if="categories.length === 0" class="form-hint" style="margin-bottom: var(--space-2); color: var(--color-primary)">
                还没有分类，请先创建一个
              </p>
              <input v-model="newCategoryName" placeholder="输入分类名称" class="input" @keyup.enter="createCategory" />
              <button type="button" class="btn btn-primary btn-sm" @click="createCategory">添加</button>
              <button type="button" class="btn btn-ghost btn-sm" @click="showNewCategory = false; newCategoryName = ''">取消</button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">ZIP 文件</label>
            <div class="file-upload">
              <input type="file" @change="handleFile" accept=".zip" required class="file-input" />
              <div class="file-upload-label">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
                <span v-if="file">{{ file.name }}</span>
                <span v-else>点击选择 ZIP 文件</span>
              </div>
            </div>
          </div>

          <section v-if="precheckLoading || zipCheck" class="precheck-panel">
            <div class="precheck-header">
              <strong>ZIP 结构预检</strong>
              <span v-if="precheckLoading">检查中...</span>
              <span v-else-if="zipCheck">{{ zipCheck.mode === 'multi-chapter' ? '多章节' : '单页讲义' }}</span>
            </div>
            <template v-if="zipCheck">
              <div class="precheck-stats">
                <span>{{ zipCheck.entryCount }} 个条目</span>
                <span>{{ zipCheck.htmlCount }} 个 HTML</span>
                <span>{{ zipCheck.chapters.length || 1 }} 个章节候选</span>
              </div>
              <div v-if="zipCheck.missingIndex.length > 0" class="precheck-warning">
                <strong>缺少 index.html</strong>
                <span>{{ zipCheck.missingIndex.map(item => item.name).join('、') }}</span>
              </div>
              <ul v-if="zipCheck.warnings.length > 0" class="precheck-list">
                <li v-for="item in zipCheck.warnings" :key="item">{{ item }}</li>
              </ul>
              <p v-else class="precheck-ok">结构看起来很好，可以上传。</p>
            </template>
          </section>

          <div v-if="error" class="error-alert">
            <span>⚠️</span>
            <span>{{ error }}</span>
          </div>
          
          <div v-if="success" class="success-alert">
            <span>✅</span>
            <span>{{ success }}</span>
          </div>

          <button @click="upload" class="btn btn-primary" :disabled="uploading || precheckLoading">
            <span v-if="uploading">正在上传...</span>
            <span v-else>上传讲义</span>
          </button>
        </div>

        <!-- Help Section -->
        <div class="help-section card">
          <h2 class="form-title">ZIP 结构要求</h2>
          
          <ul class="help-list">
            <li>URL 标识作为讲义一级路径</li>
            <li>内部目录作为章节路径，单个 HTML 也可直接放在根目录</li>
            <li>每个章节目录必须包含 index.html</li>
            <li>支持 images 等资源文件夹</li>
          </ul>
          
          <div class="code-block">
            <pre>
ai_learning.zip
├── day1_intro/
│   ├── index.html
│   └── images/
├── day2_basics/
│   ├── index.html
└── day3_advanced/
    └── index.html
            </pre>
          </div>
        </div>
      </div>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const title = ref('')
const slug = ref('')
const categoryId = ref(null)
const file = ref(null)
const categories = ref([])
const uploading = ref(false)
const precheckLoading = ref(false)
const error = ref('')
const success = ref('')
const zipCheck = ref(null)

onMounted(async () => {
  const res = await axios.get('/api/categories')
  categories.value = res.data
  if (categories.value.length === 0) {
    showNewCategory.value = true
  }
})

async function handleFile(e) {
  file.value = e.target.files[0]
  error.value = ''
  success.value = ''
  zipCheck.value = null

  if (!file.value) return
  if (!file.value.name.toLowerCase().endsWith('.zip')) {
    error.value = '仅支持 ZIP 文件'
    return
  }

  precheckLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file.value)
    const token = localStorage.getItem('adminToken')
    const res = await axios.post('/api/lectures/precheck', formData, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    zipCheck.value = res.data
  } catch (e) {
    error.value = e.response?.data?.error || 'ZIP 结构预检失败'
  } finally {
    precheckLoading.value = false
  }
}

const showNewCategory = ref(false)
const newCategoryName = ref('')

async function createCategory() {
  if (!newCategoryName.value.trim()) return
  try {
    const token = localStorage.getItem('adminToken')
    const res = await axios.post('/api/categories', { name: newCategoryName.value.trim() }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    categories.value.push(res.data)
    categoryId.value = Number(res.data.id)
    newCategoryName.value = ''
    showNewCategory.value = false
  } catch (e) {
    error.value = e.response?.data?.error || '创建分类失败'
  }
}

async function upload() {
  if (!file.value) {
    error.value = '请选择 ZIP 文件'
    return
  }
  if (!title.value) {
    error.value = '请填写讲义标题'
    return
  }
  slug.value = slug.value.trim()
  title.value = title.value.trim()

  if (!slug.value) {
    error.value = '请填写 URL 标识'
    return
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(slug.value)) {
    error.value = 'URL 标识只能包含英文、数字、下划线和短横线，长度 2-81 位'
    return
  }
  if (!categoryId.value) {
    error.value = '请选择分类'
    return
  }

  uploading.value = true
  error.value = ''

  const formData = new FormData()
  formData.append('file', file.value)
  formData.append('title', title.value)
  formData.append('slug', slug.value)
  formData.append('categoryId', categoryId.value)

  try {
    const token = localStorage.getItem('adminToken')
    await axios.post('/api/lectures', formData, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    success.value = '上传成功！即将跳转...'
    setTimeout(() => router.push('/admin/lectures'), 1500)
  } catch (e) {
    const status = e.response?.status
    const msg = e.response?.data?.error
    if (status === 401) {
      error.value = '请先登录管理员账号'
      setTimeout(() => router.push('/admin'), 1500)
    } else if (msg?.includes('exists')) {
      error.value = '该 URL 标识已存在，请换个名字'
    } else if (msg?.includes('zip')) {
      error.value = 'ZIP 文件结构不符合要求，请检查目录结构'
    } else {
      error.value = msg || '上传失败，请检查文件和网络连接'
    }
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.upload-page {
  display: grid;
  gap: var(--space-8);
}

.page-header {
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
  align-items: center;
  gap: var(--space-4);
  padding-top: var(--space-4);
  padding-bottom: var(--space-4);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-ink-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out-expo);
  white-space: nowrap;
}

.back-link:hover {
  background: var(--color-bg);
  color: var(--color-ink);
}

.page-title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-ink);
}

.main-content {
  padding-top: var(--space-8);
  padding-bottom: var(--space-16);
}

.upload-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-8);
}

.upload-form, .help-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.form-title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-ink);
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

.form-hint {
  font-size: var(--text-xs);
  color: var(--color-ink-tertiary);
  margin-top: var(--space-1);
}

.form-hint code {
  font-family: var(--font-mono);
  color: var(--color-primary);
}

.category-select-row {
  display: flex;
  gap: var(--space-2);
}

.category-select {
  flex: 1;
}

.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding: var(--space-3);
  background: var(--color-bg);
  border-radius: var(--radius-md);
  border: 1px dashed var(--color-border);
}

.inline-form .input {
  flex: 1;
  min-width: 180px;
}

.inline-form .form-hint {
  flex: 1 0 100%;
  margin: 0;
}

.inline-form .btn {
  flex-shrink: 0;
}

.file-upload {
  position: relative;
}

.file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.file-upload-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-8);
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg);
  color: var(--color-ink-tertiary);
  text-align: center;
  transition: all var(--duration-fast) var(--ease-out-expo);
}

.file-upload:hover .file-upload-label {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-subtle);
}

.success-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: oklch(0.95 0.05 145);
  border: 1px solid oklch(0.85 0.05 145);
  color: var(--color-success);
  font-size: var(--text-sm);
}

.precheck-panel {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
}

.precheck-header,
.precheck-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  justify-content: space-between;
}

.precheck-header strong {
  color: var(--color-ink);
}

.precheck-header span,
.precheck-stats span,
.precheck-list,
.precheck-ok {
  color: var(--color-ink-secondary);
  font-size: var(--text-xs);
}

.precheck-stats span {
  padding: var(--space-1) var(--space-2);
  border-radius: 999px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  font-weight: 700;
}

.precheck-warning {
  display: grid;
  gap: 3px;
  padding: var(--space-3);
  border: 1px solid #ffd4d0;
  border-radius: 8px;
  background: #fff4f2;
  color: #b42318;
  font-size: var(--text-xs);
}

.precheck-list {
  display: grid;
  gap: var(--space-1);
  padding-left: var(--space-4);
}

.precheck-ok {
  color: var(--color-success);
  font-weight: 700;
}

.help-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.help-list li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-ink-secondary);
}

.help-list li::before {
  content: '•';
  color: var(--color-primary);
  font-weight: bold;
}

.code-block {
  background: var(--color-bg);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  overflow-x: auto;
}

.code-block pre {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-ink-secondary);
  line-height: 1.8;
  margin: 0;
}

@media (max-width: 768px) {
  .upload-grid {
    grid-template-columns: 1fr;
  }
}
</style>
