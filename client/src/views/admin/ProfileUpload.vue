<template>
  <div class="profile-upload-page">
    <header class="page-header">
      <div class="container header-content">
        <router-link to="/admin/dashboard" class="back-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span>返回</span>
        </router-link>
        <h1 class="page-title">编辑个人主页</h1>
      </div>
    </header>

    <main class="container main-content">
      <div class="profile-grid">
        <!-- Upload Form -->
        <div class="card upload-form">
          <h2 class="form-title">上传 HTML 压缩包</h2>
          <p class="form-desc">
            上传包含 <code>index.html</code> 及相关资源的 ZIP 文件，替换首页展示内容。
          </p>

          <div class="file-upload" @dragover.prevent @drop.prevent="handleDrop">
            <input type="file" @change="handleFile" accept=".zip" class="file-input" />
            <div class="file-upload-label" :class="{ dragging: isDragging }">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              <span v-if="file" class="file-name">{{ file.name }}</span>
              <span v-else>点击或拖拽 ZIP 文件到此处</span>
              <span class="file-hint">支持 .zip，最大 50MB</span>
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

          <div class="btn-row">
            <button @click="upload" class="btn btn-primary" :disabled="uploading || !file">
              {{ uploading ? '上传中...' : '上传并替换' }}
            </button>
            <button v-if="hasProfile" @click="removeProfile" class="btn btn-danger" :disabled="uploading">
              清除主页
            </button>
          </div>
        </div>

        <!-- Help -->
        <div class="card help-section">
          <h2 class="form-title">ZIP 结构要求</h2>
          <ul class="help-list">
            <li>根目录必须包含 <code>index.html</code></li>
            <li>支持 CSS、JS、图片等资源文件</li>
            <li>支持子目录（如 images/、css/）</li>
            <li>HTML 中使用相对路径引用资源</li>
          </ul>
          <div class="code-block">
            <pre>
my_profile.zip
├── index.html
├── css/
│   └── style.css
├── images/
│   ├── avatar.jpg
│   └── bg.png
└── js/
    └── main.js
            </pre>
          </div>

          <div v-if="hasProfile" class="preview-section">
            <h3 class="form-title">当前状态</h3>
            <p class="status-ok">✅ 已上传个人主页</p>
            <a href="/" target="_blank" class="btn btn-secondary" style="margin-top: var(--space-3)">
              预览首页 →
            </a>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const file = ref(null)
const uploading = ref(false)
const error = ref('')
const success = ref('')
const hasProfile = ref(false)
const isDragging = ref(false)

onMounted(async () => {
  try {
    const res = await axios.get('/api/profile/check')
    hasProfile.value = res.data.exists
  } catch { /* silent */ }
})

function handleFile(e) {
  file.value = e.target.files[0]
  error.value = ''
  success.value = ''
}

function handleDrop(e) {
  isDragging.value = false
  const droppedFile = e.dataTransfer.files[0]
  if (droppedFile && (droppedFile.name.endsWith('.zip') || droppedFile.type === 'application/zip')) {
    file.value = droppedFile
    error.value = ''
    success.value = ''
  } else {
    error.value = '请上传 ZIP 格式文件'
  }
}

async function upload() {
  if (!file.value) return
  uploading.value = true
  error.value = ''
  success.value = ''

  const formData = new FormData()
  formData.append('file', file.value)

  try {
    const token = localStorage.getItem('adminToken')
    await axios.post('/api/profile/upload', formData, {
      headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } : { 'Content-Type': 'multipart/form-data' }
    })
    hasProfile.value = true
    success.value = '个人主页已更新！'
    file.value = null
  } catch (e) {
    const msg = e.response?.data?.error
    if (e.response?.status === 401) {
      error.value = '请先登录管理员账号'
    } else if (msg) {
      error.value = msg
    } else {
      error.value = '上传失败'
    }
  } finally {
    uploading.value = false
  }
}

async function removeProfile() {
  if (!confirm('确定要清除个人主页吗？首页将恢复为默认占位页。')) return
  try {
    const token = localStorage.getItem('adminToken')
    await axios.delete('/api/profile/upload', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    hasProfile.value = false
    success.value = '个人主页已清除'
  } catch (e) {
    error.value = e.response?.data?.error || '操作失败'
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

.back-link:hover { background: var(--color-bg); color: var(--color-ink); }
.page-title { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 600; }

.main-content { padding-top: var(--space-8); padding-bottom: var(--space-16); }

.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-8);
}

.upload-form, .help-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.form-title { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 600; }
.form-desc { font-size: var(--text-sm); color: var(--color-ink-secondary); line-height: 1.6; }
.form-desc code { font-family: var(--font-mono); color: var(--color-primary); background: var(--color-primary-subtle); padding: 2px 6px; border-radius: 4px; font-size: var(--text-xs); }

.file-upload { position: relative; }
.file-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; z-index: 1; }

.file-upload-label {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--space-3); padding: var(--space-10) var(--space-8);
  border: 2px dashed var(--color-border); border-radius: var(--radius-lg);
  background: var(--color-bg); color: var(--color-ink-tertiary);
  text-align: center; transition: all var(--duration-fast) var(--ease-out-expo);
}

.file-upload:hover .file-upload-label,
.file-upload-label.dragging {
  border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-subtle);
}

.file-name { font-weight: 600; color: var(--color-ink); }
.file-hint { font-size: var(--text-xs); color: var(--color-ink-tertiary); }

.btn-row { display: flex; gap: var(--space-3); }
.btn-danger { background: var(--color-error); color: white; }

.success-alert {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3); border-radius: var(--radius-md);
  background: oklch(0.95 0.05 145); border: 1px solid oklch(0.85 0.05 145);
  color: var(--color-success); font-size: var(--text-sm);
}

.help-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.help-list li { font-size: var(--text-sm); color: var(--color-ink-secondary); display: flex; align-items: center; gap: var(--space-2); }
.help-list li::before { content: '•'; color: var(--color-primary); font-weight: bold; }
.help-list code { font-family: var(--font-mono); color: var(--color-primary); font-size: var(--text-xs); }

.code-block { background: var(--color-bg); border-radius: var(--radius-md); padding: var(--space-4); overflow-x: auto; }
.code-block pre { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-ink-secondary); line-height: 1.8; margin: 0; }

.preview-section { padding-top: var(--space-4); border-top: 1px solid var(--color-border); }
.status-ok { font-size: var(--text-sm); color: var(--color-success); }

@media (max-width: 768px) { .profile-grid { grid-template-columns: 1fr; } }
</style>
