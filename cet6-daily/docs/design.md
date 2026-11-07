# 设计与实现

> 上篇讲每天的内容怎么抽出来，下篇讲这些状态怎么存。想改行为先看这两部分，能省掉大半调试时间。
>
> 代码位置：`src/core.js`（`poolFor / restFor / drawPool / drawListen / forceCustom / buildPush / getPush / markSeen / migrate`）。

---

# 上篇 · 抽取算法

每天打开页面，四列推送和单词批次都是现抽的。这一部分把规则写全，方便你判断「抽得对不对」或者自己改。

## 1 池子怎么划分

| 板块 | 池子 | 规模 | 每天取几 |
|---|---|---|---|
| 阅读 | `read-easy`（≤3 星）、`read-hard`（≥4 星） | 各 90 | 各 1 |
| 听力 | `listen` | 145 | 1–2 条，累计 ≤ 30 分钟 |
| 翻译 | `trans-easy` / `trans-hard` | 各 45 | 1 段（单双日交替） |
| 写作 | `write` | 90 | 1 题 |

**阅读两档独立轮转**，不共用记录。一篇易文出现过的次数，不影响难文的选择。

**翻译按日期奇偶交替**：`dayIndex(date) % 2 === 0` 走易，否则走难。`dayIndex` 是「UTC 毫秒 / 86400000」的日期序数，不受时区和夏令时影响，同一天永远得到同一个值。

自建素材按板块挂进对应的池子（`read-easy`、`read-hard`、`listen`、`trans-easy`、`trans-hard`、`write`），带 `custom: true`。

## 2 冷却天数按池长反推

```js
function restFor(part, poolLen) {
  if (part.indexOf('read') === 0) return Math.max(1, poolLen);       // = 90
  if (part === 'listen') return Math.max(6, Math.round(poolLen * 0.66)); // = 96
  if (part.indexOf('trans') === 0) return Math.max(1, poolLen * 2);  // = 90
  return Math.max(1, poolLen);                                      // write = 90
}
```

为什么不是写死 7 天或 30 天？因为池子大小是会变的：用户绑一批素材、删掉几条、换一个版本的题库，写死的冷却要么导致「三天就回头」，要么导致「池子早该用完却还在用旧题」。按池长反推的直觉是——**整池轮完一遍才允许回头**。

- 阅读：一天一篇，冷却 = 池长，正好走完 90 天才循环
- 听力：一天 1–2 条，冷却取池长的 0.66 倍（96 天），比一天一条略紧，允许偶尔提前复用
- 翻译：单双日各用一半池子，所以冷却 = 当日档位池长 × 2
- 写作：一天一题，冷却 = 池长

每条素材在 `state.seen[板块][id] = 上次出现的 dayIndex`。判定条件是：

```js
last === undefined || (todayIndex - last) >= rest
```

## 3 必须补位，绝不空手

严格冷却有一个直接后果：池子被消耗到后期，候选会变少甚至为空。如果这时「今天没有符合冷却的题」就返回空数组，界面就会出现空列——这是这类应用最常见的崩点。

所以候选不足时按**最久没出现**补满：

```js
restPool.sort((a, b) => a.last - b.last || a.i - b.i)   // 从未出现的排最前（-1e9）
```

排序键带 `i`（原池顺序）作为稳定 tie-break，避免同 `last` 时顺序漂移导致同日两次抽取结果不同。

代价是后期「冷却」变成软约束：400 天压测里，听力在 96 天后再无新鲜素材，重复间隔会低于 96 天。这是规模决定的（145 条池子撑不住 400 天每天 2 条），测试断言因此放宽为「补位间隔不得小于 60 天」。**宁可重复，不可空手。**

## 4 同一天刷新内容不变

推送结果和它的「签名」一起存进 `state.push[date]`。页面刷新只是读回来，不重新抽。

打乱用的是确定性伪随机：

```js
seed = hash32(date + '|' + part + '|' + poolV + '|' + poolSig(part))
shuffle(eligible, seed)   // FNV-1a + mulberry32 + Fisher–Yates
```

种子由四样东西组成，任何一样变化都意味着「这不该是同一批题」：

| 输入 | 变了会怎样 |
|---|---|
| `date` | 换一天自然是新的一批 |
| `part` | 四个板块互不干扰 |
| `poolV` | 题库版本号，换题库时 +1 |
| `poolSig` | `池长 + '#' + hash32(排序后的全部 id)`，池内容变则签名变 |

## 5 池版本号与失效重抽

`getPush()` 每次都会重算五个池子的签名，和存档里的 `p.sig` 逐项比对。任何一项不符（用户删了一批素材、切了词库、换了版本），当场作废重抽，并把新结果写进 `seen`。

```js
var valid = p && p.sig && ['re','rh','l','t','w'].every(k => p.sig[k] === need[k]);
if (!valid) { p = buildPush(date); markSeen(date, p); prunePush(); save(); }
```

