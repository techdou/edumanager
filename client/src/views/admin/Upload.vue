<template>
  <div class="upload-page">
    <header class="page-header">
      <div class="container header-content">
        <router-link to="/admin/dashboard" class="back-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span>返回列表</span>
        </router-link>
        <h1 class="page-title">上传讲义</h1>
      </div>
    </header>

    <main class="container main-content">
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
          </div>

          <div class="form-group">
            <label class="form-label">分类</label>
            <select v-model="categoryId" required class="input">
              <option value="">选择分类</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
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

          <div v-if="error" class="error-alert">
            <span>⚠️</span>
            <span>{{ error }}</span>
          </div>
          
          <div v-if="success" class="success-alert">
            <span>✅</span>
            <span>{{ success }}</span>
          </div>

          <button @click="upload" class="btn btn-primary" :disabled="uploading">
            <span v-if="uploading">正在上传...</span>
            <span v-else>上传讲义</span>
          </button>
        </div>

        <!-- Help Section -->
        <div class="help-section card">
          <h2 class="form-title">ZIP 结构要求</h2>
          
          <ul class="help-list">
            <li>ZIP 文件名作为一级路径</li>
            <li>内部目录作为章节路径</li>
            <li>每个目录必须包含 index.html</li>
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
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const title = ref('')
const slug = ref('')
const categoryId = ref('')
const file = ref(null)
const categories = ref([])
const uploading = ref(false)
const error = ref('')
const success = ref('')

onMounted(async () => {
  const res = await axios.get('/api/categories')
  categories.value = res.data
})

function handleFile(e) {
  file.value = e.target.files[0]
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
  if (!slug.value) {
    error.value = '请填写 URL 标识'
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
    await axios.post('/api/lectures', formData)
    success.value = '上传成功！即将跳转...'
    setTimeout(() => router.push('/admin/dashboard'), 1500)
  } catch (e) {
    const msg = e.response?.data?.error
    if (msg?.includes('exists')) {
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