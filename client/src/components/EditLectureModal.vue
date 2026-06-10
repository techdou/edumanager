<template>
  <div v-if="visible" class="edit-overlay" @click="handleOverlayClick">
    <div class="edit-modal" @click.stop>
      <div class="edit-header">
        <h2>编辑讲义</h2>
        <button class="close-btn" @click="close">×</button>
      </div>

      <div class="edit-body">
        <!-- 基本信息 -->
        <div class="form-section">
          <h3>基本信息</h3>

          <div class="form-group">
            <label>讲义标题</label>
            <input v-model="form.title" placeholder="输入讲义标题" />
          </div>

          <div class="form-group">
            <label>URL 标识</label>
            <input v-model="form.slug" placeholder="例如：ai_learning" />
            <p class="hint">访问路径: /lecture/{{ form.slug || '...' }}</p>
          </div>

          <div class="form-group">
            <label>分类</label>
            <select v-model="form.categoryId">
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>页面布局</label>
            <div class="layout-options">
              <label :class="{ active: form.layoutMode === 'system' }">
                <input type="radio" v-model="form.layoutMode" value="system" />
                <span>系统默认</span>
                <small>保留平台顶部、目录等默认布局</small>
              </label>
              <label :class="{ active: form.layoutMode === 'native' }">
                <input type="radio" v-model="form.layoutMode" value="native" />
                <span>HTML 自带</span>
                <small>适合 HTML 已自带 CSS 和完整布局的讲义</small>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.isPublic" />
              <span>在首页公开显示</span>
            </label>
          </div>

          <div class="form-group">
            <label>封面图</label>
            <div class="cover-preview" v-if="lecture?.cover_url">
              <img :src="lecture.cover_url" alt="封面" />
            </div>
            <div class="file-upload">
              <input type="file" @change="handleCover" accept=".jpg,.jpeg,.png,.webp" />
              <span>{{ coverFile ? coverFile.name : '点击选择新封面（可选）' }}</span>
            </div>
          </div>
        </div>

        <!-- 章节管理 -->
        <div class="form-section">
          <h3>章节管理（拖拽排序）</h3>
          <div class="chapters-list" ref="chaptersList">
            <div
              v-for="(chapter, index) in form.chapters"
              :key="chapter.id"
              class="chapter-item"
              draggable="true"
              @dragstart="handleDragStart($event, index)"
              @dragover.prevent
              @drop="handleDrop($event, index)"
            >
              <span class="drag-handle">⋮⋮</span>
              <span class="chapter-index">{{ index + 1 }}</span>
              <input v-model="chapter.title" placeholder="章节标题" />
              <span class="chapter-slug">{{ chapter.slug }}</span>
            </div>
          </div>
          <p class="hint">拖拽 ⋮⋮ 可调整章节顺序，直接修改输入框可重命名</p>
        </div>

        <div v-if="error" class="error-alert">{{ error }}</div>
        <div v-if="success" class="success-alert">{{ success }}</div>
      </div>

      <div class="edit-footer">
        <button class="btn-ghost" @click="close">取消</button>
        <button class="btn-primary" @click="save" :disabled="saving">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import axios from 'axios'

const props = defineProps({
  visible: Boolean,
  lecture: Object,
  categories: Array
})
const emit = defineEmits(['close', 'saved'])

const form = ref({
  title: '',
  slug: '',
  categoryId: null,
  layoutMode: 'system',
  isPublic: false,
  chapters: []
})
const coverFile = ref(null)
const error = ref('')
const success = ref('')
const saving = ref(false)
const dragIndex = ref(null)

// 当 lecture 变化时初始化表单
watch(() => props.lecture, (lecture) => {
  if (lecture) {
    form.value = {
      title: lecture.title || '',
      slug: lecture.slug || '',
      categoryId: lecture.category_id || null,
      layoutMode: lecture.layout_mode || 'system',
      isPublic: lecture.is_public === 1,
      chapters: (lecture.chapters || []).map(c => ({ ...c }))
    }
    coverFile.value = null
    error.value = ''
    success.value = ''
  }
}, { immediate: true })

function handleCover(e) {
  const file = e.target.files[0]
  if (!file) return
  if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
    error.value = '封面图仅支持 JPG、PNG、WebP'
    coverFile.value = null
    return
  }
  coverFile.value = file
  error.value = ''
}

function handleDragStart(e, index) {
  dragIndex.value = index
  e.dataTransfer.effectAllowed = 'move'
}

function handleDrop(e, dropIndex) {
  const startIndex = dragIndex.value
  if (startIndex === null || startIndex === dropIndex) return

  const chapters = [...form.value.chapters]
  const [moved] = chapters.splice(startIndex, 1)
  chapters.splice(dropIndex, 0, moved)
  form.value.chapters = chapters
  dragIndex.value = null
}

function handleOverlayClick(e) {
  if (e.target === e.currentTarget) close()
}

