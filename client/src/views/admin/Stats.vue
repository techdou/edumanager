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
          <span>最近 7 天</span>
        </div>
        <div v-if="registrations.length" class="bar-chart" aria-label="最近 7 天注册趋势">
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

    <section class="panel">
      <div class="panel-header">
        <h2>学习数据看板</h2>
        <span>班级进度 · 断点续学 · 卡点章节</span>
      </div>

      <div class="sub-block">
        <h3>班级 × 讲义完成率矩阵</h3>
        <div v-if="hasProgressData" class="matrix-wrap">
          <table class="matrix-table">
            <thead>
              <tr>
                <th class="col-group">班级</th>
                <th v-for="lec in progressOverview.lectures" :key="lec.lecture_slug" :title="lec.lecture_title">
                  {{ lec.lecture_title }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="group in progressOverview.groups" :key="group.group_id">
                <th class="row-group">
                  <span>{{ group.group_name }}</span>
                  <small>{{ group.student_count }} 人</small>
                </th>
                <td
                  v-for="lec in progressOverview.lectures"
                  :key="lec.lecture_slug"
                  :style="cellStyle(group.cells ? group.cells[lec.lecture_slug] : null)"
                >
                  <template v-if="group.cells && lec.lecture_slug in group.cells">
                    {{ Math.round(group.cells[lec.lecture_slug]) }}%
                  </template>
                  <template v-else>—</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty">暂无学习数据</div>
      </div>

      <div class="insight-columns">
        <div class="sub-block">
          <h3>断点续学名单</h3>
          <div v-if="stalledStudents.length" class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>用户名</th>
                  <th>最后活跃</th>
                  <th>进行中</th>
                  <th>平均进度</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="student in stalledStudents" :key="student.student_id">
                  <td class="primary-cell">{{ student.real_name || student.username }}</td>
                  <td>{{ student.username }}</td>
                  <td>{{ formatDate(student.last_active) }}</td>
                  <td>{{ student.in_progress }}</td>
                  <td>{{ Math.round(student.avg_progress) }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="empty">没有停滞学习的学生 🎉</div>
        </div>

        <div class="sub-block">
          <h3>卡点章节 Top 10</h3>
          <div v-if="stuckChapters.length" class="stuck-list">
            <div v-for="chapter in stuckChapters.slice(0, 10)" :key="`${chapter.lecture_slug}-${chapter.chapter_slug}`" class="stuck-item">
              <div class="stuck-info">
                <strong>{{ chapter.lecture_title }}</strong>
                <span>{{ chapter.chapter_title }} · {{ chapter.learners }} 人在学</span>
              </div>
              <div class="stuck-progress">
                <div class="stuck-bar"><span :style="{ width: `${stuckBarWidth(chapter.avg_progress)}%` }"></span></div>
                <em>{{ Math.round(chapter.avg_progress) }}%</em>
              </div>
            </div>
          </div>
          <div v-else class="empty">暂无数据</div>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import adminApi from '../../lib/adminApi'
import { formatDateTime } from '../../utils/date'

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

const EMPTY_PROGRESS = { groups: [], lectures: [] }
const progressOverview = ref(EMPTY_PROGRESS)
const stalledStudents = ref([])
const stuckChapters = ref([])

const hasProgressData = computed(() => {
  const { groups, lectures } = progressOverview.value
  return (
    lectures.length > 0 &&
    groups.some(group => group.cells && Object.keys(group.cells).length > 0)
  )
})

const cards = computed(() => [
  { label: '用户总数', value: overview.value.totalUsers },
  { label: '今日新增', value: overview.value.todayNewUsers },
  { label: '讲义总数', value: overview.value.totalLectures },
  { label: '分类总数', value: overview.value.totalCategories }
])

const maxRegistration = computed(() => {
  return Math.max(...registrations.value.map(item => Number(item.count) || 0), 1)
})

onMounted(() => {
  loadStats()
  loadInsights()
})

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

// 学习数据看板：与主统计并行加载，失败静默降级为空态，不打断上方展示
async function loadInsights() {
  try {
    const [progressRes, stalledRes, stuckRes] = await Promise.all([
      adminApi.get('/stats/progress-overview'),
      adminApi.get('/stats/stalled'),
      adminApi.get('/stats/stuck-chapters')
    ])
    const progress = progressRes.data || {}
    progressOverview.value = {
      groups: Array.isArray(progress.groups) ? progress.groups : [],
      lectures: Array.isArray(progress.lectures) ? progress.lectures : []
    }
    stalledStudents.value = Array.isArray(stalledRes.data) ? stalledRes.data : []
    stuckChapters.value = Array.isArray(stuckRes.data) ? stuckRes.data : []
  } catch (e) {
    progressOverview.value = EMPTY_PROGRESS
    stalledStudents.value = []
    stuckChapters.value = []
  }
}

// 0% 用 --color-bg，100% 用 --color-success 的低透明度（subtle）变体，中间渐进
function cellStyle(progress) {
  if (progress == null) return {}
  if (Number(progress) <= 0) return { background: 'var(--color-bg)' }
  const alpha = 0.08 + (Math.min(Number(progress), 100) / 100) * 0.22
  return { background: `oklch(0.55 0.18 145 / ${alpha.toFixed(3)})` }
}

function stuckBarWidth(progress) {
  const value = Number(progress)
  if (!Number.isFinite(value)) return 0
  return Math.max(Math.min(value, 100), 0)
}

function barHeight(count) {
  return Math.max((Number(count) / maxRegistration.value) * 100, count > 0 ? 10 : 3)
}

function shortDate(date) {
  return date.slice(5).replace('-', '/')
}

const formatDate = formatDateTime

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
  grid-template-columns: repeat(7, minmax(30px, 1fr));
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

.sub-block h3 {
  margin-bottom: 12px;
  color: #172033;
  font-size: 15px;
}

.insight-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
  margin-top: 24px;
}

.matrix-wrap,
.table-scroll {
  overflow-x: auto;
}

.matrix-table,
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  white-space: nowrap;
}

.matrix-table th,
.matrix-table td,
.data-table th,
.data-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #eef1f5;
  text-align: left;
}

.matrix-table thead th,
.data-table thead th {
  color: #7a8494;
  font-size: 12px;
  font-weight: 700;
}

.matrix-table thead th:not(.col-group) {
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

.matrix-table td {
  min-width: 56px;
  text-align: center;
  color: #172033;
  font-weight: 700;
}

.row-group {
  display: grid;
  gap: 2px;
}

.row-group span {
  color: #172033;
  font-weight: 700;
}

.row-group small {
  color: #8a94a6;
  font-size: 11px;
  font-weight: 600;
}

.data-table td {
  color: #4d596d;
}

.data-table .primary-cell {
  color: #172033;
  font-weight: 700;
}

.stuck-list {
  display: grid;
  gap: 10px;
}

.stuck-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 0.6fr);
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #eef1f5;
  border-radius: 8px;
  background: #f7f9fc;
}

.stuck-info {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.stuck-info strong {
  color: #172033;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stuck-info span {
  color: #7a8494;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stuck-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stuck-bar {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: #e6eaf0;
  overflow: hidden;
}

.stuck-bar span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--color-success);
}

.stuck-progress em {
  color: #172033;
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
  min-width: 34px;
  text-align: right;
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
    grid-template-columns: repeat(7, minmax(30px, 1fr));
  }

  .user-row {
    grid-template-columns: 1fr 78px;
  }

  .user-row time {
    grid-column: 1 / -1;
  }

  .stuck-item {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
