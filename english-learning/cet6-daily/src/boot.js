/* ===========================================================
   六级打卡台 · CET-6 Daily
   启动与交互层
   =========================================================== */
(function (global) {
  'use strict';

  var C = global.Core, V = global.Views, UI = V.UI, I = C.ICONS;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var app, pageEl, drawerEl, maskEl, modalEl, toastEl, saveEl;
  var bindState = { src: null, level: 'easy', min: 12, parsed: [] };
  var pendingConfirm = null;
  var importInput;

  /* ---------------- 渲染 ---------------- */
  function render(keepScroll) {
    var y = window.scrollY;
    var openIdx = $$('#page details').map(function (d, i) { return d.open ? i : null; }).filter(function (x) { return x != null; });

    if (UI.route === 'today') pageEl.innerHTML = V.renderToday();
    else if (UI.route === 'goals') pageEl.innerHTML = V.renderGoals();
    else if (UI.route === 'stats') pageEl.innerHTML = V.renderStats();
    else if (UI.route === 'about') pageEl.innerHTML = V.renderAbout();
    else pageEl.innerHTML = V.renderToday();

    if (keepScroll !== false) window.scrollTo(0, y);
    else window.scrollTo(0, 0);

    var ds = $$('#page details');
    openIdx.forEach(function (i) { if (ds[i]) ds[i].open = true; });

    syncNav();
  }

  function syncNav() {
    $$('[data-nav]').forEach(function (el) {
      el.classList.toggle('on', el.getAttribute('data-nav') === UI.route);
    });
    $$('.tabbar button').forEach(function (el) {
      el.classList.toggle('on', el.getAttribute('data-route') === UI.route);
    });
  }

  function go(route) {
    UI.route = route;
    render(false);
    closeDrawer();
  }

  /* ---------------- 提示 ---------------- */
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 2200);
  }

  /* ---------------- 抽屉 / 弹窗 ---------------- */
  function openDrawer() {
    drawerEl.innerHTML = V.renderSettings();
    drawerEl.classList.add('on');
    maskEl.classList.add('on');
  }
  function closeDrawer() {
    drawerEl.classList.remove('on');
    if (!modalEl.innerHTML) maskEl.classList.remove('on');
  }
  function openModal(html) {
    modalEl.innerHTML = html;
    modalEl.classList.add('on');
    maskEl.classList.add('on');
  }
  function closeModal() {
    modalEl.classList.remove('on');
    modalEl.innerHTML = '';
    if (!drawerEl.classList.contains('on')) maskEl.classList.remove('on');
  }

  /* ---------------- 复制文案 ---------------- */
  function copyToday() {
    var today = C.todayStr();
    var st = C.state();
    var b = C.wordBatch(today);
    var p = C.pushItems(today);
    var s = C.statsFor(today);
    var lines = [];
    lines.push('六级打卡 · ' + today + '（' + C.dateCN(today) + '）');
    lines.push('今日进度：' + s.okCount + ' / 5 项达标' + (s.complete ? '，已全清' : ''));
    lines.push('');
    lines.push('【单词】' + C.LIB_META[st.word.lib].name + ' · 第 ' + b.batchNo + '/' + b.batches + ' 批 · 共 ' + b.words.length + ' 词');
    b.words.forEach(function (w) {
      lines.push('  ' + w[0] + (w[1] ? ' /' + w[1] + '/' : '') + '  ' + (w[3] || []).join('；'));
    });
    lines.push('');
    lines.push('【阅读】');
    p.read.forEach(function (it, i) {
      lines.push('  ' + (i + 1) + '. ' + it.title + '（' + it.src + '，' + it.stars + ' 星，约 ' + it.min + ' 分钟）');
      lines.push('     ' + it.url);
    });
    lines.push('');
    lines.push('【听力】');
    p.listen.forEach(function (it, i) {
      lines.push('  ' + (i + 1) + '. ' + it.title + '（' + it.min + ' 分钟）');
      lines.push('     ' + it.url);
    });
    lines.push('');
    lines.push('【翻译】' + (p.trans[0] ? p.trans[0].zh : ''));
    lines.push('【写作】' + (p.write[0] ? p.write[0].dir : ''));
    var text = lines.join('\n');

    var done = function () { toast('今日清单已复制'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) { toast('复制失败，请手动选择'); }
    document.body.removeChild(ta);
  }

  /* ---------------- 单词自评 ---------------- */
  function markWord(word, kind) {
    var st = C.state();
    var today = C.todayStr();
    st.marks[word] = { s: kind, d: today };
    if (kind !== 'known') {
      var at = st.news.indexOf(word);
      if (at >= 0) st.news.splice(at, 1);
      st.news.unshift(word);
    }
    C.save();
  }

  /* ---------------- 导入导出 ---------------- */
  function exportJson() {
    var st = C.state();
    var data = JSON.stringify(st, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cet6-daily-' + C.todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
    toast('已导出 JSON');
  }

  function doImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var raw = JSON.parse(String(reader.result));
        if (!raw || typeof raw !== 'object') throw new Error('bad');
        var next = C.migrate ? C.migrate(raw) : null;
        if (!next) throw new Error('bad');
        // 覆盖当前存档（保留版本号）
        localStorage.setItem(C.KEY, JSON.stringify(next));
        location.reload();
      } catch (e) {
        toast('导入失败：不是有效的存档 JSON');
      }
    };
    reader.readAsText(file);
  }

  /* ---------------- 事件 ---------------- */
  function onAction(act, el, ev) {
    var st = C.state();
    var today = C.todayStr();

    switch (act) {
      case 'route': go(el.getAttribute('data-route')); break;
      case 'tab': go(el.getAttribute('data-route')); break;
      case 'open-drawer': openDrawer(); break;
      case 'close-drawer': closeDrawer(); break;
      case 'close-modal': closeModal(); break;

      case 'perday':
        st.word.perDay = +el.getAttribute('data-n');
        C.save(); render(); break;
      case 'mode':
        st.word.mode = el.getAttribute('data-mode');
        UI.wordIdx = 0; UI.quiz = null; UI.flipped = false;
        C.save(); render(); break;
      case 'lib':
        st.word.lib = el.getAttribute('data-lib');
        UI.wordIdx = 0; UI.quiz = null;
        C.save(); render(); break;
      case 'flip':
        UI.flipped = !UI.flipped; render(); break;
      case 'speak':
        ev.stopPropagation();
        if (!C.speak(el.getAttribute('data-w'))) toast('这个浏览器不支持语音合成');
        break;
      case 'wprev': {
        var b1 = C.wordBatch(today);
        UI.wordIdx = (UI.wordIdx - 1 + b1.words.length) % b1.words.length;
        UI.flipped = false; UI.quiz = null; render(); break;
      }
      case 'wnext': {
        var b2 = C.wordBatch(today);
        UI.wordIdx = (UI.wordIdx + 1) % b2.words.length;
        UI.flipped = false; UI.quiz = null; render(); break;
      }
      case 'rate': {
        var bw = C.wordBatch(today);
        var w = bw.words[UI.wordIdx];
        if (!w) break;
        markWord(w[0], el.getAttribute('data-s'));
        UI.wordIdx = (UI.wordIdx + 1) % bw.words.length;
        UI.flipped = false; UI.quiz = null;
        render(); break;
      }
      case 'quiz': {
        var q = UI.quiz;
        if (!q || q.answered !== null) break;
        var i = +el.getAttribute('data-i');
        q.answered = i;
        q.correct = i === q.answer;
        if (!q.correct) {
          markWord(q.word[0], 'unknown');
          C.addCount(today, 'w', 0);
        }
        render(); break;
      }
      case 'quiz-next': {
        var b3 = C.wordBatch(today);
        UI.wordIdx = (UI.wordIdx + 1) % Math.max(1, b3.words.length);
        UI.quiz = null; UI.flipped = false;
        render(); break;
      }

      case 'add':
        C.addCount(today, el.getAttribute('data-k'), +el.getAttribute('data-n') || 1);
        render(); break;
      case 'fill': {
        var k = el.getAttribute('data-k');
        var s = C.statsFor(today);
        var item = s.items.filter(function (x) { return x.k === k; })[0];
        if (item) C.setCount(today, k, item.target);
        render(); break;
      }
      case 'all-done':
        C.setAllDone(today);
        toast('今天五项已全部记为达标');
        render(); break;
      case 'copy-list': copyToday(); break;
      case 'carry-off': {
        var d = C.ensureDay(today);
        d.carry = false; C.save(); render(); toast('今天只按原目标算'); break;
      }
      case 'carry-on': {
        var d2 = C.ensureDay(today);
        d2.carry = true; C.save(); render(); toast('已恢复顺延昨天缺口'); break;
      }
      case 'remind-close': {
        st.settings.remind = false; C.save(); render(); break;
      }

      case 'goal-step': {
        var gk = el.getAttribute('data-k');
        var dlt = +el.getAttribute('data-d');
        st.goals[gk] = Math.max(1, Math.min(200, (+st.goals[gk] || 1) + dlt));
        C.save(); render(); break;
      }

      case 'toggle-src': {
        var id = el.getAttribute('data-src');
        UI.expanded[id] = !UI.expanded[id];
        render(); break;
      }
      case 'bind':
        openBind(el.getAttribute('data-src'));
        break;
      case 'new-src':
        bindState = { src: null, level: 'easy', min: 12, parsed: [] };
        openModal(V.newSourceModal(el.getAttribute('data-kind')));
        break;
      case 'clear-src': {
        var sid = el.getAttribute('data-src');
        var src = st.sources.filter(function (s) { return s.id === sid; })[0];
        if (!src) break;
        pendingConfirm = function () {
          src.items = [];
          C.save(true); C.invalidatePush(); render(); toast('已清空该来源');
        };
        openModal(V.confirmModal('cfm-clear-src', '清空该来源', '只清空「' + C.esc(src.name) + '」里的自建条目，内置内容不受影响。', '清空'));
        break;
      }
      case 'del-src': {
        var sid2 = el.getAttribute('data-src');
        var src2 = st.sources.filter(function (s) { return s.id === sid2; })[0];
        if (!src2) break;
        pendingConfirm = function () {
          st.sources = st.sources.filter(function (s) { return s.id !== sid2; });
          C.save(true); C.invalidatePush(); render(); toast('已删除来源');
        };
        openModal(V.confirmModal('cfm-del-src', '删除来源', '将删除「' + C.esc(src2.name) + '」及其 ' + src2.items.length + ' 条素材。内置内容不受影响。', '删除'));
        break;
      }
      case 'item-edit':
        UI.editing = el.getAttribute('data-item');
        render(); break;
      case 'item-del': {
        var s1 = el.getAttribute('data-src'), i1 = el.getAttribute('data-item');
        var src3 = st.sources.filter(function (s) { return s.id === s1; })[0];
        if (!src3) break;
        src3.items = src3.items.filter(function (it) { return it.id !== i1; });
        C.save(true); C.invalidatePush(); render(); break;
      }
      case 'news-clear':
        st.news = [];
        C.save(); render(); toast('生词本已清空'); break;

      case 'bind-parse': {
        var ta = $('#bind-modal textarea');
        var parsed = C.parseImport(ta ? ta.value : '');
        bindState.parsed = parsed;
        var pv = $('#bind-preview');
        var cnt = $('#bind-count');
        if (!parsed.length) {
          if (pv) pv.innerHTML = '';
          if (cnt) cnt.textContent = '解析到 0 条';
          toast('没解析到内容：每行一条，可直接粘 B 站分享文案或「标题 | 链接」');
        } else {
          if (cnt) cnt.textContent = '解析到 ' + parsed.length + ' 条';
          if (pv) pv.innerHTML = parsed.slice(0, 50).map(function (it, i) {
            return '<div class="pv"><span class="n">' + (i + 1) + '</span><span class="t">' + C.esc(it.title) +
              '</span><span class="u">' + C.esc(it.url) + '</span></div>';
          }).join('');
        }
        break;
      }
      case 'bind-level': {
        bindState.level = el.getAttribute('data-v');
        $$('#bind-modal [data-act="bind-level"]').forEach(function (b) {
          b.classList.toggle('on', b === el);
        });
        break;
      }
      case 'bind-save': {
        var sid4 = el.getAttribute('data-src');
        var src4 = st.sources.filter(function (s) { return s.id === sid4; })[0];
        if (!src4) break;
        if (!bindState.parsed.length) {
          toast('先点「解析预览」，确认能解析出内容再保存');
          break;
        }
        var exist = {};
        src4.items.forEach(function (it) { exist[it.url] = 1; });
        var minInput = $('#bind-modal [data-act="bind-min"]');
        var min = minInput ? Math.max(3, Math.min(60, +minInput.value || 12)) : bindState.min;
        var added = 0;
        bindState.parsed.forEach(function (it) {
          if (exist[it.url]) return;
          if (src4.items.length >= C.MAX_SOURCE_ITEMS) return;
          exist[it.url] = 1;
          src4.items.push({
            id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            title: it.title, url: it.url,
            level: src4.kind === 'read' || src4.kind === 'trans' ? bindState.level : '',
            min: src4.kind === 'listen' ? min : 0
          });
          added++;
        });
        bindState.parsed = [];
        closeModal();
        UI.expanded[sid4] = true;   // 保存后直接把明细摊开，方便核对
        C.save(true);
        C.invalidatePush();     // 换题库 → 池子版本号 +1，今天重新抽
        render();
        toast(added ? '已保存 ' + added + ' 条，今天的内容已重抽' : '没有新增（链接都已在库中）');
        break;
      }

      case 'src-create': {
        var nameEl = $('#new-src-modal [data-act="src-name"]');
        var noteEl = $('#new-src-modal [data-act="src-note"]');
        var feedEl = $('#new-src-modal [data-act="src-feed"]');
        var name = nameEl ? nameEl.value.trim() : '';
        if (!name) { toast('先给来源起个名字'); break; }
        var src5 = {
          id: 's' + Date.now().toString(36),
          name: name,
          note: noteEl ? noteEl.value.trim() : '',
          kind: el.getAttribute('data-kind'),
          items: []
        };
        st.sources.push(src5);
        UI.expanded[src5.id] = true;
        C.save(true);
        closeModal();
        render();
        var feed = feedEl ? feedEl.value.trim() : '';
        if (feed) tryFeed(feed, src5.id);
        else toast('来源已创建，可以绑定素材了');
        break;
      }

      case 'range':
        UI.range = +el.getAttribute('data-r');
        render(); break;
      case 'month':
        UI.month = Math.max(-5, Math.min(0, UI.month + (+el.getAttribute('data-d'))));
        render(); break;

      case 'toggle-remind':
        st.settings.remind = !st.settings.remind;
        C.save(); openDrawer(); break;
      case 'export': exportJson(); break;
      case 'import':
        if (importInput) importInput.click();
        break;
      case 'clear-sample':
        C.clearSamples(st); C.save(true); render(); toast('示例数据已清空'); break;
      case 'clear-all':
        pendingConfirm = function () {
          localStorage.removeItem(C.KEY);
          location.reload();
        };
        openModal(V.confirmModal('cfm-clear-all', '清空全部数据', '会删除本机上的所有打卡记录、生词本与自建素材，不可恢复。建议先导出备份。', '我确定，清空'));
        break;
      case 'confirm-ok':
        if (pendingConfirm) { var fn = pendingConfirm; pendingConfirm = null; closeModal(); fn(); }
        else closeModal();
        break;
      default: break;
    }
  }

  function openBind(srcId) {
    bindState = { src: srcId, level: 'easy', min: 12, parsed: [] };
    openModal(V.bindModal(srcId));
  }

  function tryFeed(url, srcId) {
    toast('正在试拉一次远程内容…');
    var done = false;
    var timer = setTimeout(function () {
      if (!done) { done = true; toast('拉取超时：多数站点禁止跨域读取，请手动粘贴'); }
    }, 8000);
    fetch(url, { mode: 'cors' }).then(function (r) { return r.text(); }).then(function (txt) {
      if (done) return;
      done = true; clearTimeout(timer);
      var items = C.parseImport(txt);
      if (!items.length) { toast('拉到了内容，但没解析出条目，请手动粘贴'); return; }
      var src = C.state().sources.filter(function (s) { return s.id === srcId; })[0];
      if (!src) return;
      items.slice(0, C.MAX_SOURCE_ITEMS).forEach(function (it) {
        src.items.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: it.title, url: it.url, level: '', min: 0 });
      });
      C.save(true); C.invalidatePush(); render();
      toast('已从远程导入 ' + items.length + ' 条');
    }).catch(function () {
      if (done) return;
      done = true; clearTimeout(timer);
      toast('浏览器拦截了跨域请求，请手动粘贴内容');
    });
  }

  /* ---------------- 绑定事件 ---------------- */
  function bindEvents() {
    document.addEventListener('click', function (ev) {
      var el = ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!el) return;
      var act = el.getAttribute('data-act');
      if (el.tagName === 'A' && (act === 'route')) ev.preventDefault();
      if (el.tagName === 'A' && el.getAttribute('href') && act !== 'route') return;
      onAction(act, el, ev);
    });

    document.addEventListener('change', function (ev) {
      var el = ev.target;
      var act = el.getAttribute && el.getAttribute('data-act');
      var st = C.state();
      if (act === 'goal-input') {
        var k = el.getAttribute('data-k');
        var v = Math.max(1, Math.min(200, +el.value || 1));
        st.goals[k] = v;
        C.save(); render(); return;
      }
      if (act === 'exam-date') {
        if (el.value) { st.examDate = el.value; C.save(); render(); toast('考试日期已更新'); }
        return;
      }
      if (act === 'remind-at') {
        st.settings.at = el.value || '20:30'; C.save(); toast('提醒时间已更新'); return;
      }
      if (act === 'item-input') {
        var sid = el.getAttribute('data-src'), iid = el.getAttribute('data-item');
        var src = st.sources.filter(function (s) { return s.id === sid; })[0];
        if (src) {
          src.items.forEach(function (it) {
            if (it.id === iid) it.title = C.truncate(el.value.trim() || it.title, 160);
          });
          UI.editing = null;
          C.save(true); render();
        }
        return;
      }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target && ev.target.getAttribute && ev.target.getAttribute('data-act') === 'item-input') {
        ev.target.blur();
      }
      if (ev.key === 'Escape') { closeModal(); closeDrawer(); }
    });

    maskEl.addEventListener('click', function () { closeModal(); closeDrawer(); });

    if (importInput) {
      importInput.addEventListener('change', function () {
        if (this.files && this.files[0]) doImport(this.files[0]);
        this.value = '';
      });
    }
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    app = $('#app');
    pageEl = $('#page');
    drawerEl = $('#drawer');
    maskEl = $('#mask');
    modalEl = $('#modal');
    toastEl = $('#toast');
    saveEl = $('#save-state');

    C.load();

    importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = 'application/json,.json';
    importInput.style.display = 'none';
    document.body.appendChild(importInput);

    C.onSave(function (status) {
      if (!saveEl) return;
      var dot = saveEl.querySelector('.dot');
      var txt = saveEl.querySelector('.txt');
      if (status === 'saving') {
        dot.classList.add('saving');
        txt.textContent = '正在保存…';
      } else if (status === 'error') {
        dot.classList.remove('saving');
        dot.style.background = '#C0453C';
        txt.textContent = '保存失败（可能是隐私模式）';
      } else {
        dot.classList.remove('saving');
        var d = new Date();
        txt.textContent = '本地已保存 · ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      }
    });

    bindEvents();
    render(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.App = { go: go, render: render, toast: toast };
})(window);
