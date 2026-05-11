<template>
  <section class="stats-page">
    <div v-if="error" class="alert">{{ error }}</div>

    <div class="stats-grid">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span>{{ card.label }}</span>
        <strong>{{ loading ? '...' : card.value }}</strong>
      </article>
    </div>

    <div class="content-grid">
      <section class="panel trend-panel">
        <div class="panel-header">
          <h2>注册趋势</h2>
          <span>最近 30 天</span>
        </div>
        <div v-if="registrations.length" class="bar-chart" aria-label="最近 30 天注册趋势">
          <div
            v-for="item in registrations"
            :key="item.date"
            class="bar-item"
            :title="`${item.date}: ${item.count}`"
          >
            <span class="bar-value">{{ item.count || '' }}</span>
            <span class="bar" :style="{ height: `${barHeight(item.count)}%` }"></span>
            <span class="bar-label">{{ shortDate(item.date) }}</span>
          </div>
        </div>
        <div v-else class="empty">暂无注册数据</div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>活跃用户</h2>
          <span>登录行为</span>
        </div>
        <div class="active-grid">
          <div>
            <strong>{{ activeUsers.activeToday }}</strong>
            <span>今日活跃</span>
          </div>
          <div>
            <strong>{{ activeUsers.active7Days }}</strong>
            <span>近 7 日活跃</span>
          </div>
        </div>
        <div class="recent-logins">
          <h3>最近登录</h3>
          <p v-if="activeUsers.recentLogins.length === 0" class="muted">暂无登录记录</p>
          <div v-for="login in activeUsers.recentLogins" :key="`${login.user_id}-${login.created_at}`" class="mini-row">
            <span>{{ login.username }}</span>
            <small>{{ formatDate(login.created_at) }}</small>
          </div>
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-header">
        <h2>最近注册用户</h2>
        <router-link to="/admin/users" class="text-link">查看全部</router-link>
      </div>
      <div v-if="recentUsers.length" class="user-list">
        <div v-for="user in recentUsers" :key="user.id" class="user-row">
          <div>
            <strong>{{ user.username }}</strong>
            <span>{{ user.email || '未填写邮箱' }}</span>
          </div>
          <span class="tag" :class="user.role">{{ roleText(user.role) }}</span>
          <span class="tag" :class="user.status">{{ statusText(user.status) }}</span>
          <time>{{ formatDate(user.created_at) }}</time>
        </div>
      </div>
      <div v-else class="empty">暂无用户</div>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import adminApi from '../../lib/adminApi'

const loading = ref(true)
const error = ref('')
const overview = ref({
  totalUsers: 0,
  todayNewUsers: 0,
  totalLectures: 0,
  totalCategories: 0,
  disabledUsers: 0
})
const registrations = ref([])
const activeUsers = ref({
  activeToday: 0,
  active7Days: 0,
  recentLogins: [],
  daily: []
})
const recentUsers = ref([])

const cards = computed(() => [
  { label: '用户总数', value: overview.value.totalUsers },
  { label: '今日新增', value: overview.value.todayNewUsers },
  { label: '讲义总数', value: overview.value.totalLectures },
  { label: '分类总数', value: overview.value.totalCategories }
])

const maxRegistration = computed(() => {
  return Math.max(...registrations.value.map(item => Number(item.count) || 0), 1)
})

onMounted(loadStats)

async function loadStats() {
  loading.value = true
  error.value = ''
  try {
    const [overviewRes, registrationRes, activeRes, usersRes] = await Promise.all([
      adminApi.get('/stats/overview'),
      adminApi.get('/stats/registrations'),
      adminApi.get('/stats/active-users'),
      adminApi.get('/users', { params: { page: 1, pageSize: 6 } })
    ])
    overview.value = overviewRes.data
    registrations.value = registrationRes.data
    activeUsers.value = activeRes.data
    recentUsers.value = usersRes.data.items || []
  } catch (e) {
    error.value = e.response?.data?.error || '统计数据加载失败'
  } finally {
    loading.value = false
  }
}

function barHeight(count) {
  return Math.max((Number(count) / maxRegistration.value) * 100, count > 0 ? 10 : 3)
}