**只在换题库时删掉旧数据而不升版本号，是这类应用最脏的一种 bug**：存档里会留着已经不存在的题目 ID，界面上表现为空卡片，控制台里表现为 `undefined`。

`invalidatePush()` 就是干这个的：`poolV + 1`，清空 `state.push`，落盘。

## 6 听力：按累计时长凑

听力不是「抽 2 条」，而是「凑到 30 分钟为止」：

1. 先滤掉 `min > 30` 的合集（构建时就已过滤一次，这里是双保险）
2. 第一条必取
3. 第二条只有在 `累计 + 它 ≤ 30` 且 `累计 < 20` 时才取
4. 极端情况（过滤后一条都不剩）兜底取第一条，绝不空手
5. **只凑出一条且不足 15 分钟**时，从「18–30 分钟」的单条里挑一条最久没出现的顶替——一节 8 分钟的短视频撑不起一次精听

「最久没出现」同样用 `last` 升序 + 原池顺序 tie-break，所以这一步也是确定性的。

## 7 自建素材置顶

用户刚粘进来的素材，如果按普通冷却逻辑可能要等一周才露面，会让人以为没存上。所以：

```js
forceCustom(part, list)
// 1. 该板块有自建条目 → 优先挑「最久没出现」的一条
// 2. 抽出来的这批里已经含自建 → 不重复插入
// 3. 听力特例：自建视频插到第一位，最多保留 2 条
```

配合 `seen` 记录，自建条目后续也走正常冷却，不会天天霸屏。

## 8 记录只留最近 200 条

`state.seen` 每个板块是 `{ id: dayIndex }`，另外维护一个 `seenOrder` 数组记录插入顺序。超过 200 条就从头删：

```js
while (order.length > 200) { delete store[order.shift()]; }
```

为什么要裁？因为「自建素材无限追加」会让 `seen` 无限膨胀，最后撑爆 `localStorage` 的 5 MB 配额——而 `setItem` 抛异常时用户的直觉是「这软件坏了」，不是「我存太多了」。

裁剪顺序是先进先出，被裁掉的老记录退回「从未出现」，最多让老素材早一点被复用，不影响正确性。

`state.push` 同理，只留最近 60 天。

## 9 目标调大不会多推

推送数量只由「池子规则」决定：阅读固定 2 篇、听力按 30 分钟、翻译 1 段、写作 1 题。把「每日阅读目标」改成 3，今天的推送仍然是 2 篇——第 3 篇要自己去「目标与资源」里翻，或者用五项卡的 `+1` 手动补录。

这条是刻意的：目标是你给自己定的量，推送是系统给的题。两者混在一起，改目标就等于改题库，会让「同一天刷新内容不变」失效。

单词量是唯一例外：`10 / 15 / 20 / 30 / 40 / 60` 直接决定当日批次大小，因为单词本来就是按批推进的。

## 10 六条最容易写错的地方

| 症状 | 根因 |
|---|---|
| 第三天就抽到同一篇 | 冷却写死了，没跟池长走 |
| 界面渲染的池子和抽签用的池子不是同一个 | 构建时过滤了一次，运行时又按别的条件取 |
| 链接后面粘着「，很有用」 | URL 截取只按空格切，没排除中文标点 |
| 粘错格式后原素材被清空 | 解析 0 条时仍然执行了覆盖写 |
| 抽完的题第二天又变 | 结果没落盘，每次刷新都重抽 |
| 卡片点开是空白 | 换了题库但没升池版本号，存档里留着死 ID |

---

# 下篇 · 存档结构

所有数据在一个键里：`localStorage['wb_cet6_data']`。值是 JSON 字符串。

- 当前 schema：**v4**（`src/core.js` 里的 `SCHEMA`）
- 读取时一定经过 `migrate()`：未知字段原样保留，缺失字段补默认值，旧版字段改名
- 写入失败（隐私模式、配额满）会给保存状态条换成「保存失败」，不会静默吞掉

```jsonc
{
  "v": 4,
  "poolV": 1,
  "created": "2026-11-06",
  "examDate": "2026-12-19",
  "word":   { "perDay": 20, "lib": "c6key", "mode": "card" },
  "goals":  { "word": 20, "read": 2, "listen": 2, "trans": 1, "write": 1 },
  "days":   { "2026-11-06": { "w": 20, "r": 2, "l": 2, "t": 1, "p": 0, "carry": true } },
  "push":   { "2026-11-06": { "re": [], "rh": [], "l": [], "t": [], "w": [], "tl": "hard", "sig": {}, "poolV": 1, "v": 4, "date": "2026-11-06" } },
  "marks":  { "word": { "subsidiary": "fuzzy" } },
  "news":   ["subsidiary"],
  "sources": [],
  "seen":      { "read": {}, "listen": {}, "trans": {}, "write": {} },
  "seenOrder": { "read": [], "listen": [], "trans": [], "write": [] },
  "settings":  { "remind": true, "at": "20:30", "sample": true }
}
```

