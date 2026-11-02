# 数据结构与联动规则

这份文档面向想改代码或基于它二次开发的人。第 1—4 节讲清楚「数据长什么样」，第 5 节讲「为什么这样写不会崩」，第 6 节是常见的改法。

---

## 1. 存储

| 项 | 值 |
|---|---|
| 位置 | 浏览器 `localStorage` |
| 键名 | `wb_academic_master_v1` |
| 格式 | 单个 JSON 对象，三个数组 |
| 读写 | 启动时 `load()`，每次变更后 `save()`（由 `commit()` 统一封装） |

键名带 `_v1` 后缀，意味着如果未来结构发生不兼容变化，应当换成 `_v2`，并在 `load()` 中写一段旧版迁移逻辑，而不是直接覆盖用户数据。

---

## 2. 三个实体

### 2.1 任务 `tasks[]`

界面「任务管理」里的条目，也是「今天要处理」的数据来源。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | `uid()` 生成 |
| `text` | string | 任务内容 |
| `pri` | `'P0' \| 'P1' \| 'P2'` | 优先级，配色见 `PRI` 常量 |
| `scope` | `'today' \| 'week' \| 'month' \| 'all'` | 所属维度，决定出现在哪个子 Tab |
| `date` | `'YYYY-MM-DD' \| null` | 到期日。today 为当天，week 为当周周日，month 为当月最后一天，all 为 `null` |
| `lineId` | string \| null | 关联的研究线 id |
| `progId` | string \| null | 对应看板进度任务 id（双向绑定的一端） |
| `done` | boolean | 是否完成 |
| `createdAt` | number | 时间戳，仅用于排序兜底 |
| `seed` | boolean? | 是否为内置示例，供「清空示例数据」识别 |

### 2.2 研究线与进度任务 `lines[].tasks[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | — |
| `name` | string | 研究线名称 |
| `color` | string | 专属色，取自 `LINE_COLORS` |
| `tasks` | array | 该线下的进度任务 |

进度任务：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | — |
| `text` | string | 进度任务内容 |
| `status` | `0 \| 1 \| 2` | 0 待启动 / 1 进行中 / 2 已完成 |
| `scope` | 同上 \| null | 来源维度；`null` 表示无来源，不显示彩色标签 |
| `taskId` | string \| null | 反向指向任务的 id（双向绑定的另一端） |

### 2.3 习惯 `habits[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | — |
| `name` | string | 习惯名称 |
| `color` | string | 卡片配色 |
| `log` | `{ 'YYYY-MM-DD': true }` | 打卡记录，只有「打过」才写键；取消即删除键 |

`log` 用「只存已打卡日期」的稀疏结构，好处是连续天数、月度统计、年度柱状图都只需遍历已有键，不需要为每一天准备一条记录。

---

## 3. 不变量（Invariants）

任何一次 `commit()` 之后，下面几条必须同时成立。改代码时如果破坏了它们，界面就会出现「幽灵条目」或状态错位。

1. `task.progId` 非空 ⟹ 该 prog 存在，且 `prog.taskId === task.id`
2. `prog.taskId` 非空 ⟹ 该 task 存在，且 `task.progId === prog.id`
3. 存在绑定时：`prog.status === 2` ⟺ `task.done === true`
4. `prog.scope` 与来源 task 的 `scope` 保持一致；无来源时为 `null`
5. 删除后不得留下悬空指针（按维度决定「删 prog」还是「置空 taskId/scope」）
6. 删除研究线后，原属该线的任务 `lineId` 与 `progId` 必须置 `null`（任务本身保留）

---

## 4. 六条规则落在哪个函数

### 规则 1 · 看板加进度任务 → 同步今日

`addProgForLine(lineId, btn)`

```
读取输入框与「同步今日」复选框
p = { id, text, status: 0, scope: sync ? 'today' : null, taskId: null }
if (sync) {
  t = { id, text, pri: 'P1', scope: 'today', date: 今天, lineId, progId: p.id, done: false }
  p.taskId = t.id
  tasks.push(t)
}
line.tasks.push(p)
```

注意：不勾选「同步今日」时 `p.scope = null`，看板上这条任务不显示维度标签——这是规则 6 的判定依据。

### 规则 2 · 任务关联研究线 → 看板新增进度任务

`addTaskFromForm()`

```
t = { id, text, pri, scope: 当前Tab, date, lineId: null, progId: null }
if (scope === 'all') { ...规则 3... }
else if (选择了研究线) {
  p = { id, text: t.text, status: 0, scope: t.scope, taskId: t.id }
  line.tasks.push(p)
  t.lineId = line.id; t.progId = p.id
}
tasks.push(t)
```