async function save() {
  if (!form.value.title.trim()) {
    error.value = '标题不能为空'
    return
  }
  if (!form.value.slug.trim()) {
    error.value = 'URL 标识不能为空'
    return
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(form.value.slug)) {
    error.value = 'URL 标识只能包含英文、数字、下划线和短横线，长度 2-81 位'
    return
  }

  saving.value = true
  error.value = ''
  success.value = ''

  try {
    const token = localStorage.getItem('adminToken')
    const headers = token ? { Authorization: `Bearer ${token}` } : {}

    // 1. 更新基本信息
    const formData = new FormData()
    formData.append('title', form.value.title.trim())
    formData.append('slug', form.value.slug.trim())
    formData.append('categoryId', form.value.categoryId || '')
    formData.append('layoutMode', form.value.layoutMode)
    formData.append('isPublic', form.value.isPublic ? '1' : '0')
    if (coverFile.value) formData.append('cover', coverFile.value)

    const res = await axios.put(`/api/lectures/${props.lecture.id}`, formData, {
      headers: { ...headers, 'Content-Type': 'multipart/form-data' }
    })

    // 2. 更新章节（如果有变动）
    const chaptersChanged = JSON.stringify(form.value.chapters.map(c => ({ id: c.id, title: c.title }))) !==
                           JSON.stringify((props.lecture.chapters || []).map(c => ({ id: c.id, title: c.title })))
    const orderChanged = JSON.stringify(form.value.chapters.map(c => c.id)) !==
                        JSON.stringify((props.lecture.chapters || []).map(c => c.id))

    if (chaptersChanged || orderChanged) {
      await axios.put(`/api/lectures/${props.lecture.id}/chapters`, {
        chapters: form.value.chapters.map((c, i) => ({ id: c.id, title: c.title, order: i }))
      }, { headers })
    }

    success.value = '保存成功！'
    emit('saved', res.data)
    setTimeout(() => close(), 800)
  } catch (e) {
    error.value = e.response?.data?.error || '保存失败'
  } finally {
    saving.value = false
  }
}

function close() {
  emit('close')
}
</script>

<style scoped>
.edit-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.edit-modal {
  background: #ffffff;
  border-radius: 12px;
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e6eaf0;
}

.edit-header h2 {
  font-size: 18px;
  font-weight: 700;
  color: #172033;
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  font-size: 24px;
  color: #7a8494;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: #f1f5f9;
  color: #172033;
}

.edit-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.form-section {
  margin-bottom: 24px;
}

.form-section h3 {
  font-size: 14px;
  font-weight: 700;
  color: #172033;
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #e6eaf0;
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #4d596d;
  margin-bottom: 6px;
}

.form-group input[type="text"],
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  font-size: 14px;
  color: #172033;
  background: #ffffff;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #2f6fed;
  box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
}

.hint {
  font-size: 12px;
  color: #7a8494;
  margin: 4px 0 0 0;
}

.layout-options {
  display: grid;
  gap: 8px;
}

.layout-options label {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 12px;
  align-items: start;
  padding: 12px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.layout-options label.active {
  border-color: #2f6fed;
  background: #f0f5ff;
}

.layout-options input {
  margin-top: 2px;
}

.layout-options span {
  font-weight: 600;
  color: #172033;
  grid-column: 2;
}

.layout-options small {
  color: #7a8494;
  font-size: 12px;
  grid-column: 2;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
  accent-color: #2f6fed;
}

.cover-preview {
  margin-bottom: 8px;
}

.cover-preview img {
  max-width: 200px;
  max-height: 120px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid #e6eaf0;
}

.file-upload {
  position: relative;
  padding: 12px;
  border: 1px dashed #d8dee8;
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
}

.file-upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.file-upload span {
  font-size: 13px;
  color: #7a8494;
}

.chapters-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e6eaf0;
  border-radius: 8px;
  cursor: grab;
}

.chapter-item:active {
  cursor: grabbing;
}

.drag-handle {
  color: #b0b8c4;
  font-size: 14px;
  cursor: grab;
  user-select: none;
}

.chapter-index {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2f6fed;
  color: white;
  font-size: 12px;
  font-weight: 700;
  border-radius: 6px;
  flex-shrink: 0;
}

.chapter-item input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  font-size: 14px;
  background: white;
}

.chapter-slug {
  font-size: 12px;
  color: #7a8494;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-alert {
  padding: 10px 12px;
  background: #fff4f2;
  border: 1px solid #ffd4d0;
  border-radius: 8px;
  color: #b42318;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}

.success-alert {
  padding: 10px 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  color: #16a34a;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}

.edit-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #e6eaf0;
}

.btn-ghost {
  padding: 8px 16px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: white;
  color: #4d596d;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #2f6fed;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-ghost:hover {
  background: #f8fafc;
}

.btn-primary:hover:not(:disabled) {
  background: #1d5bd1;
}
</style>
