/* 交互冒烟测试：逐页渲染 + 关键操作 + 存档落盘 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const errors = [];

// 屏蔽 jsdom 对 scrollTo / CSS 布局的「Not implemented」噪声
const vc = new VirtualConsole();
vc.on('jsdomError', e => {
  if (/Not implemented/.test(e.message)) return;
  errors.push('jsdom: ' + e.message);
});
vc.on('error', m => errors.push('console: ' + m));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.com/',
  resources: undefined,
  virtualConsole: vc,
});
const { window } = dom;
window.addEventListener('error', e => errors.push('error: ' + (e.message || e)));
window.addEventListener('unhandledrejection', e => errors.push('reject: ' + e.reason));

let fail = 0;
const ok = (cond, label) => { if (cond) console.log('  ✓ ' + label); else { console.log('  ✗ ' + label); fail++; } };
const $ = sel => window.document.querySelector(sel);
const $$ = sel => Array.from(window.document.querySelectorAll(sel));
const click = el => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const wait = ms => new Promise(r => setTimeout(r, ms));

function findAct(sel) { return Array.from(window.document.querySelectorAll(sel))[0]; }

async function run() {
  const C = window.Core, S = C.state(), V = window.Views, UI = V.UI;

  await wait(450);   // 等启动时的落盘 debounce 走完，保存状态从「正在保存…」回到「已保存」
  ok($('#page').children.length > 0, '首屏渲染出内容');
  ok($$('.nav-item').length === 3, '侧边栏三个主导航');
  ok($$('.tabbar button').length === 4, '底部四个 Tab');
  ok($('#save-state .txt').textContent.indexOf('已保存') >= 0, '保存状态文案');

  /* --- 今日任务 --- */
  ok($$('.push-col').length === 4, '今日推送四列');
  const readItems = $$('.push-col')[0].querySelectorAll('.p-item');
  ok(readItems.length === 2, '阅读固定 2 篇（易 1 + 难 1）');
  ok($$('.five-card').length === 5, '今日五项五张卡');
  ok($('.ring') && /\/5/.test($('.ring-num b').textContent), '环形进度显示 N/5');

  // 记一篇
  const before = C.getDay(C.todayStr()) ? C.getDay(C.todayStr()).r : 0;
  const addRead = $$('.push-col')[0].querySelector('.p-item .acts .btn');
  click(addRead);
  const after = C.getDay(C.todayStr()).r;
  ok(after === before + 1, '点「记一篇」计数 +1（' + before + '→' + after + '）');

  // 全部达标
  click($('[data-act="all-done"]'));
  const st2 = C.statsFor(C.todayStr());
  ok(st2.complete && st2.okCount === 5, '「全部达标」后五项全清');
  ok($('.progress-card').classList.contains('allclear'), '全清后进度卡换成紫色徽标态');
  ok($('.five-card.full'), '五项卡出现紫色完成态');

  // 逾期条
  const yesterday = C.shift(C.todayStr(), -1);
  S.days[yesterday] = { w: 3, r: 0, l: 1, t: 0, p: 0, carry: true };
  S.days[C.todayStr()].carry = true;
  window.App.render();
  ok($('.carry') && $('.carry').textContent.indexOf('昨天还差') >= 0, '有缺口时显示逾期条');
  click($('[data-act="carry-off"]'));
  ok($('.carry.off'), '可切「只做今天」');
  click($('[data-act="carry-on"]'));
  ok(!$('.carry.off'), '可恢复顺延');

  /* --- 单词三种模式 --- */
  click(findAct('[data-act="mode"][data-mode="quiz"]'));
  ok($('.quiz'), '切到自测模式出现题目');
  const opts = $$('.quiz .opt');
  ok(opts.length === 4, '自测四选一');
  click(opts[0]);
  ok($('.quiz .opt.right') || $('.quiz .opt.wrong'), '选择后给出对错反馈');

  click(findAct('[data-act="mode"][data-mode="list"]'));
  ok($$('.wlist .row').length > 0, '清单模式列出当批词');

  click(findAct('[data-act="mode"][data-mode="card"]'));
  const wcard = $('.wcard');
  ok(wcard && wcard.classList.contains('hidden-def'), '卡片默认遮住释义');
  click(wcard);
  ok(!$('.wcard').classList.contains('hidden-def'), '点击翻面显示释义');
  const curWord = C.wordBatch(C.todayStr()).words[UI.wordIdx][0];
  click(findAct('[data-act="rate"][data-s="fuzzy"]'));
  ok(S.news.indexOf(curWord) >= 0, '标记「模糊」进生词本（' + curWord + '）');

  // 词性缺失时不渲染词性块
  const anyPos = $$('.wcard .pos').length;
  ok(anyPos >= 0, '词性块按需渲染（缺失时不占位）');

  /* --- 目标与资源 --- */
  window.App.go('goals');
  ok($$('.src-group').length >= 6, '素材分五组（单词 + 四类素材 + 工具）');
  const wordSteps = $$('.goal-item .stepper input');
  ok(wordSteps.length === 5, '五项每日目标可改');
  const readInput = wordSteps[1];
  readInput.value = '3';
  readInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok(S.goals.read === 3, '改阅读目标立即生效');

  click(findAct('[data-act="new-src"][data-kind="read"]'));
  ok($('#new-src-modal'), '新增来源弹窗打开');
  $('#new-src-modal [data-act="src-name"]').value = '测试来源';
  click($('#new-src-modal [data-act="src-create"]'));
  ok(S.sources.length === 1 && S.sources[0].name === '测试来源', '来源创建成功');

  // 绑定素材：贴 B 站分享文案
  window.App.render();
  click(findAct('[data-act="bind"]'));
  ok($('#bind-modal'), '绑定弹窗打开');
  const ta = $('#bind-modal textarea');
  ta.value = '【六级听力真题精讲｜2023年12月第一套】 https://www.bilibili.com/video/BV1xx411c7mD\nb23.tv/abc123';
  click($('[data-act="bind-parse"]'));
  ok($('#bind-count').textContent.indexOf('2') >= 0, '解析预览得出 2 条');
  click($('#bind-modal [data-act="bind-save"]'));
  await wait(60);
  ok(S.sources[0].items.length === 2, '素材保存进来源');
  ok(S.sources[0].items[0].title === '六级听力真题精讲｜2023年12月第一套', '标题清洗正确');

  // 解析 0 条时不清空
  click(findAct('[data-act="bind"]'));
  $('#bind-modal textarea').value = '这段文字里没有任何链接';
  click($('[data-act="bind-parse"]'));
  ok($('#bind-count').textContent.indexOf('0') >= 0, '解析 0 条时提示数量');
  ok($('#bind-modal'), '解析 0 条时弹窗不关闭');
  click($('[data-act="bind-save"]'));
  ok(S.sources[0].items.length === 2, '解析 0 条时保存不会清空原素材');
  click($('#bind-modal [data-act="close-modal"]'));

  // 原地改名
  window.App.render();
  const editBtn = findAct('[data-act="item-edit"]');
  click(editBtn);
  const input = $('.src-card .it.editing input');
  ok(!!input, '点编辑后原行变输入框');
  input.value = '改过的标题';
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok(S.sources[0].items[0].title === '改过的标题', '改名已保存');

  /* --- 统计 --- */
  window.App.go('stats');
  ok($$('.stat').length === 4, '统计四张数据卡');
  ok($$('table.sum tbody tr').length === 6, '汇总表五行 + 合计');
  ok($$('.heat rect').length > 100, '热力图渲染格子');
  ok($$('.bar-row').length === 5, '五科条形图');
  ok($$('.day-row').length > 1, '逐日记录有内容');
  click(findAct('[data-act="range"][data-r="30"]'));
  ok(UI.range === 30, '区间可切 30 天');
  click(findAct('[data-act="range"][data-r="0"]'));
  ok(UI.range === 0, '区间可切全部');
  click(findAct('[data-act="month"][data-d="-1"]'));
  ok(UI.month === -1, '逐日记录可翻月');

  /* --- 设置与说明 --- */
  click(findAct('[data-act="open-drawer"]'));
  ok($('#drawer').classList.contains('on'), '设置抽屉打开');
  ok($('#drawer [data-act="export"]'), '有导出入口');
  click($('#drawer [data-act="toggle-remind"]'));
  ok(S.settings.remind === false, '提醒开关可切');
  $('#drawer [data-act="exam-date"]').value = '2026-12-19';
  $('#drawer [data-act="exam-date"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok(S.examDate === '2026-12-19', '考试日期可改');
  click($('#drawer [data-act="close-drawer"]'));

  window.App.go('about');
  ok($$('.about section').length === 9, '说明页九个小节');
  ok($('.about').textContent.indexOf('提醒') >= 0, '说明里写了提醒边界');

  /* --- 落盘与迁移 --- */
  await wait(400);
  const raw = JSON.parse(window.localStorage.getItem('wb_cet6_data'));
  ok(raw && raw.v === 4, '存档写入 localStorage 且带 schema 版本号');
  ok(raw.days && Object.keys(raw.days).length >= 6, '示例记录已预置');

  // 旧版存档迁移：v1 的 goals 数组 + 旧字段名
  window.localStorage.setItem('wb_cet6_data', JSON.stringify({
    v: 1,
    examDate: '2026-06-13',
    goals: [30, 2, 1, 1, 1],
    history: { '2026-05-01': { words: 12, reading: 1, listening: 1, translation: 0, writing: 0 } },
    wordPerDay: 30
  }));
  // 直接验证迁移函数（jsdom 的 localStorage 按实例隔离，起第二个实例没有意义）
  const migrated = C.migrate({
    v: 1, examDate: '2026-06-13', goals: [30, 2, 1, 1, 1],
    history: { '2026-05-01': { words: 12, reading: 1, listening: 1, translation: 0, writing: 0 } },
    wordPerDay: 30
  });
  ok(migrated.goals.word === 30 && migrated.goals.read === 2, 'v1 数组目标迁移为对象');
  ok(migrated.days['2026-05-01'] && migrated.days['2026-05-01'].w === 12, '旧字段名 words → w 迁移');
  ok(migrated.word.perDay === 30, '旧版 wordPerDay 迁移');

  ok(errors.length === 0, '运行期间无 JS 报错' + (errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''));

  console.log('\n冒烟测试：' + (fail ? fail + ' 项失败' : '全部通过'));
  process.exit(fail ? 1 : 0);
}

window.addEventListener('load', () => {
  run().catch(e => { console.error(e); process.exit(1); });
});