### 规则 3 · 「全部」维度 → 自动建线

`addTaskFromForm()` 中 `scope === 'all'` 分支

```
line = { id, name: t.text, color: 下一个配色, tasks: [], auto: true }
p    = { id, text: t.text, status: 0, scope: 'all', taskId: t.id }
line.tasks.push(p)
lines.push(line)
t.lineId = line.id; t.progId = p.id
```

`auto: true` 标记这条线是由总任务自动生成的。规则 5 删除总任务时，如果这条线已经空了，会一并清理，避免留下空壳。

此时「关联研究线」下拉框是 `disabled` 状态——总任务不需要手动选线。

### 规则 4 · 双向状态同步

两个方向各一处：

```
toggleTaskDone(t):
  t.done = !t.done
  if (t.progId) prog.status = t.done ? 2 : 0     // 任务 → 看板

case 'cycle':                                     // 看板 → 任务
  prog.status = (prog.status + 1) % 3
  if (prog.taskId) task.done = (prog.status === 2)
```

两处都是「整段覆盖」而不是「取或」：从已完成退回待启动时，另一侧也会跟着取消完成，保证不变量 3 双向成立。

### 规则 5 · 删除对称

`deleteTask(t)`

```
if (t.progId) {
  if (t.scope === 'month' || t.scope === 'all') {
    从所属线里删掉该 prog
    if (t.scope === 'all' && line.auto && line.tasks.length === 0) 删掉整条线
  } else {                       // today / week
    prog.taskId = null; prog.scope = null   // 仅解绑，进度任务保留
  }
}
tasks = tasks.filter(x => x.id !== t.id)
```

反向删除（看板上删进度任务）走 `case 'delProg'`：把对应任务的 `progId` 置空，任务保留。

### 规则 6 · 彩色维度标签

渲染 `progRowHTML(p)` 时读 `p.scope`，查 `SCOPE` 常量取色：

```js
SCOPE = {
  today: { label: '今日',   color: '#3B5BDB' },  // 蓝
  week:  { label: '本周',   color: '#F08C00' },  // 黄
  month: { label: '本月',   color: '#2F9E44' },  // 绿
  all:   { label: '总任务', color: '#7048E8' }   // 紫
}
```

标签底纹用 `tint(color, .13)` 生成同色低透明度背景，保证浅色主题下可读。

---

## 5. 渲染架构：为什么不会递归

三层单向依赖：

```
数据层  load / save
   ↓
业务层  toggleTaskDone / deleteTask / addTaskFromForm / addProgForLine
   ↓
渲染层  renderTodayPanel / renderTaskStats / renderTaskList
       renderBoard / renderBoardSummary / renderHabits / renderHabitView
   ↑
refreshAll()  ← 唯一调度入口
```

硬规则：

- **渲染函数只读 `state`，不写 `state`，也不调用其他渲染函数**
- 任何交互都是「改数据 → `commit()`」，`commit()` = `save()` + `refreshAll()`
- 一个渲染函数内部如果需要另一块区域的最新数据，重新计算，而不是去调用对方的渲染函数

这样任意两个函数之间都不存在双向路径，递归环在结构上就不可能产生。

辅助规则：`renderBoard()` 重建 DOM 前会先把各卡片输入框里正在输入的文字和勾选状态存进 `keep` 对象，重建后写回——否则用户打字打到一半点一下状态按钮，输入内容就没了。

---

## 6. 常见改法

**改主色**：`:root` 里的 `--pri`，以及 `SCOPE.today` / `PRI.P2` 里同色值（如要保持一致）。

**加一个维度**：`SCOPE` 加一项 → HTML 里 `.tabs` 加一颗按钮（`data-scope`）→ `date` 计算分支加一行。渲染层和联动层不用动，因为它们都按 `scope` 字段通用处理。

**给任务加字段**（比如「预估耗时」）：`addTaskFromForm()` 的对象字面量加字段 → `renderTaskList()` 的模板加显示 → 老数据里没有该字段，用 `t.xxx || 默认值` 兜底即可，不需要迁移脚本。

**改默认示例数据**：`seed()` 一个函数集中管理，改完记得同步 README 截图。

**换存储方式**（比如接 Supabase 做多端同步）：只需要替换 `load()` 与 `save()` 两个函数，其余业务与渲染代码无需改动——这是当初把读写收口到这两个函数的原因。
