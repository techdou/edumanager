# EduManager 权限系统重构设计文档

## 一、需求概述

### 1. 首页公开精选 + 登录后完整内容
- 未登录用户访问首页，只能看到"公开精选"讲义（标记为 is_public=1）
- 登录用户访问首页，看到完整讲义列表（含公开+有权限的）
- 管理员上传/编辑讲义时可设置"公开展示"开关

### 2. 分级展示：两个页面
- **首页（/）**：公开精选内容，未登录可见，有登录入口
- **学习中心（/learn）**：登录后可见，展示该学生有权限查看的全部讲义
- **学生中心**：学生个人信息页面，展示所属班级和可查看的讲义

### 3. B（班级）+ C（分类权限）混合模型
- **班级（Group）**：学生属于某个班级，班级有权限访问某些分类
- **分类权限**：每个分类可以设置哪些班级有权限访问
- **混合判断**：学生能看到的讲义 = 公开讲义 OR (学生所在班级有权限访问该讲义所属分类)

### 4. 学生注册强调实名
- real_name 字段已在 auth.js 中改为必填
- 注册页面 UI 需同步更新

## 二、数据模型（已有基础，需补充）

### 已存在的表
- `lectures`：已有 `is_public`（默认0）、`layout_mode`、`category_id`
- `chapters`：已有 `entry_file`
- `groups`：班级表（name, description）
- `group_students`：学生-班级关联
- `group_category_permissions`：班级-分类权限关联

### 需要补充
- 无新表，使用现有表结构

## 三、API 设计

### 后端修改

#### 1. lecture.js - 列表接口改造
```
GET /api/lectures          → 公开列表（首页用，只返回 is_public=1）
GET /api/lectures?all=1    → 完整列表（需登录，含权限判断）
GET /api/lectures/my       → 我的学习中心（根据班级+分类权限返回）
```

#### 2. 新增权限判断函数
```js
function getStudentGroups(studentId) { ... }
function getAccessibleCategories(studentId) { ... }
function canAccessLecture(studentId, lecture) { ... }
```

#### 3. 管理员接口
```
PUT /api/lectures/:id/public   → 设置公开展示开关
GET /api/admin/groups          → 班级列表
POST /api/admin/groups         → 创建班级
PUT /api/admin/groups/:id      → 编辑班级
DELETE /api/admin/groups/:id   → 删除班级
POST /api/admin/groups/:id/students       → 添加学生到班级
DELETE /api/admin/groups/:id/students/:sid → 移除学生
POST /api/admin/groups/:id/categories     → 设置班级可访问分类
```

### 前端修改

#### 1. 路由
```
/          → Home.vue（改造：未登录显示公开精选，登录后显示完整内容+学习中心入口）
/learn     → Learn.vue（新增：学习中心，需登录）
/profile   → Profile.vue（新增：学生中心，展示班级和权限）
```

#### 2. 首页改造
- 未登录：显示公开精选讲义卡片 + 登录/注册按钮
- 已登录：显示完整讲义列表 + 学习中心入口

#### 3. 学习中心（/learn）
- 展示该学生有权限查看的所有讲义
- 按分类分组展示
- 阅读进度追踪

#### 4. 学生中心（/profile）
- 个人信息（用户名、真实姓名、邮箱）
- 所属班级
- 可访问的分类权限列表

#### 5. 管理员后台
- 讲义管理：增加"公开展示"开关
- 新增"班级管理"页面
- 用户管理：显示所属班级，可分配班级

## 四、权限判断逻辑

```
学生能否访问某讲义：
  IF lecture.is_public == 1 → true
  IF 学生未登录 → false
  IF 学生登录：
    获取学生所在的所有班级
    获取这些班级有权限访问的所有分类
    IF lecture.category_id IN 可访问分类 → true
    ELSE → false
```

## 五、实现顺序

1. 后端：改造 lecture.js 列表接口，支持公开/权限过滤
2. 后端：实现 groups 管理 API
3. 后端：实现权限判断工具函数
4. 前端：改造 Home.vue（公开精选展示）
5. 前端：创建 Learn.vue（学习中心）
6. 前端：创建 Profile.vue（学生中心）
7. 前端：改造注册页面（强调实名）
8. 前端：管理员后台 - 班级管理页面
9. 前端：管理员后台 - 讲义公开展示开关
10. 路由改造
11. 测试
12. Git push + 部署
