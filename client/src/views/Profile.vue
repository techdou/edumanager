<template>
  <div class="profile-page">
    <!-- Profile content: iframe or placeholder -->
    <div v-if="hasProfile" class="profile-iframe-wrap">
      <iframe :src="'/api/profile/index.html'" class="profile-iframe" />
    </div>

    <!-- Placeholder when no profile uploaded -->
    <div v-else class="placeholder">
      <div class="placeholder-bg-circle"></div>
      <div class="placeholder-content">
        <div class="avatar-placeholder">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <rect width="80" height="80" rx="20" fill="var(--color-primary-subtle)"/>
            <circle cx="40" cy="30" r="12" fill="var(--color-primary)" opacity="0.3"/>
            <ellipse cx="40" cy="62" rx="22" ry="16" fill="var(--color-primary)" opacity="0.2"/>
            <path d="M40 22a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 24c-13 0-22 7-22 14v2h44v-2c0-7-9-14-22-14z" fill="var(--color-primary)" opacity="0.5"/>
          </svg>
        </div>
        <h1 class="placeholder-name">教师姓名</h1>
        <p class="placeholder-subtitle">课程 · 简介</p>
        <div class="placeholder-divider"></div>
        <div class="placeholder-stats">
          <div class="stat-badge">
            <span class="stat-icon">📚</span>
            <span class="stat-text">{{ lectureCount }} 讲义</span>
          </div>
          <div class="stat-badge">
            <span class="stat-icon">📄</span>
            <span class="stat-text">{{ chapterCount }} 章节</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Action Button -->
    <button class="fab" @click="handleFabClick">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 3h4v2H5v2H3V3zm5 0h4v2H8V3zm5 0h4v2h-2v2h-2V3zM3 8h4v2H5v2H3V8zm5 0h4v2H8V8zm5 0h4v2h-2v2h-2V8zM3 13h4v4H5v-2H3v-2zm5 0h4v4H8v-4zm5 0h4v4h-2v-2h-2v-2z" fill="currentColor"/>
      </svg>
      <span>浏览讲义内容</span>
    </button>

    <!-- Login Modal -->
    <LoginModal v-model:visible="showLoginModal" @success="onLoginSuccess" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import LoginModal from '../components/LoginModal.vue'

const router = useRouter()
const hasProfile = ref(false)
const showLoginModal = ref(false)
const lectureCount = ref(0)
const chapterCount = ref(0)

const isLoggedIn = computed(() => !!localStorage.getItem('token'))

onMounted(async () => {
  try {
    const [checkRes, lecRes] = await Promise.all([
      fetch('/api/profile/check'),
      fetch('/api/lectures')
    ])
    if (checkRes.ok) {
      const d = await checkRes.json()
      hasProfile.value = d.exists
    }
    if (lecRes.ok) {
      const lectures = await lecRes.json()
      lectureCount.value = lectures.length
      chapterCount.value = lectures.reduce((s, l) => s + (l.chapters?.length || 0), 0)
    }
  } catch { /* silent */ }
})

function handleFabClick() {
  if (isLoggedIn.value) {
    router.push('/lectures')
  } else {
    showLoginModal.value = true
  }
}

function onLoginSuccess() {
  // Use full page navigation to ensure login state is fresh
  window.location.href = '/lectures'
}
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  position: relative;
  background: var(--color-bg);
}

/* ---- Iframe mode ---- */
.profile-iframe-wrap {
  position: fixed;
  inset: 0;
  z-index: 1;
}
.profile-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

/* ---- Placeholder ---- */
.placeholder {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.placeholder-bg-circle {
  position: absolute;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  background: radial-gradient(circle, oklch(0.55 0.18 250 / 0.08) 0%, transparent 70%);
  top: 20%;
  right: -10%;
  pointer-events: none;
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1;
  animation: fadeUp 400ms var(--ease-out-expo, ease-out);
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.avatar-placeholder {
  width: 140px;
  height: 140px;
  border-radius: 28px;
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  margin-bottom: var(--space-6);
}

.placeholder-name {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--color-ink);
  margin-bottom: var(--space-2);
}

.placeholder-subtitle {
  font-size: var(--text-base);
  color: var(--color-ink-tertiary);
  margin-bottom: var(--space-6);
}

.placeholder-divider {
  width: 40px;
  height: 2px;
  background: var(--color-border);
  border-radius: 1px;
  margin-bottom: var(--space-6);
}

.placeholder-stats {
  display: flex;
  gap: var(--space-4);
}

.stat-badge {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--color-ink-secondary);
}

.stat-icon {
  font-size: 16px;
}

/* ---- FAB ---- */
.fab {
  position: fixed;
  bottom: var(--space-8);
  right: var(--space-8);
  z-index: 100;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-xl);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-lg), 0 0 0 0 oklch(0.55 0.18 250 / 0.3);
  transition: all var(--duration-normal, 250ms) var(--ease-out-expo, ease-out);
  animation: fabIn 300ms var(--ease-out-expo, ease-out) 200ms both;
}

@keyframes fabIn {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.fab:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg), 0 0 0 4px oklch(0.55 0.18 250 / 0.15);
}

.fab:active {
  transform: translateY(0);
}

@media (max-width: 640px) {
  .fab {
    bottom: var(--space-4);
    right: var(--space-4);
    padding: var(--space-3) var(--space-4);
  }
  .placeholder-stats {
    flex-direction: column;
    gap: var(--space-2);
  }
}
</style>
