# 存档结构

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

## 顶层字段

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

## days[日期]

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

## push[日期]

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

## sources[]

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

## seen / seenOrder

```jsonc
"seen":      { "read": { "r-easy-17": 20395 }, "listen": {}, "trans": {}, "write": {} },
"seenOrder": { "read": ["r-easy-17"], "listen": [], "trans": [], "write": [] }
```

值是该素材上次出现的 `dayIndex`（UTC 日期序数，`Date.UTC(y,m,d)/86400000`）。用序数而不是时间戳，是为了让「相差几天」变成一次减法，不受时区与夏令时影响。

每个板块最多 200 条，超出从头删。

## 迁移

`migrate(raw)` 处理过的旧结构：

| 旧 | 新 |
|---|---|
| `goals: [30, 2, 1, 1, 1]`（数组） | `goals: { word, read, listen, trans, write }` |
| `history[date].words / reading / listening / translation / writing` | `days[date].w / r / l / t / p` |
| `wordPerDay` | `word.perDay` |
| `raw.lib` | `word.lib` |
| 未知字段 | 原样保留，不删 |

迁移只在读档时发生，不会因为迁移而丢数据；版本号升到当前值后写回。

## 导出 / 导入

「设置 → 导出 JSON」导出的就是这份存档（带 `v`）。导入时：

1. `JSON.parse` 失败 → 提示格式不对，不动现有数据
2. 解析成功 → 走 `migrate()` → 整体覆盖 → `location.reload()`

覆盖前不合并、不去重，因为存档是「一个人的全部记录」，合并两份只会产生矛盾数据。要保留旧的，先导出。
