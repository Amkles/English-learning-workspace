/* ===========================================================
   六级打卡台 · CET-6 Daily
   视图层：今日 / 目标 / 统计 / 设置 / 说明
   =========================================================== */
(function (global) {
  'use strict';

  var C = global.Core;
  var esc = C.esc, I = C.ICONS;

  var UI = {
    route: 'today',
    wordIdx: 0,
    flipped: false,
    quiz: null,
    range: 90,
    month: 0,
    expanded: {},
    editing: null
  };

  function state() { return C.state(); }
  function stars(n) {
    var out = '';
    for (var i = 0; i < 5; i++) out += '<span style="opacity:' + (i < n ? 1 : .22) + '">' + I.star + '</span>';
    return '<span class="stars">' + out + '</span>';
  }
  function searchUrl(item) {
    var q = (item.title || '') + ' ' + (item.src || '');
    if (/bilibili|B站/i.test(item.src || '') || /bilibili\.com|b23\.tv/.test(item.url || '')) {
      return 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(item.title || '');
    }
    return 'https://www.bing.com/search?q=' + encodeURIComponent(q.trim());
  }

  /* =========================================================
     今日
     ========================================================= */
  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return '还在熬';
    if (h < 11) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  function renderToday() {
    var today = C.todayStr();
    var st = state();
    var s = C.statsFor(today);
    var carry = C.carryGaps(today);
    var left = C.examDaysLeft();

    var html = '';
    html += '<div class="top">' +
      '<div><h1>' + greeting() + '，今天也按计划来</h1>' +
      '<div class="sub">' + C.dateCN(today) + ' · 距考试 <b style="color:var(--pink-dark)">' +
      (left > 0 ? left + ' 天' : left === 0 ? '就是今天' : '已过 ' + (-left) + ' 天') + '</b></div></div>' +
      '<div class="top-right">' +
      '<span class="chip">' + I.calendar + '考试日 <b>' + st.examDate + '</b></span>' +
      '<span class="chip">' + I.target + '今日达标 <b>' + s.okCount + ' / 5</b></span>' +
      '</div></div>';

    if (state().settings.remind && !s.complete) {
      var now = new Date();
      var hm = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
      if (hm >= (state().settings.at || '20:30')) {
        html += '<div class="remind">' + I.bell + '<span>已过提醒时间 <b>' + state().settings.at + '</b>，今天还差 ' +
          (5 - s.okCount) + ' 项没清。这个提醒只在打开页面时出现，不会后台推送。</span>' +
          '<button data-act="remind-close">知道了</button></div>';
      }
    }

    html += carryBar(carry);
    html += progressCard(s, today);
    html += wordBlock(today);
    html += pushGrid(today);
    html += fiveCards(s, today);
    return html;
  }

  function carryBar(carry) {
    var st = state();
    var today = C.todayStr();
    var day = C.getDay(today);
    var off = day && day.carry === false;
    if (!carry && !off) return '';
    if (off) {
      return '<div class="carry off">' + I.info +
        '<span class="grow">今天只按原目标算，昨天的缺口不带过来。</span>' +
        '<button data-act="carry-on">恢复顺延</button></div>';
    }
    var parts = [];
    var base = C.baseTargets();
    C.SUBJECTS.forEach(function (sub) {
      if (carry[sub.k] > 0) parts.push(sub.name + ' <b>+' + carry[sub.k] + '</b>');
    });
    return '<div class="carry">' + I.info +
      '<span class="grow">昨天还差：' + parts.join(' · ') + '，已并入今天的目标。</span>' +
      '<button data-act="carry-off">只做今天</button></div>';
  }

  function progressCard(s, today) {
    var r = 34, c = 2 * Math.PI * r;
    var pct = s.okCount / 5;
    var color = s.complete ? '#5B3FA8' : (s.okCount >= 4 ? '#B42557' : s.okCount >= 2 ? '#D84A7B' : '#F2A6C6');
    var dots = C.SUBJECTS.map(function (sub) {
      var it = s.items.filter(function (x) { return x.k === sub.k; })[0];
      return '<span class="fd ' + (it.ok ? 'ok' : '') + '"><i style="' + (it.ok ? 'background:' + sub.color : '') + '"></i>' +
        sub.name + ' ' + it.done + '/' + it.target + '</span>';
    }).join('');

    return '<div class="progress-card card ' + (s.complete ? 'allclear' : '') + '">' +
      '<div class="ring"><svg viewBox="0 0 84 84">' +
      '<circle cx="42" cy="42" r="' + r + '" fill="none" stroke="#F6E3EB" stroke-width="8"/>' +
      '<circle cx="42" cy="42" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="8" stroke-linecap="round" ' +
      'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - pct)).toFixed(1) + '"/>' +
      '</svg><div class="ring-num"><b>' + s.okCount + '/5</b><span>项达标</span></div></div>' +
      '<div class="progress-body">' +
      (s.complete
        ? '<span class="badge-clear">' + I.checkCircle + '今日五项全清</span>'
        : '<h3>今日已达标 ' + s.okCount + ' / 5 项</h3>') +
      '<div class="line">' + (s.complete ? '这一天的记录已经写进统计，明天继续保持。' :
        '五项全部达标才算当天打卡成功，差一项也不算。') + '</div>' +
      '<div class="five-dots">' + dots + '</div></div>' +
      '<div class="progress-actions">' +
      '<button class="btn ghost" data-act="copy-list">' + I.copy + '复制文案</button>' +
      '<button class="btn" data-act="all-done">' + I.check + '全部达标</button>' +
      '</div></div>';
  }

  /* ---------------- 单词区 ---------------- */
  function wordBlock(today) {
    var st = state();
    var b = C.wordBatch(today);
    var mode = st.word.mode || 'card';
    var libName = C.LIB_META[st.word.lib] ? C.LIB_META[st.word.lib].name : '词库';

    var libChips = C.LIB_ORDER.map(function (k) {
      var n = C.libCount(k);
      return '<button class="btn mini ' + (st.word.lib === k ? '' : 'ghost') + '" data-act="lib" data-lib="' + k + '">' +
        C.LIB_META[k].name + ' <span style="opacity:.6">' + n + '</span></button>';
    }).join(' ');

    var perBtns = C.WORD_OPTIONS.map(function (n) {
      return '<button data-act="perday" data-n="' + n + '" class="' + (st.word.perDay === n ? 'on' : '') + '">' + n + '</button>';
    }).join('');

    var modeBtns = [['card', '卡片', I.cards], ['quiz', '自测', I.quiz], ['list', '清单', I.list]].map(function (m) {
      return '<button data-act="mode" data-mode="' + m[0] + '" class="' + (mode === m[0] ? 'on' : '') + '">' + m[1] + '</button>';
    }).join('');

    var range = b.total
      ? ('第 <b>' + b.from + '</b>–<b>' + b.to + '</b> 词' + (b.wraps ? '（到末尾回开头）' : ''))
      : '词库为空';

    var html = '<div class="sec-head"><h2>' + I.book + '今日推送 · 单词</h2>' +
      '<span class="hint">' + libName + ' · 第 ' + b.batchNo + ' / ' + b.batches + ' 批</span></div>' +
      '<div class="card word-block">' +
      '<div class="word-head">' +
      '<h3>单词 <span class="tag">' + b.total + ' 词</span></h3>' +
      '<div class="seg">' + perBtns + '</div>' +
      '<div class="seg">' + modeBtns + '</div>' +
      '<div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">' + libChips + '</div>' +
      '</div>' +
      '<div class="word-meta">当前库 <b>' + libName + '</b> · 第 <b>' + b.batchNo + '</b> / ' + b.batches + ' 批 · ' + range +
      ' · 今日已记 <b>' + (C.getDay(today) ? C.getDay(today).w : 0) + '</b> 词 · 生词本 <b>' + state().news.length + '</b></div>';

    if (!b.words.length) {
      html += '<div class="empty" style="padding:20px 0;color:var(--ink-3);font-size:13px">这个词库还没有词，换一个库试试。</div>';
    } else if (mode === 'quiz') {
      html += quizBlock(b);
    } else if (mode === 'list') {
      html += listBlock(b);
    } else {
      html += cardBlock(b);
    }
    html += '</div>';
    return html;
  }

  function markOf(word) {
    var m = state().marks[word];
    return m && m.s ? m.s : '';
  }

  function cardBlock(b) {
    if (UI.wordIdx >= b.words.length) UI.wordIdx = 0;
    var w = b.words[UI.wordIdx];
    var word = w[0], phon = w[1], pos = w[2], defs = w[3] || [];
    var hint = C.suffixHint(word, pos);
    var mk = markOf(word);

    var h = '<div class="wcard ' + (UI.flipped ? '' : 'hidden-def') + '" data-act="flip">' +
      '<div class="flip-tip">' + (UI.flipped ? '点击收起释义' : '点击卡片翻面') + '</div>' +
      '<div class="w">' + esc(word) +
      '<button class="speak" data-act="speak" data-w="' + esc(word) + '" title="朗读">' + I.volume + '</button>' +
      (mk ? '<span class="pos" style="background:#F6F1F3;color:var(--ink-3)">' +
        (mk === 'known' ? '已认识' : mk === 'fuzzy' ? '模糊' : '不熟') + '</span>' : '') +
      '</div>' +
      '<div class="phon">' + (phon ? '/' + esc(phon) + '/' : '音标缺失') + '</div>' +
      (pos ? '<div style="margin-top:8px"><span class="pos">' + esc(pos) + '</span></div>' : '') +
      '<div class="defs">' + defs.map(function (d) { return '<span>' + esc(d) + '</span>'; }).join('') + '</div>' +
      (hint ? '<div class="suffix">词缀提示：' + esc(hint) + '</div>' : '') +
      '</div>';

    h += '<div class="wcard-foot">' +
      '<button class="btn ghost mini" data-act="wprev">上一词</button>' +
      '<span class="small muted">' + (UI.wordIdx + 1) + ' / ' + b.words.length + '</span>' +
      '<button class="btn ghost mini" data-act="wnext">下一词</button>' +
      '<span class="small muted" style="margin-left:auto">' + (UI.flipped ? '按自评记录，模糊/不熟自动进生词本' : '先自己在心里释义，再翻面') + '</span>' +
      '</div>';

    h += '<div class="rate-row">' +
      '<button class="rate-btn k" data-act="rate" data-s="known">' + I.check + '认识</button>' +
      '<button class="rate-btn f" data-act="rate" data-s="fuzzy">' + I.info + '模糊</button>' +
      '<button class="rate-btn u" data-act="rate" data-s="unknown">' + I.close + '不熟</button>' +
      '</div>';
    return h;
  }

  function quizBlock(b) {
    if (!UI.quiz || UI.quiz.idx >= b.words.length) {
      UI.quiz = buildQuiz(b, UI.wordIdx);
    }
    var q = UI.quiz;
    if (!q) return '<div class="small muted">这个词库暂时出不了题。</div>';
    var w = q.word;
    var h = '<div class="quiz"><div class="qword">' + esc(w[0]) +
      ' <button class="speak" data-act="speak" data-w="' + esc(w[0]) + '">' + I.volume + '</button></div>' +
      '<div class="phon small muted">' + (w[1] ? '/' + esc(w[1]) + '/' : '') + (w[2] ? ' · ' + esc(w[2]) : '') + '</div>';
    q.options.forEach(function (opt, i) {
      var cls = '';
      if (q.answered !== null) {
        if (i === q.answer) cls = 'right';
        else if (i === q.answered) cls = 'wrong';
      }
      h += '<button class="opt ' + cls + '" data-act="quiz" data-i="' + i + '"><b>' + 'ABCD'[i] + '</b><span>' + esc(opt) + '</span></button>';
    });
    if (q.answered !== null) {
      h += '<div class="small" style="margin-top:4px;color:' + (q.correct ? '#2F7A50' : 'var(--pink-dark)') + '">' +
        (q.correct ? '答对了，记一个。' : '答错，已加入生词本。正确答案：' + esc(q.options[q.answer])) + '</div>' +
        '<div><button class="btn mini" data-act="quiz-next">下一个</button></div>';
    }
    h += '</div>';
    return h;
  }

  function buildQuiz(b, startIdx) {
    var st = state();
    var list = b.words;
    if (!list.length) return null;
    var idx = startIdx % list.length;
    var w = list[idx];
    var correct = (w[3] && w[3][0]) || '（无释义）';
    var pool = C.libList(st.word.lib);
    var opts = [correct];
    var seed = C.hash32(w[0] + '|' + idx);
    var shuffled = C.shuffle(pool, seed);
    for (var i = 0; i < shuffled.length && opts.length < 4; i++) {
      var cand = C.DB.vocab.words[shuffled[i]];
      if (!cand) continue;
      var d = (cand[3] && cand[3][0]) || '';
      if (d && opts.indexOf(d) < 0) opts.push(d);
    }
    while (opts.length < 4) opts.push('（选项不足）');
    var order = C.shuffle(opts, seed + 7);
    return { word: w, options: order, answer: order.indexOf(correct), answered: null, correct: false, idx: idx };
  }

  function listBlock(b) {
    var h = '<div class="wlist">';
    b.words.forEach(function (w) {
      var mk = markOf(w[0]);
      h += '<div class="row"><i class="' + (mk ? mk.charAt(0) : '') + '"></i>' +
        '<span title="' + esc((w[3] || []).join('；')) + '">' + esc(w[0]) + '</span>' +
        '<span class="small muted" style="margin-left:auto;overflow:hidden;text-overflow:ellipsis">' + esc((w[3] || [])[0] || '') + '</span></div>';
    });
    h += '</div><div class="small muted" style="margin-top:10px">绿点=认识 · 黄点=模糊 · 粉点=不熟。点「卡片」可以逐词自评。</div>';
    return h;
  }

  /* ---------------- 四列推送 ---------------- */
  function pushGrid(today) {
    var p = C.pushItems(today);
    var day = C.getDay(today) || { r: 0, l: 0, t: 0, p: 0 };
    var html = '<div class="sec-head"><h2>' + I.spark + '今日推送</h2>' +
      '<span class="hint">同一天刷新内容不变 · 换题库会自动重抽</span></div>' +
      '<div class="push-grid">';

    // 阅读
    html += '<div class="push-col"><header><span class="bar" style="background:#A8447F"></span>' +
      '<h4>阅读 · 2 篇</h4><span class="cnt">易 1 + 难 1</span></header><div class="body">';
    if (!p.read.length) html += emptyHint('阅读池为空');
    p.read.forEach(function (it, i) {
      html += readItem(it, i, day.r > i, 'r');
    });
    html += '</div></div>';

    // 听力
    html += '<div class="push-col"><header><span class="bar" style="background:#6E5AA8"></span>' +
      '<h4>听力 · 1–2 个</h4><span class="cnt">累计 ≤30 分钟</span></header><div class="body">';
    if (!p.listen.length) html += emptyHint('听力池为空');
    p.listen.forEach(function (it, i) {
      html += listenItem(it, i, day.l > i, 'l');
    });
    html += '</div></div>';

    // 翻译
    html += '<div class="push-col"><header><span class="bar" style="background:#D9822B"></span>' +
      '<h4>翻译 · 1 段</h4><span class="cnt">' + (p.transLevel === 'easy' ? '今天排易档' : '今天排难档') + '</span></header><div class="body">';
    if (!p.trans.length) html += emptyHint('翻译池为空');
    p.trans.forEach(function (it, i) { html += transItem(it, i, day.t > i, 't'); });
    html += '</div></div>';

    // 写作
    html += '<div class="push-col"><header><span class="bar" style="background:#E0629B"></span>' +
      '<h4>写作 · 1 题</h4><span class="cnt">' + p.write.length + ' 题</span></header><div class="body">';
    if (!p.write.length) html += emptyHint('写作池为空');
    p.write.forEach(function (it, i) { html += writeItem(it, i, day.p > i, 'p'); });
    html += '</div></div>';

    html += '</div>';
    return html;
  }

  function emptyHint(t) {
    return '<div class="small muted" style="padding:8px 2px">' + t + '</div>';
  }

  function acts(kind, done, k, n, label) {
    return '<div class="acts">' +
      '<button class="btn mini ' + (done ? 'soft' : '') + '" data-act="add" data-k="' + k + '" data-n="' + n + '">' +
      (done ? I.check : I.plus) + label + '</button>' +
      '</div>';
  }

  function readItem(it, i, done, k) {
    var star = it.stars || (it.level === 'hard' ? 4 : 3);
    var lv = it.level === 'hard' ? '难' : '易';
    return '<div class="p-item ' + (done ? 'done' : '') + '">' +
      '<div class="row1"><span class="idx">' + (i + 1) + '</span>' +
      '<span class="plat">' + esc(it.src) + '</span>' +
      '<span class="plat" style="background:#FBF2F6;border-color:#F3D6E2;color:#A8447F">' + lv + '</span>' +
      (done ? '<span class="done-tag">' + I.check + '已读</span>' : '') +
      '</div>' +
      '<div class="ti">' + esc(it.title) + '</div>' +
      '<div class="meta">' + stars(star) + '<span>' + star + ' 星</span><span>' + (it.min || 8) + ' 分钟</span></div>' +
      '<div class="acts">' +
      '<a class="link-btn" href="' + esc(it.url) + '" target="_blank" rel="noopener">' + I.link + '直达原文</a>' +
      '<a class="link-btn" style="background:#F6F1F3;color:var(--ink-2)" href="' + esc(searchUrl(it)) + '" target="_blank" rel="noopener">' + I.search + '搜同题</a>' +
      '<button class="btn mini ' + (done ? 'soft' : 'ghost') + '" style="margin-left:auto" data-act="add" data-k="' + k + '" data-n="1">' +
      (done ? I.check : I.plus) + '记一篇</button></div></div>';
  }

  function listenItem(it, i, done, k) {
    return '<div class="p-item ' + (done ? 'done' : '') + '">' +
      '<div class="row1"><span class="idx">' + (i + 1) + '</span>' +
      '<span class="plat">' + esc(it.src) + '</span>' +
      (done ? '<span class="done-tag">' + I.check + '已听</span>' : '') + '</div>' +
      '<div class="ti">' + esc(it.title) + '</div>' +
      '<div class="meta"><span>' + I.clock + '</span><span>' + (it.min || 12) + ' 分钟</span>' +
      (it.custom ? '<span>自建素材</span>' : '') + '</div>' +
      '<div class="acts">' +
      '<a class="link-btn" href="' + esc(it.url) + '" target="_blank" rel="noopener">' + I.link + '去听</a>' +
      '<a class="link-btn" style="background:#F6F1F3;color:var(--ink-2)" href="' + esc(searchUrl(it)) + '" target="_blank" rel="noopener">' + I.search + '搜同题</a>' +
      '<button class="btn mini ' + (done ? 'soft' : 'ghost') + '" style="margin-left:auto" data-act="add" data-k="' + k + '" data-n="1">' +
      (done ? I.check : I.plus) + '记一个</button></div></div>';
  }

  function transItem(it, i, done, k) {
    if (it.custom) {
      return '<div class="p-item ' + (done ? 'done' : '') + '">' +
        '<div class="row1"><span class="idx">' + (i + 1) + '</span><span class="plat">' + esc(it.src) + '</span></div>' +
        '<div class="ti">' + esc(it.title) + '</div>' +
        '<div class="small muted" style="margin-top:6px">自建素材：打开后自己抄写并翻译。</div>' +
        '<div class="acts"><a class="link-btn" href="' + esc(it.url) + '" target="_blank" rel="noopener">' + I.link + '打开原文</a>' +
        '<button class="btn mini" style="margin-left:auto" data-act="add" data-k="' + k + '" data-n="1">' + I.plus + '记一段</button></div></div>';
    }
    return '<div class="p-item ' + (done ? 'done' : '') + '">' +
      '<div class="row1"><span class="idx">' + (i + 1) + '</span><span class="plat">' + esc(it.title || '翻译') + '</span>' +
      '<span class="plat" style="background:#FDF3E8;border-color:#F2DEC4;color:#B36B1E">' + (it.level === 'hard' ? '难' : '易') + '</span>' +
      (done ? '<span class="done-tag">' + I.check + '已译</span>' : '') + '</div>' +
      '<div class="zh text-body">' + esc(it.zh) + '</div>' +
      '<details><summary>' + I.arrow + '参考译文与难点</summary>' +
      '<div class="en">' + esc(it.en) + '</div>' +
      '<ul class="tips">' + (it.tip || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '</details>' +
      '<div class="acts"><button class="btn mini ' + (done ? 'soft' : 'ghost') + '" data-act="add" data-k="' + k + '" data-n="1">' +
      (done ? I.check : I.plus) + '记一段</button></div></div>';
  }

  function writeItem(it, i, done, k) {
    if (it.custom) {
      return '<div class="p-item ' + (done ? 'done' : '') + '">' +
        '<div class="row1"><span class="idx">' + (i + 1) + '</span><span class="plat">' + esc(it.src) + '</span></div>' +
        '<div class="ti">' + esc(it.title) + '</div>' +
        '<div class="small muted" style="margin-top:6px">自建素材：按链接里的题目自己写。</div>' +
        '<div class="acts"><a class="link-btn" href="' + esc(it.url) + '" target="_blank" rel="noopener">' + I.link + '打开题目</a>' +
        '<button class="btn mini" style="margin-left:auto" data-act="add" data-k="' + k + '" data-n="1">' + I.plus + '记一题</button></div></div>';
    }
    return '<div class="p-item ' + (done ? 'done' : '') + '">' +
      '<div class="row1"><span class="idx">' + (i + 1) + '</span><span class="plat">' + esc(it.tp) + '</span>' +
      '<span class="plat" style="background:#FDEFF5;border-color:#F5D2E2;color:#C0457A">' + esc(it.title) + '</span>' +
      (done ? '<span class="done-tag">' + I.check + '已写</span>' : '') + '</div>' +
      '<div class="text-body">' + esc(it.dir) + '</div>' +
      '<details><summary>' + I.arrow + '提纲 / 框架 / 范文</summary>' +
      '<div class="small" style="margin-top:6px;color:var(--ink-3)">三点提纲</div>' +
      '<ol class="ol">' + (it.ol || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
      '<div class="small" style="margin-top:8px;color:var(--ink-3)">三段框架</div>' +
      '<ol class="ol">' + (it.fr || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
      '<div class="small" style="margin-top:8px;color:var(--ink-3)">范文</div>' +
      '<div class="sample">' + esc(it.es) + '</div>' +
      '<div class="small" style="margin-top:8px;color:var(--ink-3)">可替换词组</div>' +
      '<ul class="tips">' + (it.ph || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '</details>' +
      '<div class="acts"><button class="btn mini ' + (done ? 'soft' : 'ghost') + '" data-act="add" data-k="' + k + '" data-n="1">' +
      (done ? I.check : I.plus) + '记一题</button></div></div>';
  }

  /* ---------------- 五项 ---------------- */
  function fiveCards(s, today) {
    var h = '<div class="sec-head"><h2>' + I.checkCircle + '今日五项</h2>' +
      '<span class="hint">达标 1→4 项颜色逐级加深，五项全清转紫</span></div><div class="five">';
    s.items.forEach(function (it) {
      var lv = it.ok ? 4 : Math.min(3, Math.floor(it.pct * 3));
      var cls = 'five-card ' + (it.ok ? 'ok lv' + lv : 'lv' + lv) + (it.ok ? ' full' : '');
      h += '<div class="' + cls + '">' +
        '<div class="top-row"><span class="name"><i style="background:' + it.color + '"></i>' + it.name + '</span>' +
        (it.ok ? '<span class="done-tag" style="color:' + (it.ok ? 'var(--purple)' : '') + '">' + I.check + '达标</span>' : '') + '</div>' +
        '<div class="num">' + it.done + '<small> / ' + it.target + '</small></div>' +
        '<div class="gap">' + (it.gap > 0 ? '还差 ' + it.gap + ' ' + it.unit : '已完成') + '</div>' +
        '<div class="bar"><span style="width:' + (it.pct * 100).toFixed(0) + '%"></span></div>' +
        '<div class="acts">' +
        '<button data-act="add" data-k="' + it.k + '" data-n="1">+1</button>' +
        '<button data-act="fill" data-k="' + it.k + '">一键达标</button>' +
        '</div></div>';
    });
    h += '</div>';
    return h;
  }

  /* =========================================================
     目标与资源
     ========================================================= */
  function renderGoals() {
    var st = state();
    var g = st.goals;
    var h = '<div class="top"><div><h1>目标与资源</h1>' +
      '<div class="sub">改完当天立即生效；调大目标只要求自己补到该数量，不会多推内容</div></div></div>';

    h += '<div class="sec-head"><h2>' + I.goal + '每日单词量</h2><span class="hint">当前 ' + st.word.perDay + ' 词</span></div>' +
      '<div class="card card-pad"><div class="seg">' +
      C.WORD_OPTIONS.map(function (n) {
        return '<button data-act="perday" data-n="' + n + '" style="min-height:40px;padding:0 14px" class="' +
          (st.word.perDay === n ? 'on' : '') + '">' + n + '</button>';
      }).join('') + '</div>' +
      '<div class="small muted" style="margin-top:10px">单词目标通常与每日单词量一致；两者可以不同，推送数量只看这里的每日单词量。</div></div>';

    h += '<div class="sec-head"><h2>' + I.checkCircle + '五项每日目标</h2><span class="hint">数字改动实时保存</span></div>' +
      '<div class="card card-pad"><div class="goal-grid">';
    [['word', '单词', '词'], ['read', '阅读', '篇'], ['listen', '听力', '个'], ['trans', '翻译', '段'], ['write', '写作', '题']].forEach(function (x, i) {
      var sub = C.SUBJECTS[i];
      h += '<div class="goal-item"><label><i style="background:' + sub.color + '"></i>' + x[1] + '（' + x[2] + '/天）</label>' +
        '<div class="stepper">' +
        '<button data-act="goal-step" data-k="' + x[0] + '" data-d="-1">−</button>' +
        '<input type="number" min="1" max="200" value="' + g[x[0]] + '" data-act="goal-input" data-k="' + x[0] + '">' +
        '<button data-act="goal-step" data-k="' + x[0] + '" data-d="1">+</button>' +
        '</div></div>';
    });
    h += '</div></div>';

    h += wordSources();
    h += materialGroup('read', '阅读', '篇');
    h += materialGroup('listen', '听力', '条');
    h += materialGroup('trans', '翻译', '段');
    h += materialGroup('write', '写作', '题');
    h += toolsBlock();
    return h;
  }

  function wordSources() {
    var h = '<div class="src-group"><h3><i></i>单词 <span class="n">四个固定词库 + 自建生词</span></h3><div class="src-list">';
    C.LIB_ORDER.forEach(function (k) {
      var meta = C.LIB_META[k];
      var n = C.libCount(k);
      h += '<div class="src-card"><div class="h"><div><div class="name">' + meta.name + '</div>' +
        '<div class="note">' + meta.note + '</div></div>' +
        '<span class="' + (k === 'news' ? 'badge' : 'fixed-badge') + '">' + n + ' 词</span></div>' +
        '<div class="ops">' +
        '<button class="btn mini ' + (state().word.lib === k ? '' : 'ghost') + '" data-act="lib" data-lib="' + k + '">' +
        (state().word.lib === k ? '正在使用' : '切到这个库') + '</button>' +
        (k === 'news' ? '<button class="btn mini ghost" data-act="news-clear">清空生词本</button>' : '') +
        '</div></div>';
    });
    h += '</div></div>';
    return h;
  }

  function materialGroup(kind, name, unit) {
    var builtin = { read: C.DB.reading, listen: C.DB.listening, trans: C.DB.translation, write: C.DB.writing }[kind];
    var custom = state().sources.filter(function (s) { return s.kind === kind; });
    var h = '<div class="src-group"><h3><i></i>' + name + ' <span class="n">内置 ' + (builtin || []).length +
      ' ' + unit + ' · 自建 ' + custom.reduce(function (a, s) { return a + s.items.length; }, 0) + ' ' + unit + '</span></h3><div class="src-list">';

    h += '<div class="src-card"><div class="h"><div><div class="name">内置题库</div>' +
      '<div class="note">随版本更新，不可删除；换题库会自动重抽当天内容</div></div>' +
      '<span class="fixed-badge">' + (builtin || []).length + ' ' + unit + '</span></div>' +
      '<div class="ops"><button class="btn mini ghost" data-act="toggle-src" data-src="builtin-' + kind + '">' +
      (UI.expanded['builtin-' + kind] ? '收起明细' : '查看明细') + '</button></div>' +
      (UI.expanded['builtin-' + kind] ? '<div class="items">' + (builtin || []).slice(0, 60).map(function (it) {
        var title = it.title || it.ti || it.tp || '（无标题）';
        return '<div class="it"><span class="tx">' + esc(title) + '</span>' +
          (it.url ? '<a href="' + esc(it.url) + '" target="_blank" rel="noopener" style="color:var(--ink-3)">' + I.link + '</a>' : '') +
          '</div>';
      }).join('') + ((builtin || []).length > 60 ? '<div class="empty">仅显示前 60 条</div>' : '') + '</div>' : '') +
      '</div>';

    custom.forEach(function (s) {
      var open = UI.expanded[s.id];
      h += '<div class="src-card"><div class="h"><div><div class="name">' + esc(s.name) + '</div>' +
        '<div class="note">' + (s.note ? esc(s.note) : '自建来源') + '</div></div>' +
        '<span class="badge">已绑 ' + s.items.length + ' ' + unit + '</span></div>' +
        '<div class="ops">' +
        '<button class="btn mini ghost" data-act="toggle-src" data-src="' + s.id + '">' + (open ? '收起明细' : '查看明细') + '</button>' +
        '<button class="btn mini" data-act="bind" data-src="' + s.id + '">绑定素材</button>' +
        '<button class="btn mini ghost" data-act="clear-src" data-src="' + s.id + '">清空</button>' +
        '<button class="btn mini ghost" data-act="del-src" data-src="' + s.id + '" style="color:#B3261E">删除来源</button>' +
        '</div>' +
        (open ? '<div class="items">' + (s.items.length ? s.items.map(function (it) {
          var editing = UI.editing === it.id;
          return '<div class="it ' + (editing ? 'editing' : '') + '" data-item="' + it.id + '">' +
            '<span class="tx" title="' + esc(it.title) + '">' + esc(it.title) + '</span>' +
            '<input class="edit" value="' + esc(it.title) + '" data-act="item-input" data-src="' + s.id + '" data-item="' + it.id + '">' +
            '<button data-act="item-edit" data-src="' + s.id + '" data-item="' + it.id + '" title="改名">' + I.edit + '</button>' +
            '<button data-act="item-del" data-src="' + s.id + '" data-item="' + it.id + '" title="删除">' + I.trash + '</button>' +
            '</div>';
        }).join('') : '<div class="empty">还没有素材，点「绑定素材」粘贴分享文案</div>') + '</div>' : '') +
        '</div>';
    });

    h += '<div class="src-card" style="display:flex;align-items:center;justify-content:center;min-height:96px;border-style:dashed">' +
      '<button class="btn ghost mini" data-act="new-src" data-kind="' + kind + '">' + I.plus + '新增来源</button></div>';
    h += '</div></div>';
    return h;
  }

  function toolsBlock() {
    var tools = [
      ['双语新闻', '中国日报英语点津 · 中英对照读新闻', 'https://language.chinadaily.com.cn/thelatest/'],
      ['作文批改', '批改网 · 提交作文看机器反馈', 'https://www.pigai.org/'],
      ['CEFR 写作练习', 'British Council 分级写作练习', 'https://learnenglish.britishcouncil.org/skills/writing']
    ];
    return '<div class="src-group"><h3><i></i>查词与批改 <span class="n">外部站点，新窗口打开</span></h3>' +
      '<div class="tool-links">' + tools.map(function (t) {
        return '<a class="tool" href="' + t[2] + '" target="_blank" rel="noopener">' +
          '<span class="ico">' + I.url + '</span><span><b>' + t[0] + '</b><span>' + t[1] + '</span></span>' +
          '<span class="arrow">' + I.arrow + '</span></a>';
      }).join('') + '</div></div>';
  }

  /* =========================================================
     统计
     ========================================================= */
  function renderStats() {
    var today = C.todayStr();
    var st = C.streak(today);
    var total = C.totalFive();
    var rate = C.weekRate(today);
    var left = C.examDaysLeft();

    var h = '<div class="top"><div><h1>打卡统计</h1>' +
      '<div class="sub">只统计本机存档 · 五项全清才算一天完成</div></div></div>';

    h += '<div class="stat-grid">' +
      statCard(I.flame, '连续天数', st, '天', st > 0 ? '保持住' : '今天开始') +
      statCard(I.checkCircle, '累计五项', total, '项', '所有天数相加') +
      statCard(I.chart, '本周达标率', Math.round(rate * 100), '%', '最近 7 天全清占比') +
      statCard(I.calendar, '距考试', left > 0 ? left : 0, '天', '考试日 ' + state().examDate) +
      '</div>';

    var ranges = [[30, '30 天'], [90, '90 天'], [180, '6 个月'], [0, '全部']];
    h += '<div class="range-bar"><div class="seg">' + ranges.map(function (r) {
      return '<button data-act="range" data-r="' + r[0] + '" class="' + (UI.range === r[0] ? 'on' : '') + '">' + r[1] + '</button>';
    }).join('') + '</div><span class="small muted">汇总表按所选区间算；条形图与热力图口径见说明</span></div>';

    var days = UI.range === 0 ? Math.max(1, C.daysBetween(C.firstRecordDate(), today) + 1) : UI.range;
    var rs = C.rangeStat(days, today);
    h += '<div class="card table-wrap"><table class="sum"><thead><tr>' +
      '<th>板块</th><th>合计</th><th>日均</th><th>达标天数</th></tr></thead><tbody>';
    C.SUBJECTS.forEach(function (s) {
      h += '<tr><td>' + s.name + '</td><td>' + rs.sum[s.k] + '</td><td>' + (rs.sum[s.k] / days).toFixed(1) + '</td>' +
        '<td class="p">' + rs.meet[s.k] + ' / ' + days + '</td></tr>';
    });
    var allSum = C.SUBJECTS.reduce(function (a, s) { return a + rs.sum[s.k]; }, 0);
    h += '<tr><td>五项合计</td><td>' + allSum + '</td><td>' + (allSum / days).toFixed(1) + '</td>' +
      '<td class="p">' + rs.complete + ' 天全清</td></tr>';
    h += '</tbody></table></div>';

    h += heatmap(today);
    h += bars();
    h += dayList();
    return h;
  }

  function statCard(icon, label, v, unit, extra) {
    return '<div class="stat"><div class="lb">' + icon + label + '</div>' +
      '<div class="v">' + v + '<small>' + unit + '</small></div>' +
      '<div class="ex">' + extra + '</div></div>';
  }

  function heatmap(today) {
    var weeks = 26;
    var end = C.parseYmd(today);
    var dow = (end.getDay() + 6) % 7;                 // 周一=0
    var endMonday = C.shift(today, -dow);
    var start = C.shift(endMonday, -(weeks - 1) * 7);
    var cell = 13, gap = 3, w = weeks * (cell + gap), hgt = 7 * (cell + gap);
    var svg = '<svg class="heat" viewBox="0 0 ' + (w + 2) + ' ' + (hgt + 2) + '" width="100%" style="max-width:' + (w + 2) + 'px">';
    var months = [];
    for (var wk = 0; wk < weeks; wk++) {
      for (var d = 0; d < 7; d++) {
        var date = C.shift(start, wk * 7 + d);
        if (C.dayIndex(date) > C.dayIndex(today)) continue;
        var s = C.statsFor(date);
        var n = s.okCount;
        var fill = n === 0 ? '#F7EBF1' : C.COLORS[n - 1];
        svg += '<rect x="' + (wk * (cell + gap)) + '" y="' + (d * (cell + gap)) + '" width="' + cell + '" height="' + cell +
          '" rx="3" fill="' + fill + '"><title>' + date + ' · ' + s.items.map(function (i) { return i.name + i.done + '/' + i.target; }).join(' ') + '</title></rect>';
      }
      var first = C.shift(start, wk * 7);
      var m = C.parseYmd(first).getMonth() + 1;
      if (wk === 0 || (C.parseYmd(C.shift(start, wk * 7)).getDate() <= 7 && months.indexOf(m) < 0)) {
        months.push(m);
        svg += '<text x="' + (wk * (cell + gap)) + '" y="' + (hgt + 12) + '" font-size="9" fill="#9A8190">' + m + '月</text>';
      }
    }
    svg += '</svg>';
    var legend = '<div class="heat-legend"><span>少</span>';
    legend += '<i style="background:#F7EBF1"></i>';
    C.COLORS.forEach(function (c) { legend += '<i style="background:' + c + '"></i>'; });
    legend += '<span>多</span><span style="margin-left:8px">紫色 = 五项全清</span></div>';

    return '<div class="sec-head"><h2>' + I.grid + '每日热力图</h2><span class="hint">最近 26 周 · 一格一天</span></div>' +
      '<div class="card card-pad"><div class="heat-wrap">' + svg + '</div>' + legend + '</div>';
  }

  function bars() {
    var rs = C.subjectRates();
    var h = '<div class="sec-head"><h2>' + I.chart + '各科达标率</h2><span class="hint">按全部记录算，不受区间影响</span></div>' +
      '<div class="card card-pad"><div class="bars">';
    rs.forEach(function (r) {
      h += '<div class="bar-row"><span class="lb"><i style="background:' + r.color + '"></i>' + r.name + '</span>' +
        '<span class="track"><span style="width:' + (r.rate * 100).toFixed(1) + '%;background:' + r.color + '"></span></span>' +
        '<span class="vl">' + Math.round(r.rate * 100) + '%</span></div>';
    });
    h += '</div><div class="small muted" style="margin-top:10px">分母是从第一条记录到今天的天数（含空白天），共 ' +
      (rs[0] ? rs[0].days : 0) + ' 天。</div></div>';
    return h;
  }

  function dayList() {
    var today = C.todayStr();
    var base = C.parseYmd(today);
    var d = new Date(base.getFullYear(), base.getMonth() + UI.month, 1);
    var ym = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
    var canNext = UI.month < 0;
    var canPrev = UI.month > -5;

    var h = '<div class="sec-head"><h2>' + I.list + '逐日记录</h2>' +
      '<div class="month-nav">' +
      '<button class="icon-btn" data-act="month" data-d="-1" ' + (canPrev ? '' : 'disabled style="opacity:.35"') + '>' + I.left + '</button>' +
      '<span class="small" style="min-width:88px;text-align:center">' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月</span>' +
      '<button class="icon-btn" data-act="month" data-d="1" ' + (canNext ? '' : 'disabled style="opacity:.35"') + '>' + I.arrow + '</button>' +
      '</div></div>';

    h += '<div class="card card-pad"><div class="day-list">' +
      '<div class="day-row head"><span>日期</span>' + C.SUBJECTS.map(function (s) { return '<span class="cell">' + s.name + '</span>'; }).join('') +
      '<span class="sum">达标</span></div>';

    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    var rows = 0;
    for (var i = 1; i <= last; i++) {
      var date = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + i).slice(-2);
      if (C.dayIndex(date) > C.dayIndex(today)) continue;
      var s = C.statsFor(date);
      rows++;
      h += '<div class="day-row"><span class="d">' + (d.getMonth() + 1) + '/' + i + ' ' + C.weekdayCN(date).replace('周', '') + '</span>' +
        s.items.map(function (it) {
          return '<span class="cell ' + (it.done === 0 ? 'zero' : it.ok ? 'ok' : '') + '">' + it.done + '</span>';
        }).join('') +
        '<span class="sum ' + (s.complete ? 'full' : '') + '">' + s.okCount + '/5</span></div>';
    }
    if (!rows) h += '<div class="small muted" style="padding:14px 0">这个月还没有记录。</div>';
    h += '</div></div>';
    return h;
  }

  /* =========================================================
     设置抽屉
     ========================================================= */
  function renderSettings() {
    var st = state();
    var h = '<header><h3>设置</h3><button class="icon-btn" data-act="close-drawer">' + I.close + '</button></header><div class="content">';

    h += '<div class="field"><label>考试日期</label>' +
      '<input type="date" value="' + st.examDate + '" data-act="exam-date"></div>';

    h += '<div class="hr"></div>';

    h += '<div class="switch"><label>每日提醒</label>' +
      '<div class="tog ' + (st.settings.remind ? 'on' : '') + '" data-act="toggle-remind"></div></div>' +
      '<div class="field" style="margin-top:12px"><label>提醒时间</label>' +
      '<input type="time" value="' + st.settings.at + '" data-act="remind-at"' + (st.settings.remind ? '' : ' disabled') + '></div>' +
      '<div class="note">只做「打开页面时到点未打卡则提示」，浏览器关掉就不会响。想要真正的推送，请用系统日历或手机闹钟。</div>';

    h += '<div class="hr"></div>';

    h += '<div class="field"><label>导出与备份</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn ghost" data-act="export">' + I.download + '导出 JSON</button>' +
      '<button class="btn ghost" data-act="import">' + I.upload + '导入恢复</button></div>' +
      '<div class="note" style="margin-top:8px">导出文件包含全部打卡记录、生词本与自建素材，可上千条。导入会覆盖当前存档。</div></div>';

    h += '<div class="hr"></div>';

    h += '<div class="field"><label>清理</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn ghost" data-act="clear-sample">清空示例数据</button>' +
      '<button class="btn danger" data-act="clear-all">清空全部数据</button></div>' +
      '<div class="note" style="margin-top:8px">清空示例只删除首次预置的最近 6 天；清空全部会二次确认。</div></div>';

    h += '<div class="hr"></div>';
    h += '<button class="btn soft" style="width:100%" data-act="route" data-route="about">' + I.info + '使用说明与版本信息</button>';
    h += '<div class="note" style="margin-top:14px;text-align:center">存档版本 v' + C.SCHEMA + ' · 题库版本 ' + st.poolV + '</div>';
    h += '</div>';
    return h;
  }

  /* =========================================================
     说明页
     ========================================================= */
  function renderAbout() {
    var st = state();
    var h = '<div class="about">';
    h += '<a class="back" href="#" data-act="route" data-route="today">' + I.left + '返回今日</a>';
    h += '<h1>使用说明</h1><div class="lead">这一页只在需要时看，主界面不放说明文字。</div>';

    h += '<section><h2><span class="no">1</span>每天怎么用</h2>' +
      '<p>打开就是「今日任务」：先看逾期条有没有把昨天的缺口带过来，再按四列推送做阅读、听力、翻译、写作，单词区按当前批次过一遍。做完一项点一次「记一篇 / 记一个 / 记一段」，或者直接在五项卡上 +1。</p>' +
      '<p>五项都达到目标才算当天打卡成功；差一项，热力图那一格就不是紫色。全部做完可以点「全部达标」一次补齐，适合补录。</p></section>';

    h += '<section><h2><span class="no">2</span>推送是怎么抽的</h2>' +
      '<p>每个板块有一个「冷却天数」，它不是写死的，而是按池长反推，保证整池轮完才回头：</p>' +
      '<ul><li>阅读：按易 / 难两档各自独立轮转，冷却 = 该档池长，每档每天 1 篇</li>' +
      '<li>听力：冷却 = max(6, 池长 × 0.66)，每天按累计时长凑到 ≤30 分钟；只凑出一条且不足 15 分钟时，换一条 18–30 分钟的单条</li>' +
      '<li>翻译：单双日交替易 / 难，冷却 = 当日档位池长 × 2</li>' +
      '<li>写作：冷却 = 池长，每天 1 题</li></ul>' +
      '<p>每条内容记「上次出现在第几天」，只有「今天 − 上次 ≥ 冷却」才允许再次被选中。可选的凑不够时，按「最久没出现」补满，所以不会空手。</p>' +
      '<p>当天结果与随机种子一起存进存档，刷新不变；换过题库会生成新的池子签名，旧结果自动作废并重抽。</p></section>';

    h += '<section><h2><span class="no">3</span>单词三种模式</h2>' +
      '<ul><li><b>卡片</b>：先遮住释义，点卡片翻面，然后按「认识 / 模糊 / 不熟」自评。模糊与不熟会进生词本，隔天优先。</li>' +
      '<li><b>自测</b>：四选一，选项从同一词库里随机取；答错自动进生词本。</li>' +
      '<li><b>清单</b>：当批词一览，左边小点表示记忆状态。</li></ul>' +
      '<p>切库只换推进名单，记忆状态和生词本跨库保留。词性缺失时整块不渲染；词缀提示只在后缀与词性匹配时给出，宁缺勿错。</p></section>';

    h += '<section><h2><span class="no">4</span>素材来源</h2>' +
      '<ul><li>词库：<code>qwerty-learner</code> 的 CET4_T（2607）、CET6_T（2345）与高考 3500 词表，MIT 许可。四级重点库 = 四级 − 高考 3500（1302 词），六级重点库 = 六级 − 四级（1313 词）。</li>' +
      '<li>阅读：ScienceDaily、Aeon、Our World in Data 的真实文章页，按题材粗分易 / 难两档。</li>' +
      '<li>听力：B 站真实视频页，含真题、技巧、精听、TED、TED-Ed 五类，逐条带分钟数。</li>' +
      '<li>翻译与写作：按真题题材改写的原创练习，翻译配参考译文与难点提示，写作配 Directions、提纲、框架与范文。</li></ul>' +
      '<p>外链会失效。打不开时用条目上的「搜同题」按标题搜索，或者在「目标与资源」里把它删掉。</p></section>';

    h += '<section><h2><span class="no">5</span>自建素材</h2>' +
      '<p>把 B 站、小红书、抖音的分享文案直接粘进来即可，一行一条，或者「标题 | 链接」，链接单独一行也能识别。示例：</p>' +
      '<pre>【六级听力真题精讲｜2023年12月第一套】 https://www.bilibili.com/video/BV1xx411c7mD\n' +
      '59 【震惊！六级阅读原来这样读 - 小红书】 http://xhslink.com/a/xyz，复制本条信息，打开【小红书】App查看精彩内容！\n' +
      '7.43 复制打开抖音，看看【英语老师Wendy的作品】六级作文万能句 https://v.douyin.com/iRxY8qK/\n' +
      'b23.tv/abc123</pre>' +
      '<p>解析会自动补全无协议链接、剥掉分享尾巴与话题标签、截断超长标题，重复链接只留一条。解析结果为 0 条时不会清空原内容。</p>' +
      '<p>自建条目当天至少露一条在最前，之后按 7 天冷却轮转；每个来源最多 300 条。</p></section>';

    h += '<section><h2><span class="no">6</span>统计口径</h2>' +
      '<ul><li>汇总表按所选区间（30 / 90 / 180 天 / 全部）计算合计、日均与达标天数。</li>' +
      '<li>热力图固定画最近 26 周，一格一天，颜色按当天达标项数加深，5 项为紫色。</li>' +
      '<li>各科达标率按全部记录算：分母是从第一条记录到今天的天数（含没有记录的天）。</li>' +
      '<li>逐日记录按月翻，最多回看 6 个月。</li></ul></section>';

    h += '<section><h2><span class="no">7</span>数据与备份</h2>' +
      '<p>所有数据存在浏览器 <code>localStorage</code> 的 <code>wb_cet6_data</code> 里，不上传、不联网、没有账号。清浏览器数据会丢，重要记录请定期导出 JSON。</p>' +
      '<p>换设备时在设置里导出，再在新设备导入即可。存档带版本号，旧版本会自动迁移，不清空原有记录。</p></section>';

    h += '<section><h2><span class="no">8</span>提醒的边界</h2>' +
      '<p>这是一个纯静态页面，没有服务端，也不注册 Service Worker 推送。「每日提醒」只在页面打开时判断：如果已过设定时间且今天没达标，就在顶部显示一条提示。关掉页面就不会响。</p>' +
      '<p>需要真正的提醒，建议用系统日历建一个每天重复的日程，或在手机上设闹钟。这是能力边界，不是配置问题。</p></section>';

    h += '<section><h2><span class="no">9</span>版本与开发者</h2>' +
      '<dl class="kv">' +
      '<dt>应用</dt><dd>六级打卡台 · CET-6 Daily</dd>' +
      '<dt>版本</dt><dd>v1.0.0（存档 schema v' + C.SCHEMA + '）</dd>' +
      '<dt>题库版本</dt><dd>' + st.poolV + '</dd>' +
      '<dt>构建</dt><dd>单文件 HTML · 零外部依赖</dd>' +
      '<dt>词库许可</dt><dd>qwerty-learner（MIT）</dd>' +
      '<dt>作者</dt><dd>Amkles · 数据智能工坊</dd>' +
      '</dl>' +
      '<p style="margin-top:10px">源码与更新记录见仓库 README。发现外链失效或解析漏判，欢迎提 issue。</p></section>';

    h += '</div>';
    return h;
  }

  /* =========================================================
     弹窗
     ========================================================= */
  function bindModal(srcId) {
    var src = state().sources.filter(function (s) { return s.id === srcId; })[0];
    if (!src) return '';
    var kindName = { read: '阅读', listen: '听力', trans: '翻译', write: '写作' }[src.kind];
    var extra = '';
    if (src.kind === 'read') {
      extra = '<div class="field"><label>这批算哪一档</label><div class="seg">' +
        '<button data-act="bind-level" data-v="easy" class="on">易（2–3 星）</button>' +
        '<button data-act="bind-level" data-v="hard">难（4–5 星）</button></div></div>';
    } else if (src.kind === 'listen') {
      extra = '<div class="field"><label>每条算多少分钟</label>' +
        '<input type="number" min="3" max="60" value="12" data-act="bind-min"></div>';
    } else if (src.kind === 'trans') {
      extra = '<div class="field"><label>这批算哪一档</label><div class="seg">' +
        '<button data-act="bind-level" data-v="easy" class="on">易</button>' +
        '<button data-act="bind-level" data-v="hard">难</button></div></div>';
    }
    return '<div class="modal on" id="bind-modal">' +
      '<header><h3>绑定素材 · ' + esc(src.name) + '</h3><button class="icon-btn" data-act="close-modal">' + I.close + '</button></header>' +
      '<div class="content">' +
      '<div class="field"><label>粘贴 ' + kindName + ' 素材（一行一条，支持 B 站 / 小红书 / 抖音分享文案）</label>' +
      '<textarea data-act="bind-text" placeholder="【六级听力真题精讲｜2023年12月第一套】 https://www.bilibili.com/video/BV1xx411c7mD"></textarea></div>' +
      extra +
      '<div style="display:flex;gap:8px;align-items:center"><button class="btn mini ghost" data-act="bind-parse">解析预览</button>' +
      '<span class="small muted" id="bind-count">还没解析</span></div>' +
      '<div class="preview" id="bind-preview"></div>' +
      '<div class="note" style="margin-top:10px">每行一条，「标题 | 链接」或标题一行、链接下一行都可以；无协议的短链会自动补 https。</div>' +
      '</div>' +
      '<footer><button class="btn ghost" data-act="close-modal">取消</button>' +
      '<button class="btn" data-act="bind-save" data-src="' + src.id + '">保存并重抽今天</button></footer></div>';
  }

  function newSourceModal(kind) {
    var kindName = { read: '阅读', listen: '听力', trans: '翻译', write: '写作' }[kind];
    return '<div class="modal on" id="new-src-modal">' +
      '<header><h3>新增' + kindName + '来源</h3><button class="icon-btn" data-act="close-modal">' + I.close + '</button></header>' +
      '<div class="content">' +
      '<div class="field"><label>来源名称</label><input type="text" data-act="src-name" placeholder="例如：B站 · 六级听力真题"></div>' +
      '<div class="field"><label>备注（可留空）</label><input type="text" data-act="src-note" placeholder="例如：2020–2025 真题合集"></div>' +
      '<div class="field"><label>素材地址（可选，试拉一次远程 RSS / JSON）</label>' +
      '<input type="text" data-act="src-feed" placeholder="https://example.com/feed.xml"></div>' +
      '<div class="note">受浏览器跨域限制，多数站点拉不动；拉不到就手动粘贴。这里只试一次，不会反复请求。</div>' +
      '</div>' +
      '<footer><button class="btn ghost" data-act="close-modal">取消</button>' +
      '<button class="btn" data-act="src-create" data-kind="' + kind + '">创建</button></footer></div>';
  }

  function confirmModal(id, title, text, okText) {
    return '<div class="modal on" id="' + id + '">' +
      '<header><h3>' + esc(title) + '</h3><button class="icon-btn" data-act="close-modal">' + I.close + '</button></header>' +
      '<div class="content"><p style="font-size:13.5px;color:var(--ink-2);line-height:1.8">' + text + '</p></div>' +
      '<footer><button class="btn ghost" data-act="close-modal">取消</button>' +
      '<button class="btn danger" data-act="confirm-ok" data-id="' + id + '">' + esc(okText) + '</button></footer></div>';
  }

  global.Views = {
    UI: UI,
    renderToday: renderToday,
    renderGoals: renderGoals,
    renderStats: renderStats,
    renderSettings: renderSettings,
    renderAbout: renderAbout,
    bindModal: bindModal,
    newSourceModal: newSourceModal,
    confirmModal: confirmModal,
    stars: stars,
    searchUrl: searchUrl
  };
})(window);