function shortDate(date) {
  return date.slice(5).replace('-', '/')
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(String(value).replace(' ', 'T')).toLocaleString('zh-CN', { hour12: false })
}

function roleText(role) {
  return role === 'admin' ? '管理员' : '学生'
}

function statusText(status) {
  return status === 'disabled' ? '禁用' : '启用'
}
</script>

<style scoped>
.stats-page {
  display: grid;
  gap: 24px;
}

.alert {
  padding: 12px 14px;
  border: 1px solid #ffd4d0;
  border-radius: 8px;
  background: #fff4f2;
  color: #b42318;
  font-weight: 650;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.stat-card,
.panel {
  background: #ffffff;
  border: 1px solid #e6eaf0;
  border-radius: 8px;
}

.stat-card {
  padding: 20px;
  display: grid;
  gap: 12px;
}

.stat-card span {
  color: #6d7788;
  font-size: 14px;
  font-weight: 700;
}

.stat-card strong {
  color: #172033;
  font-size: 32px;
  line-height: 1;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.8fr);
  gap: 16px;
}

.panel {
  padding: 20px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.panel-header h2 {
  color: #172033;
  font-size: 18px;
}

.panel-header span,
.muted {
  color: #7a8494;
  font-size: 13px;
}

.bar-chart {
  height: 260px;
  display: grid;
  grid-template-columns: repeat(30, minmax(8px, 1fr));
  gap: 6px;
  align-items: end;
  padding-top: 18px;
}

.bar-item {
  height: 100%;
  display: grid;
  grid-template-rows: 22px 1fr 18px;
  gap: 6px;
  align-items: end;
  min-width: 0;
}

.bar-value {
  color: #6d7788;
  font-size: 11px;
  text-align: center;
}

.bar {
  display: block;
  min-height: 3px;
  width: 100%;
  border-radius: 5px 5px 0 0;
  background: #2f6fed;
}

.bar-label {
  color: #8a94a6;
  font-size: 10px;
  text-align: center;
  writing-mode: vertical-rl;
  justify-self: center;
}

.active-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.active-grid div {
  padding: 16px;
  border-radius: 8px;
  background: #f7f9fc;
}

.active-grid strong,
.active-grid span {
  display: block;
}

.active-grid strong {
  color: #1f5fce;
  font-size: 28px;
}

.active-grid span {
  color: #6d7788;
  font-size: 13px;
  font-weight: 700;
}

.recent-logins h3 {
  margin-bottom: 10px;
  color: #172033;
  font-size: 15px;
}

.mini-row,
.user-row {
  display: grid;
  align-items: center;
  gap: 12px;
  min-height: 46px;
  border-top: 1px solid #eef1f5;
}

.mini-row {
  grid-template-columns: minmax(0, 1fr) auto;
}

.mini-row span,
.user-row strong {
  color: #172033;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-row small,
.user-row span,
.user-row time {
  color: #7a8494;
  font-size: 13px;
  white-space: nowrap;
}

.user-list {
  display: grid;
}

.user-row {
  grid-template-columns: minmax(160px, 1fr) 92px 92px 190px;
  padding: 10px 0;
}

.user-row div {
  display: grid;
  gap: 2px;
}

.tag {
  justify-self: start;
  padding: 4px 9px;
  border-radius: 999px;
  background: #edf2f7;
  color: #4d596d;
  font-size: 12px;
  font-weight: 800;
}

.tag.admin,
.tag.active {
  background: #eaf1ff;
  color: #1f5fce;
}

.tag.disabled {
  background: #fff4f2;
  color: #b42318;
}

.text-link {
  color: #1f5fce;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
}

.empty {
  padding: 28px;
  border-radius: 8px;
  background: #f7f9fc;
  color: #7a8494;
  text-align: center;
}

@media (max-width: 1100px) {
  .stats-grid,
  .content-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .trend-panel {
    grid-column: 1 / -1;
  }
}

@media (max-width: 720px) {
  .stats-grid,
  .content-grid {
    grid-template-columns: 1fr;
  }

  .bar-chart {
    overflow-x: auto;
    grid-template-columns: repeat(30, 20px);
  }

  .user-row {
    grid-template-columns: 1fr 78px;
  }

  .user-row time {
    grid-column: 1 / -1;
  }
}
</style>