## 1 顶层字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `v` | number | schema 版本，当前 4 |
| `poolV` | number | 题库版本，换题库（增删素材）时 +1，用来作废当天已抽结果 |
| `created` | `YYYY-MM-DD` | 首次使用日期 |
| `examDate` | `YYYY-MM-DD` | 考试日期，用于「距考试 N 天」 |
| `word` | object | `perDay` 每日单词量、`lib` 当前词库、`mode` 卡片/自测/清单 |
| `goals` | object | 五项每日目标，键 `word/read/listen/trans/write` |
| `days` | object | 打卡记录，键是日期 |
| `push` | object | 每天抽出来的题目，键是日期 |
| `marks` | object | 单词记忆状态，`marks.word[单词] = known/fuzzy/unknown` |
| `news` | string[] | 生词本，最近的排前面 |
| `sources` | array | 自建来源 |
| `seen` | object | 每个板块的「上次出现」记录 |
| `seenOrder` | object | 配合 `seen` 做 200 条先进先出裁剪 |
| `settings` | object | `remind` 提醒开关、`at` 提醒时间、`sample` 是否还在用示例数据 |

## 2 days[日期]

```jsonc
{ "w": 20, "r": 2, "l": 2, "t": 1, "p": 0, "carry": true, "sample": true }
```

| 键 | 含义 | 单位 |
|---|---|---|
| `w` | 单词 | 个 |
| `r` | 阅读 | 篇 |
| `l` | 听力 | 个 |
| `t` | 翻译 | 段 |
| `p` | 写作 | 题 |
| `carry` | 是否把昨天缺口顺延到今天，`false` 表示「只做今天」 | bool |
| `sample` | 是否属于首次预置的示例数据（清空示例时只删这些） | bool |

达标判定：五项都满足 `done >= target` 才算这一天成功，`target` 由 `targetsFor(date)` 现算，不入库。

## 3 push[日期]

```jsonc
{
  "re": ["r-easy-17"],                       // 阅读易
  "rh": ["r-hard-42"],                       // 阅读难
  "l":  ["l-teded-3", "l-exam-11"],          // 听力 1–2 条
  "t":  ["t-hard-9"],                        // 翻译
  "w":  ["w-23"],                            // 写作
  "tl": "hard",                              // 翻译档位，取用时拼成 trans-hard
  "sig": { "re": "90#1x2y", "rh": "90#…", "l": "145#…", "t": "45#…", "w": "90#…" },
  "poolV": 1,
  "v": 4,
  "date": "2026-11-06"
}
```

`sig` 是五个池子的签名（池长 + id 集合哈希）。读取时逐项比对，不符就整条作废重抽。这是「删了题库还能正常显示」的唯一保证。

`tl` 只存 `easy` / `hard`，不存 `trans-easy`。早期版本存完整名导致档位比对永远失败，每小时重抽一次——现在统一在取用时拼前缀。

## 4 sources[]

```jsonc
{
  "id": "s1abc",
  "name": "我的 B 站收藏",
  "note": "六级听力真题",
  "kind": "listen",              // read / listen / trans / write
  "items": [
    {
      "id": "c1xyz",
      "title": "六级听力真题精讲｜2023年12月第一套",
      "url": "https://www.bilibili.com/video/BV1xx411c7mD",
      "level": "",               // read/trans 用：easy / hard
      "min": 21,                 // listen 用：分钟数
      "custom": true
    }
  ]
}
```

单个来源上限 300 条（`MAX_SOURCE_ITEMS`），超出的静默丢弃，导入预览里显示实际条数。

## 5 seen / seenOrder

```jsonc
"seen":      { "read": { "r-easy-17": 20395 }, "listen": {}, "trans": {}, "write": {} },
"seenOrder": { "read": ["r-easy-17"], "listen": [], "trans": [], "write": [] }
```

值是该素材上次出现的 `dayIndex`（UTC 日期序数，`Date.UTC(y,m,d)/86400000`）。用序数而不是时间戳，是为了让「相差几天」变成一次减法，不受时区与夏令时影响。

每个板块最多 200 条，超出从头删。

## 6 迁移

`migrate(raw)` 处理过的旧结构：

| 旧 | 新 |
|---|---|
| `goals: [30, 2, 1, 1, 1]`（数组） | `goals: { word, read, listen, trans, write }` |
| `history[date].words / reading / listening / translation / writing` | `days[date].w / r / l / t / p` |
| `wordPerDay` | `word.perDay` |
| `raw.lib` | `word.lib` |
| 未知字段 | 原样保留，不删 |

迁移只在读档时发生，不会因为迁移而丢数据；版本号升到当前值后写回。

## 7 导出 / 导入

「设置 → 导出 JSON」导出的就是这份存档（带 `v`）。导入时：

1. `JSON.parse` 失败 → 提示格式不对，不动现有数据
2. 解析成功 → 走 `migrate()` → 整体覆盖 → `location.reload()`

覆盖前不合并、不去重，因为存档是「一个人的全部记录」，合并两份只会产生矛盾数据。要保留旧的，先导出。
