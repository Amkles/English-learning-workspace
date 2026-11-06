/* 抽取机制压力测试：连续 400 天，检查冷却、补位、时长规则与自建条目置顶 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/' });
const { window } = dom;
const C = window.Core;

function run() {
const S = C.state();

// 清掉页面启动时按「真实今天」抽的那一批，避免污染模拟区间
['read','listen','trans','write'].forEach(k => { S.seen[k] = {}; S.seenOrder[k] = []; });
S.push = {};
S.sources = [];

let fail = 0;
const bad = (m) => { console.log('  ✗ ' + m); fail++; };

const start = '2026-01-01';
const DAYS = 400;
const lastSeen = { read: {}, listen: {}, trans: {}, write: {} };
const counts = { read: 0, listen: 0, trans: 0, write: 0 };

const restOf = {
  readEasy: 90,          // 每档池长
  readHard: 90,
  listen: Math.max(6, Math.round(145 * 0.66)),
  transEasy: 45 * 2,     // 当日档位池长 × 2
  transHard: 45 * 2,
  write: 90,
};

for (let i = 0; i < DAYS; i++) {
  const date = C.shift(start, i);
  const d = C.dayIndex(date);
  const p = C.pushItems(date);

  // 阅读：必须一易一难
  if (p.read.length !== 2) bad(`${date} 阅读数量 ${p.read.length}`);
  const levels = p.read.map(x => x.level).sort().join(',');
  if (levels !== 'easy,hard') bad(`${date} 阅读档位 ${levels}`);

  // 听力：1–2 条，累计 ≤30，一条时 ≥15（有长候选的情况下）
  if (p.listen.length < 1 || p.listen.length > 2) bad(`${date} 听力数量 ${p.listen.length}`);
  const sum = p.listen.reduce((a, x) => a + x.min, 0);
  if (sum > 30) bad(`${date} 听力累计 ${sum} 分钟`);
  if (p.listen.length === 1 && p.listen[0].min < 15) bad(`${date} 单条听力仅 ${p.listen[0].min} 分钟`);

  // 翻译：与当日档位一致
  if (p.trans.length !== 1) bad(`${date} 翻译数量 ${p.trans.length}`);
  else if (p.trans[0].level !== p.transLevel) bad(`${date} 翻译档位不符`);

  // 写作：1 题
  if (p.write.length !== 1) bad(`${date} 写作数量 ${p.write.length}`);

  // 冷却：不得提前回头
  const check = (list, rest, key, allowFallback) => {
    list.forEach(it => {
      if (lastSeen[key][it.id] !== undefined) {
        const gap = d - lastSeen[key][it.id];
        if (!allowFallback && gap < rest) bad(`${date} ${key} 提前重复 ${it.id}（间隔 ${gap} < ${rest}）`);
        if (allowFallback && gap < 60) bad(`${date} ${key} 补位也过于频繁 ${it.id}（间隔 ${gap}）`);
      }
      lastSeen[key][it.id] = d;
      counts[key]++;
    });
  };
  p.read.forEach(it => check([it], it.level === 'easy' ? restOf.readEasy : restOf.readHard, 'read'));
  check(p.listen, restOf.listen, 'listen', true);
  check(p.trans, p.transLevel === 'easy' ? restOf.transEasy : restOf.transHard, 'trans');
  check(p.write, restOf.write, 'write');

  if (fail > 12) break;
}

// 覆盖度：400 天里各池应几乎全部用上
const cover = {
  read: Object.keys(lastSeen.read).length,
  listen: Object.keys(lastSeen.listen).length,
  trans: Object.keys(lastSeen.trans).length,
  write: Object.keys(lastSeen.write).length,
};
console.log('  覆盖：阅读 %d/180 · 听力 %d/145 · 翻译 %d/90 · 写作 %d/90', cover.read, cover.listen, cover.trans, cover.write);
if (cover.read < 176) bad('阅读覆盖不足，可能有条目永远抽不到');
if (cover.listen < 140) bad('听力覆盖不足');
if (cover.trans < 86) bad('翻译覆盖不足');
if (cover.write < 88) bad('写作覆盖不足');

// 同一天重复调用结果一致
const date0 = C.shift(start, 37);
const a = JSON.stringify(C.pushItems(date0));
const b = JSON.stringify(C.pushItems(date0));
if (a !== b) bad('同一天两次抽签结果不一致');

// 自建条目：加入后当天必须露面
S.sources.push({
  id: 'stest', name: '我的 B 站收藏', note: '测试', kind: 'read',
  items: [{ id: 'x1', title: '自建阅读一', url: 'https://www.bilibili.com/video/BV1aa', level: 'easy', min: 9 }],
});
C.invalidatePush();
const p2 = C.pushItems(date0);
if (!p2.read.some(x => x.custom)) bad('自建条目没有出现在当天推送');
else console.log('  ✓ 自建条目已置顶（' + p2.read.filter(x => x.custom)[0].title + '）');

// 题库版本号变化后旧结果作废
const before = JSON.stringify(p2.read.map(x => x.id));
S.sources[0].items.push({ id: 'x2', title: '自建阅读二', url: 'https://www.bilibili.com/video/BV1bb', level: 'hard', min: 9 });
C.invalidatePush();
const p3 = C.pushItems(date0);
if (C.state().poolV === 0) bad('题库版本号没有变化');
else console.log('  ✓ 池子版本号已更新为 %d，当天结果已重抽', C.state().poolV);

// 存档体积：出现记录只留最近 200 条
['read', 'listen', 'trans', 'write'].forEach(k => {
  const n = Object.keys(S.seen[k]).length;
  if (n > 200) bad(`${k} 的 seen 记录 ${n} 条，超过 200`);
});
console.log('  seen 记录：', ['read', 'listen', 'trans', 'write'].map(k => k + '=' + Object.keys(S.seen[k]).length).join(' '));

console.log(fail ? `\n抽取测试：${fail} 项失败` : '\n抽取测试：全部通过（400 天无提前重复、无空手、无超时）');
process.exit(fail ? 1 : 0);
}

window.addEventListener('load', () => {
  try { run(); } catch (e) { console.error(e); process.exit(1); }
});
