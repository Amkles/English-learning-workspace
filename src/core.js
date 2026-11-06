/* ===========================================================
   六级打卡台 · CET-6 Daily
   核心层：常量 / 工具 / 存档 / 迁移 / 解析 / 抽取 / 统计
   =========================================================== */
(function (global) {
  'use strict';

  var DB = global.__CET6_DATA__ || { vocab: { words: [], libs: {} }, reading: [], listening: [], translation: [], writing: [] };
  var SCHEMA = 4;
  var KEY = 'wb_cet6_data';
  var MAX_SEEN = 200;      // 每个板块只留最近 200 条出现记录
  var MAX_PUSH = 60;       // 每日抽签结果保留天数
  var MAX_SOURCE_ITEMS = 300;

  var SUBJECTS = [
    { k: 'w', name: '单词', color: '#D6336C', unit: '词' },
    { k: 'r', name: '阅读', color: '#A8447F', unit: '篇' },
    { k: 'l', name: '听力', color: '#6E5AA8', unit: '个' },
    { k: 't', name: '翻译', color: '#D9822B', unit: '段' },
    { k: 'p', name: '写作', color: '#E0629B', unit: '题' }
  ];
  var SUBJ = {};
  SUBJECTS.forEach(function (s) { SUBJ[s.k] = s; });

  var WORD_OPTIONS = [10, 15, 20, 30, 40, 60];
  var LIB_META = {
    c4all: { name: '四级全库', note: 'CET-4 词表全量，打底用' },
    c4key: { name: '四级重点库', note: '四级词表中超出高考 3500 的部分' },
    c6all: { name: '六级全库', note: 'CET-6 词表全量，含四级重叠' },
    c6key: { name: '六级重点库', note: '六级词表中不在四级词表的部分' },
    news: { name: '自建生词', note: '卡片里标记「模糊 / 不熟」自动收进来' }
  };
  var LIB_ORDER = ['c6key', 'c6all', 'c4all', 'c4key', 'news'];

  /* ---------------- 图标（全部内联 SVG，不用 emoji） ---------------- */
  var S = function (d, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '>' + d + '</svg>';
  };
  var ICONS = {
    today: S('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 15l2.5 2.5L16 13"/>'),
    goal: S('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
    chart: S('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    gear: S('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
    book: S('<path d="M4 5.5A2.5 2.5 0 016.5 3H19v15H6.5A2.5 2.5 0 004 20.5V5.5z"/><path d="M19 18v3H6.5A2.5 2.5 0 014 18.5"/>'),
    ear: S('<path d="M8 20a6 6 0 01-1.4-3.9c0-3 2-3.6 2-5.6a3.4 3.4 0 116.8 0c0 1.6-.7 2.2-1.7 3.2-.9 1-1.4 1.8-1.4 3.1a2.3 2.3 0 01-2.3 2.3"/><path d="M10.6 12.6a1.6 1.6 0 013 0"/>'),
    pen: S('<path d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17v3z"/><path d="M14 6l4 4"/>'),
    edit: S('<path d="M4 16.5V20h3.5L19 8.5a2.1 2.1 0 00-3-3L4 16.5z"/>'),
    check: S('<path d="M5 12.5l4.5 4.5L19 7"/>'),
    checkCircle: S('<circle cx="12" cy="12" r="9"/><path d="M8 12.2l2.6 2.6L16.4 9"/>'),
    plus: S('<path d="M12 5v14M5 12h14"/>'),
    minus: S('<path d="M5 12h14"/>'),
    copy: S('<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 5.5A2.5 2.5 0 0012.5 3H6a3 3 0 00-3 3v6.5A2.5 2.5 0 005.5 15"/>'),
    bell: S('<path d="M6 9a6 6 0 1112 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z"/><path d="M10 19a2 2 0 004 0"/>'),
    clock: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v5.4l3.4 2"/>'),
    link: S('<path d="M10 14a4 4 0 005.7 0l2.6-2.6a4 4 0 10-5.7-5.7L11.3 7"/><path d="M14 10a4 4 0 00-5.7 0l-2.6 2.6a4 4 0 105.7 5.7L12.7 17"/>'),
    search: S('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
    volume: S('<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z"/><path d="M15 8.5a5 5 0 010 7M18 6a8.5 8.5 0 010 12"/>'),
    arrow: S('<path d="M9 5l7 7-7 7"/>'),
    left: S('<path d="M15 5l-7 7 7 7"/>'),
    close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
    trash: S('<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>'),
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.8-5.1 2.8 1-5.7-4.1-4 5.7-.8z"/></svg>',
    info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.6"/>'),
    flame: S('<path d="M12 3s5 4.2 5 8.6A5 5 0 017 11.6C7 8.8 8.6 7 9.4 5.4c.3 2 1.4 2.8 2.2 2.4.9-.5.6-2.8.4-4.8z"/>'),
    calendar: S('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>'),
    download: S('<path d="M12 4v10M8 11l4 4 4-4"/><path d="M4 18h16"/>'),
    upload: S('<path d="M12 20V10M8 13l4-4 4 4"/><path d="M4 18h16"/>'),
    grid: S('<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>'),
    cards: S('<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M18 8v8a2 2 0 01-2 2H7"/>'),
    list: S('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
    quiz: S('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 115 1c-.6.9-2.4 1.3-2.4 2.9"/><path d="M12 17h.01"/>'),
    url: S('<circle cx="12" cy="12" r="9"/><path d="M3.5 12h17M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18"/>'),
    refresh: S('<path d="M20 11a8 8 0 10-2.6 6.3"/><path d="M20 5v6h-6"/>'),
    target: S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>'),
    spark: S('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>')
  };

  /* ---------------- 日期工具 ---------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { return ymd(new Date()); }
  function parseYmd(s) {
    var p = String(s || '').split('-');
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }
  function dayIndex(s) {
    var d = parseYmd(s);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }
  function shift(s, n) {
    var d = parseYmd(s);
    d.setDate(d.getDate() + n);
    return ymd(d);
  }
  function weekdayCN(s) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseYmd(s).getDay()];
  }
  function dateCN(s) {
    var d = parseYmd(s);
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + weekdayCN(s);
  }
  function daysBetween(a, b) { return dayIndex(b) - dayIndex(a); }

  /* ---------------- 随机 ---------------- */
  function hash32(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, seed) {
    var out = arr.slice();
    var rnd = mulberry32(seed >>> 0);
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  /* ---------------- 文本工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /* =========================================================
     素材导入解析
     ========================================================= */

  var TLD = 'com|cn|net|org|tv|cc|me|io|co|edu|gov|info|xyz|top|link|video|be|ly|gl|to|so|fm|ai|app|dev|site|online|store|shop|fun|live|pro|today|news|world|life|space|club|vip|ink|im|us|uk|jp|kr|de|fr|ru|hk|tw';
  var URL_STOP = "\\s，。；：！？、\"'“”‘’（）()【】《》「」『』<>｜";
  var URL_RE = new RegExp('https?:\\/\\/[^' + URL_STOP + ']+', 'i');
  var BARE_RE = new RegExp('(^|[\\s(（【「])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:' + TLD + ')(?::\\d+)?(?:\\/[^' + URL_STOP + ']*)?)', 'i');

  var PLATFORMS = [
    { re: /(^|\.)bilibili\.com$|(^|\.)b23\.tv$/i, name: 'B站', ph: 'B站视频' },
    { re: /(^|\.)xiaohongshu\.com$|(^|\.)xhslink\.com$/i, name: '小红书', ph: '小红书笔记' },
    { re: /(^|\.)douyin\.com$|(^|\.)iesdouyin\.com$/i, name: '抖音', ph: '抖音视频' },
    { re: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i, name: 'YouTube', ph: 'YouTube 视频' },
    { re: /(^|\.)ted\.com$/i, name: 'TED', ph: 'TED 演讲' },
    { re: /(^|\.)weforum\.org$/i, name: 'WEF', ph: 'WEF 文章' }
  ];

  function hostOf(url) {
    var m = String(url || '').replace(/^https?:\/\//i, '').match(/^([^\/?#]+)/);
    return (m ? m[1] : '').toLowerCase().split(':')[0];
  }
  function platformOf(url) {
    var h = hostOf(url);
    for (var i = 0; i < PLATFORMS.length; i++) {
      if (PLATFORMS[i].re.test(h)) return PLATFORMS[i];
    }
    return { name: h.length > 18 ? h.slice(0, 17) + '…' : h || '网页', ph: h.length > 18 ? h.slice(0, 17) + '…' : (h || '网页') };
  }

  function stripEmoji(s) {
    try {
      return s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}\u{2700}-\u{27BF}]/gu, ' ');
    } catch (e) {
      return s.replace(/[\u2600-\u27BF]/g, ' ');
    }
  }

  function stripWrapping(s) {
    var pairs = [['【', '】'], ['[', ']'], ['「', '」'], ['『', '』'], ['（', '）'], ['(', ')'], ['《', '》'], ['<', '>']];
    var changed = true;
    while (changed) {
      changed = false;
      s = s.trim();
      for (var i = 0; i < pairs.length; i++) {
        var a = pairs[i][0], b = pairs[i][1];
        if (s.length > a.length + b.length && s.indexOf(a) === 0 && s.lastIndexOf(b) === s.length - b.length) {
          s = s.slice(a.length, s.length - b.length);
          changed = true;
        }
      }
    }
    return s.trim();
  }

  function looksLikeJunkTitle(t) {
    if (!t) return true;
    var core = t.replace(/\s+/g, '');
    if (!core) return true;
    if (/^[a-z0-9.:\-_\/]+$/i.test(core) && /\./.test(core)) return true;         // 纯域名
    if (/^BV[0-9A-Za-z]{10}$/.test(core)) return true;                              // BV 号
    if (/^[A-Za-z0-9]{10,24}$/.test(core) && /\d/.test(core) && !/[\u4e00-\u9fa5]/.test(core)) return true; // 短码
    return false;
  }

  function titleFromUrl(url) {
    var path = String(url).split(/[?#]/)[0].replace(/^https?:\/\/[^\/]+/i, '');
    var seg = path.split('/').filter(Boolean).pop() || '';
    seg = seg.replace(/\.(html?|php|aspx?|jsp)$/i, '').replace(/[-_]+/g, ' ').trim();
    var junk = !seg || seg.length <= 1 || /^\d+$/.test(seg) ||
      /^BV[0-9A-Za-z]{10}$/.test(seg) ||                    // BV 号
      /^[A-Za-z0-9]{16,}$/.test(seg) ||                      // 长短码
      (/^[A-Za-z0-9]{4,14}$/.test(seg) && /\d/.test(seg));  // 含数字的短码
    if (!junk) return truncate(seg, 80);
    return platformOf(url).ph;
  }

  function cleanTitle(raw, url) {
    var s = String(raw || '').trim();
    if (!s) return '';

    // 1. 剥分享尾巴
    s = s.replace(/[，,]\s*(复制|打开|下载)[\s\S]*$/, '');
    s = s.replace(/[，,]\s*[^，,]{0,12}(App|APP|app)[\s\S]*$/, '');
    // 2. 剥行首短码：59 / 7.43 / pMx:/
    s = s.replace(/^\s*\d{1,2}(?:\.\d{1,3})?\s+/, '');
    s = s.replace(/^\s*[A-Za-z0-9]{2,6}:\/{1,2}\s*/, '');
    // 3. 剥引导语与作者前缀
    s = s.replace(/^复制打开(抖音|快手|小红书|B站|bilibili)[，,]?\s*(看看)?\s*/, '');
    s = s.replace(/^【[^】]{1,24}的作品】\s*/, '');
    // 4. 剥 emoji 与话题标签
    s = stripEmoji(s);
    s = s.replace(/#[^#\s]{1,24}#/g, ' ');
    // 5. 循环剥外层包裹
    s = stripWrapping(s);
    // 6. 剥来源尾巴
    s = s.replace(/\s*[-_—]\s*(哔哩哔哩|bilibili|小红书|抖音|YouTube|youtube)\s*$/i, '');
    s = s.replace(/_bilibili\s*$/i, '');
    // 7. 剥残留首尾符号
    s = s.replace(/^[\s|\-_,，、·.]+/, '').replace(/[\s|\-_,，、·.]+$/, '');
    s = s.replace(/\s{2,}/g, ' ').trim();

    if (looksLikeJunkTitle(s)) return '';
    return truncate(s, 160);
  }

  function extractUrl(text) {
    var m = URL_RE.exec(text);
    if (m) {
      var u = m[0].replace(/[.,;:!?)\]}"'”’]+$/, '');
      return { url: u, start: m.index, end: m.index + u.length, bare: false };
    }
    var b = BARE_RE.exec(text);
    if (b) {
      var raw = b[2].replace(/[.,;:!?)\]}"'”’]+$/, '');
      var start = b.index + b[1].length;
      return { url: 'https://' + raw.replace(/^\/\//, ''), start: start, end: start + raw.length, bare: true };
    }
    return null;
  }

  function normalizeUrl(u) {
    return String(u || '').trim().replace(/\/+$/, '');
  }

  function parseJsonItems(raw) {
    var out = [];
    var data;
    try { data = JSON.parse(raw); } catch (e) { return out; }
    var list = null;
    if (Array.isArray(data)) list = data;
    else if (data && typeof data === 'object') {
      var keys = ['items', 'list', 'data', 'result'];
      for (var i = 0; i < keys.length; i++) {
        if (Array.isArray(data[keys[i]])) { list = data[keys[i]]; break; }
      }
      if (!list && Array.isArray(data.entries)) list = data.entries;
      if (!list) list = [data];
    }
    if (!list) return out;
    list.forEach(function (it) {
      if (typeof it === 'string') {
        var ex = extractUrl(it);
        if (ex) out.push({ title: cleanTitle(it.slice(0, ex.start), ex.url) || titleFromUrl(ex.url), url: ex.url });
        return;
      }
      if (!it || typeof it !== 'object') return;
      var url = it.url || it.link || it.href || it.URL || it.Link || '';
      var title = it.title || it.name || it.text || it.desc || it.description || '';
      if (!url) {
        var found = extractUrl(String(title));
        if (found) { url = found.url; title = String(title).slice(0, found.start); }
      }
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = 'https://' + String(url).replace(/^\/\//, '');
      out.push({ title: cleanTitle(title, url) || titleFromUrl(url), url: url });
    });
    return out;
  }

  function parseRssItems(raw) {
    var out = [];
    if (typeof DOMParser === 'undefined') return out;
    var doc;
    try { doc = new DOMParser().parseFromString(raw, 'application/xml'); } catch (e) { return out; }
    if (!doc || doc.getElementsByTagName('parsererror').length) return out;

    function txt(node, names) {
      for (var i = 0; i < names.length; i++) {
        var el = node.getElementsByTagName(names[i])[0];
        if (el && (el.textContent || '').trim()) return el.textContent.trim();
      }
      return '';
    }
    var nodes = doc.getElementsByTagName('item');
    if (!nodes.length) nodes = doc.getElementsByTagName('entry');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var title = txt(n, ['title']);
      var linkEl = n.getElementsByTagName('link')[0];
      var url = linkEl ? (linkEl.getAttribute('href') || linkEl.textContent.trim()) : txt(n, ['guid', 'id']);
      if (!url) continue;
      if (!/^https?:\/\//i.test(url)) url = 'https://' + String(url).replace(/^\/\//, '');
      out.push({ title: cleanTitle(title, url) || titleFromUrl(url), url: url });
    }
    return out;
  }

  function parseImport(text) {
    var raw = String(text == null ? '' : text).trim();
    if (!raw) return [];
    var items = [];

    if (/^[\[{]/.test(raw)) items = parseJsonItems(raw);

    if (!items.length && /<(rss|feed|item|entry)[\s>]/i.test(raw)) items = parseRssItems(raw);

    if (!items.length) {
      var lines = raw.split(/\r?\n/);
      var prevText = '';
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var t = line.trim();
        if (!t || t.charAt(0) === '#') continue;
        var ex = extractUrl(t);
        if (!ex) { prevText = t; continue; }

        var head = t.slice(0, ex.start).trim();
        var tail = t.slice(ex.end).trim();
        var titleRaw = head;
        if (!titleRaw) {
          // 整行只有链接：向上取上一行当标题
          titleRaw = prevText;
        } else if (!cleanTitle(titleRaw, ex.url) && tail && !extractUrl(tail)) {
          titleRaw = tail;
        }
        var title = cleanTitle(titleRaw, ex.url);
        items.push({ title: title || titleFromUrl(ex.url), url: ex.url });
        prevText = '';
      }
    }

    // 去重 + 截断
    var seen = {}, out = [];
    items.forEach(function (it) {
      if (!it || !it.url) return;
      it.url = String(it.url).trim();
      if (!/^https?:\/\//i.test(it.url)) return;
      var key = normalizeUrl(it.url).toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      it.title = truncate(String(it.title || '').trim() || titleFromUrl(it.url), 160);
      out.push(it);
    });
    return out;
  }

  /* =========================================================
     存档
     ========================================================= */
  var COLORS = ['#F2A6C6', '#E879A5', '#D84A7B', '#B42557', '#5B3FA8'];

  function defaultState() {
    return {
      v: SCHEMA,
      poolV: 1,
      created: todayStr(),
      examDate: '2026-12-19',
      word: { perDay: 20, lib: 'c6key', mode: 'card' },
      goals: { word: 20, read: 2, listen: 2, trans: 1, write: 1 },
      days: {},
      push: {},
      marks: {},
      news: [],
      sources: [],
      seen: { read: {}, listen: {}, trans: {}, write: {} },
      seenOrder: { read: [], listen: [], trans: [], write: [] },
      settings: { remind: true, at: '20:30', sample: true }
    };
  }

  function migrate(raw) {
    var d = defaultState();
    if (!raw || typeof raw !== 'object') return d;

    // 未知字段先保留，避免丢用户数据
    Object.keys(raw).forEach(function (k) { if (!(k in d)) d[k] = raw[k]; });

    d.examDate = raw.examDate || d.examDate;
    d.created = raw.created || raw.createdAt || d.created;
    d.v = SCHEMA;

    // v1：goals 是数组 [word, read, listen, trans, write]
    var g = raw.goals;
    if (Array.isArray(g)) {
      d.goals = { word: +g[0] || 20, read: +g[1] || 2, listen: +g[2] || 2, trans: +g[3] || 1, write: +g[4] || 1 };
    } else if (g && typeof g === 'object') {
      d.goals = {
        word: +g.word || +g.words || 20,
        read: +g.read || +g.reading || 2,
        listen: +g.listen || +g.listening || 2,
        trans: +g.trans || +g.translation || 1,
        write: +g.write || +g.writing || 1
      };
    }
    if (raw.wordPerDay) d.word.perDay = +raw.wordPerDay || 20;
    if (raw.lib) d.word.lib = raw.lib;
    if (raw.word && typeof raw.word === 'object') {
      d.word.perDay = +raw.word.perDay || d.word.perDay;
      d.word.lib = raw.word.lib || d.word.lib;
      d.word.mode = raw.word.mode || d.word.mode;
    }
    if (!LIB_META[d.word.lib]) d.word.lib = 'c6key';

    // 旧版天数记录字段名
    var days = raw.days || raw.history || {};
    if (days && typeof days === 'object') {
      Object.keys(days).forEach(function (date) {
        var o = days[date] || {};
        d.days[date] = {
          w: +o.w || +o.words || +o.word || 0,
          r: +o.r || +o.read || +o.reading || 0,
          l: +o.l || +o.listen || +o.listening || 0,
          t: +o.t || +o.trans || +o.translation || 0,
          p: +o.p || +o.write || +o.writing || 0,
          carry: o.carry !== false
        };
      });
    }

    if (raw.marks && typeof raw.marks === 'object') d.marks = raw.marks;
    if (Array.isArray(raw.news)) d.news = raw.news.filter(function (x) { return typeof x === 'string'; });
    if (Array.isArray(raw.sources)) {
      d.sources = raw.sources.map(function (s) {
        return {
          id: s.id || ('s' + Math.random().toString(36).slice(2, 8)),
          name: s.name || '未命名来源',
          note: s.note || '',
          kind: s.kind || 'read',
          fixed: false,
          items: (Array.isArray(s.items) ? s.items : []).map(function (it, i) {
            return {
              id: it.id || ('c' + Date.now().toString(36) + i),
              title: String(it.title || '未命名'),
              url: it.url || '',
              level: it.level === 'hard' ? 'hard' : (it.level === 'easy' ? 'easy' : (it.level || '')),
              min: +it.min || 0
            };
          }).slice(0, MAX_SOURCE_ITEMS)
        };
      });
    }
    if (raw.seen && typeof raw.seen === 'object') {
      ['read', 'listen', 'trans', 'write'].forEach(function (k) {
        if (raw.seen[k] && typeof raw.seen[k] === 'object') d.seen[k] = raw.seen[k];
      });
    }
    if (raw.seenOrder && typeof raw.seenOrder === 'object') d.seenOrder = raw.seenOrder;
    if (raw.settings && typeof raw.settings === 'object') {
      d.settings.remind = raw.settings.remind !== false;
      d.settings.at = raw.settings.at || d.settings.at;
      d.settings.sample = raw.settings.sample !== false;
    }
    if (raw.push && typeof raw.push === 'object') d.push = raw.push;
    if (raw.poolV) d.poolV = +raw.poolV;
    return d;
  }

  var State = null;

  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    State = migrate(raw);
    if (!raw) seedSamples(State);
    return State;
  }

  var saveTimer = null, saveCb = null;
  function save(immediate) {
    if (saveCb) saveCb('saving');
    var write = function () {
      try {
        localStorage.setItem(KEY, JSON.stringify(State));
        if (saveCb) saveCb('saved');
      } catch (e) {
        if (saveCb) saveCb('error');
      }
    };
    if (immediate) { clearTimeout(saveTimer); write(); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(write, 220);
  }
  function onSave(cb) { saveCb = cb; }

  /* ---------------- 首次示例数据 ---------------- */
  function seedSamples(st) {
    var today = todayStr();
    // 最近 6 天：含完成、含未完成
    var plan = [
      { d: 6, w: 34, r: 2, l: 2, t: 1, p: 1 },
      { d: 5, w: 20, r: 1, l: 1, t: 1, p: 0 },
      { d: 4, w: 26, r: 2, l: 2, t: 1, p: 1 },
      { d: 3, w: 0, r: 0, l: 0, t: 0, p: 0 },
      { d: 2, w: 22, r: 2, l: 2, t: 1, p: 1 },
      { d: 1, w: 12, r: 1, l: 0, t: 1, p: 0 }
    ];
    plan.forEach(function (p) {
      st.days[shift(today, -p.d)] = { w: p.w, r: p.r, l: p.l, t: p.t, p: p.p, carry: true };
    });
    st.settings.sample = true;
  }

  function clearSamples(st) {
    var today = todayStr();
    for (var i = 1; i <= 6; i++) delete st.days[shift(today, -i)];
    st.settings.sample = false;
  }

  /* =========================================================
     词库
     ========================================================= */
  var V = DB.vocab || { words: [], libs: {} };
  var WORD_INDEX = {};
  (V.words || []).forEach(function (w, i) { WORD_INDEX[w[0]] = i; });

  function libList(lib) {
    if (lib === 'news') {
      return State.news.map(function (w) { return WORD_INDEX[w]; })
        .filter(function (i) { return typeof i === 'number'; });
    }
    return (V.libs && V.libs[lib]) || [];
  }
  function libCount(lib) { return libList(lib).length; }

  function wordBatch(date) {
    var list = libList(State.word.lib);
    var per = State.word.perDay;
    if (!list.length) return { words: [], total: 0, start: 0, per: per, batchNo: 1, batches: 1 };
    var start = ((dayIndex(date) * per) % list.length + list.length) % list.length;
    var picked = [];
    for (var i = 0; i < Math.min(per, list.length); i++) picked.push(list[(start + i) % list.length]);
    var batchNo = Math.floor(start / per) + 1;
    var batches = Math.max(1, Math.ceil(list.length / per));
    return {
      words: picked.map(function (i) { return V.words[i]; }),
      total: list.length, start: start, per: per, batchNo: batchNo, batches: batches,
      from: start + 1, to: Math.min(start + per, list.length), wraps: start + per > list.length
    };
  }

  var SUFFIX = {
    n: [['tion', '名词后缀 -tion'], ['sion', '名词后缀 -sion'], ['ment', '名词后缀 -ment'], ['ness', '名词后缀 -ness'],
      ['ity', '名词后缀 -ity'], ['ance', '名词后缀 -ance'], ['ence', '名词后缀 -ence'], ['ship', '名词后缀 -ship'],
      ['hood', '名词后缀 -hood'], ['ism', '名词后缀 -ism'], ['ist', '名词后缀 -ist'], ['ure', '名词后缀 -ure'], ['age', '名词后缀 -age']],
    adj: [['ous', '形容词后缀 -ous'], ['ful', '形容词后缀 -ful'], ['less', '形容词后缀 -less'], ['able', '形容词后缀 -able'],
      ['ible', '形容词后缀 -ible'], ['ive', '形容词后缀 -ive'], ['ical', '形容词后缀 -ical'], ['ic', '形容词后缀 -ic'],
      ['ish', '形容词后缀 -ish'], ['ary', '形容词后缀 -ary'], ['ant', '形容词后缀 -ant'], ['ent', '形容词后缀 -ent']],
    v: [['ize', '动词后缀 -ize'], ['ise', '动词后缀 -ise'], ['ify', '动词后缀 -ify'], ['ate', '动词后缀 -ate'], ['en', '动词后缀 -en']],
    adv: [['ly', '副词后缀 -ly'], ['ward', '副词后缀 -ward'], ['wise', '副词后缀 -wise']]
  };

  function suffixHint(word, pos) {
    if (!pos) return '';
    var p = String(pos);
    var cat = /^adv/.test(p) ? 'adv' : /^n\./.test(p) ? 'n' : /^adj/.test(p) ? 'adj' : /^v\./.test(p) ? 'v' : '';
    if (!cat) return '';
    var low = String(word).toLowerCase();
    var list = SUFFIX[cat] || [];
    for (var i = 0; i < list.length; i++) {
      var suf = list[i][0];
      if (low.length > suf.length + 2 && low.slice(-suf.length) === suf) return list[i][1] + ' · 与词性一致';
    }
    return '';
  }

  function speak(text) {
    try {
      if (!window.speechSynthesis) return false;
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = .9;
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }

  /* =========================================================
     素材池
     ========================================================= */
  var BUILTIN = {
    read: (DB.reading || []).map(function (x) {
      return { id: x.id, title: x.title, url: x.url, src: x.src, stars: x.stars, min: x.min, level: x.level, custom: false };
    }),
    listen: (DB.listening || []).map(function (x) {
      return { id: x.id, title: x.title, url: x.url, src: x.src, stars: 0, min: x.min, grp: x.grp, custom: false };
    }),
    trans: (DB.translation || []).map(function (x) {
      return { id: x.id, title: x.tp, zh: x.zh, en: x.en, tip: x.tip, level: x.lv, min: 8, src: '内置题库', custom: false };
    }),
    write: (DB.writing || []).map(function (x) {
      return { id: x.id, title: x.ti, tp: x.tp, dir: x.dir, ol: x.ol, fr: x.fr, es: x.es, ph: x.ph, min: 20, src: '内置题库', custom: false };
    })
  };

  function customItems(kind) {
    var out = [];
    State.sources.forEach(function (s) {
      if (s.kind !== kind) return;
      s.items.forEach(function (it) {
        out.push({
          id: 'c:' + s.id + ':' + it.id,
          title: it.title,
          url: it.url,
          src: s.name,
          stars: it.level === 'hard' ? 4 : 3,
          min: it.min || (kind === 'listen' ? 12 : 10),
          level: it.level || '',
          custom: true
        });
      });
    });
    return out;
  }

  function poolFor(part) {
    if (part === 'read-easy') return BUILTIN.read.filter(function (x) { return x.level === 'easy'; })
      .concat(customItems('read').filter(function (x) { return x.level !== 'hard'; }));
    if (part === 'read-hard') return BUILTIN.read.filter(function (x) { return x.level === 'hard'; })
      .concat(customItems('read').filter(function (x) { return x.level === 'hard'; }));
    if (part === 'listen') return BUILTIN.listen.concat(customItems('listen'));
    if (part === 'trans-easy') return BUILTIN.trans.filter(function (x) { return x.level === 'easy'; })
      .concat(customItems('trans').filter(function (x) { return x.level !== 'hard'; }));
    if (part === 'trans-hard') return BUILTIN.trans.filter(function (x) { return x.level === 'hard'; })
      .concat(customItems('trans').filter(function (x) { return x.level === 'hard'; }));
    if (part === 'write') return BUILTIN.write.concat(customItems('write'));
    return [];
  }

  function allCustom(part) {
    var kind = part.indexOf('read') === 0 ? 'read' : part === 'listen' ? 'listen' : part.indexOf('trans') === 0 ? 'trans' : 'write';
    var all = customItems(kind);
    if (part === 'read-easy' || part === 'trans-easy') return all.filter(function (x) { return x.level !== 'hard'; });
    if (part === 'read-hard' || part === 'trans-hard') return all.filter(function (x) { return x.level === 'hard'; });
    return all;
  }

  function poolSig(part) {
    var p = poolFor(part);
    var ids = p.map(function (x) { return x.id; }).sort().join(',');
    return p.length + '#' + hash32(ids).toString(36);
  }

  function seenKey(part) {
    return part.indexOf('read') === 0 ? 'read' : part === 'listen' ? 'listen' : part.indexOf('trans') === 0 ? 'trans' : 'write';
  }

  function restFor(part, poolLen) {
    if (part.indexOf('read') === 0) return Math.max(1, poolLen);            // 阅读：整档轮完才回头
    if (part === 'listen') return Math.max(6, Math.round(poolLen * 0.66));  // 听力：max(6, 池长×0.66)
    if (part.indexOf('trans') === 0) return Math.max(1, poolLen * 2);       // 翻译：档位池长 × 2
    return Math.max(1, poolLen);                                            // 写作：整池轮完
  }

  function target_n(part) {
    if (part === 'listen') return 2;
    return 1;
  }

  function drawPool(part, today) {
    var pool = poolFor(part);
    var key = seenKey(part);
    var seen = State.seen[key] || {};
    var rest = restFor(part, pool.length);
    var seed = hash32(today + '|' + part + '|' + State.poolV + '|' + poolSig(part));
    var idx = dayIndex(today);

    var eligible = pool.filter(function (x) {
      var last = seen[x.id];
      return last === undefined || (idx - last) >= rest;
    });
    var picked = shuffle(eligible, seed).slice(0, target_n(part));

    // 补位：不够时按「最久没出现」补满
    if (picked.length < target_n(part)) {
      var chosen = {};
      picked.forEach(function (x) { chosen[x.id] = 1; });
      var restPool = pool.filter(function (x) { return !chosen[x.id]; })
        .map(function (x, i) { return { x: x, last: seen[x.id] === undefined ? -1e9 : seen[x.id], i: i }; })
        .sort(function (a, b) { return a.last - b.last || a.i - b.i; });
      for (var i = 0; i < restPool.length && picked.length < target_n(part); i++) {
        picked.push(restPool[i].x);
      }
    }
    return picked;
  }

  function drawListen(today) {
    var pool = poolFor('listen');
    var seen = State.seen.listen || {};
    var rest = restFor('listen', pool.length);
    var seed = hash32(today + '|listen|' + State.poolV + '|' + poolSig('listen'));
    var idx = dayIndex(today);

    var eligible = pool.filter(function (x) {
      var last = seen[x.id];
      return last === undefined || (idx - last) >= rest;
    });
    var ordered = shuffle(eligible, seed);

    // 补位
    if (!ordered.length) {
      ordered = pool.slice().map(function (x, i) { return { x: x, last: seen[x.id] === undefined ? -1e9 : seen[x.id], i: i }; })
        .sort(function (a, b) { return a.last - b.last || a.i - b.i; })
        .map(function (o) { return o.x; });
    }

    var capped = ordered.filter(function (x) { return x.min <= 30; });
    var seq = capped.length ? capped : ordered;   // 单条就超 30 分钟时才退让

    var picked = [];
    var sum = 0;
    for (var i = 0; i < seq.length && picked.length < 2; i++) {
      var it = seq[i];
      if (picked.length === 0) {
        if (it.min > 30) continue;
        picked.push(it); sum += it.min; continue;
      }
      if (sum + it.min <= 30 && sum < 20) { picked.push(it); sum += it.min; }
    }

    if (!picked.length && seq.length) picked = [seq[0]];   // 极端兜底，绝不空手

    // 只凑出一条且不足 15 分钟 → 换一条 18–30 分钟的单条
    if (picked.length === 1 && picked[0].min < 15) {
      var longOne = pool.filter(function (x) { return x.min >= 18 && x.min <= 30; })
        .map(function (x, i) { return { x: x, last: seen[x.id] === undefined ? -1e9 : seen[x.id], i: i }; })
        .sort(function (a, b) { return a.last - b.last || a.i - b.i; })[0];
      if (longOne) picked = [longOne.x];
    }
    return picked;
  }

  function forceCustom(part, list) {
    var cust = allCustom(part);
    if (!cust.length) return list;
    var hasCustom = list.some(function (x) { return x.custom; });
    if (hasCustom) return list;
    // 优先挑最久没出现的自建条目
    var key = seenKey(part);
    var seen = State.seen[key] || {};
    cust.sort(function (a, b) {
      var la = seen[a.id] === undefined ? -1e9 : seen[a.id];
      var lb = seen[b.id] === undefined ? -1e9 : seen[b.id];
      return la - lb;
    });
    var pick = cust[0];
    if (part === 'listen') {
      var out = [pick].concat(list);
      return out.slice(0, 2);
    }
    return [pick];
  }

  function pushFor(date) {
    var p = State.push[date];
    if (!p || p.v !== SCHEMA) return null;
    return p;
  }

  function buildPush(date) {
    var res = {};
    res.re = forceCustom('read-easy', drawPool('read-easy', date)).map(function (x) { return x.id; });
    res.rh = forceCustom('read-hard', drawPool('read-hard', date)).map(function (x) { return x.id; });
    res.l = forceCustom('listen', drawListen(date)).map(function (x) { return x.id; });
    var tpart = dayIndex(date) % 2 === 0 ? 'trans-easy' : 'trans-hard';
    res.t = forceCustom(tpart, drawPool(tpart, date)).map(function (x) { return x.id; });
    res.tl = tpart === 'trans-easy' ? 'easy' : 'hard';
    res.w = forceCustom('write', drawPool('write', date)).map(function (x) { return x.id; });
    res.sig = {
      re: poolSig('read-easy'), rh: poolSig('read-hard'),
      l: poolSig('listen'), t: poolSig(tpart), w: poolSig('write')
    };
    res.poolV = State.poolV;
    res.v = SCHEMA;
    res.date = date;
    return res;
  }

  function getPush(date) {
    var p = pushFor(date);
    var tpart = dayIndex(date) % 2 === 0 ? 'trans-easy' : 'trans-hard';
    var need = { re: poolSig('read-easy'), rh: poolSig('read-hard'), l: poolSig('listen'), t: poolSig(tpart), w: poolSig('write') };
    var valid = p && p.sig && ['re', 'rh', 'l', 't', 'w'].every(function (k) { return p.sig[k] === need[k]; });
    if (!valid) {
      p = buildPush(date);
      State.push[date] = p;
      markSeen(date, p);
      prunePush();
      save();
    }
    return p;
  }

  function findItem(part, id) {
    var pool = poolFor(part);
    for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
    return null;
  }

  function pushItems(date) {
    var p = getPush(date);
    var out = { read: [], listen: [], trans: [], write: [], transLevel: p.tl };
    p.re.forEach(function (id) { var x = findItem('read-easy', id); if (x) out.read.push(x); });
    p.rh.forEach(function (id) { var x = findItem('read-hard', id); if (x) out.read.push(x); });
    p.l.forEach(function (id) { var x = findItem('listen', id); if (x) out.listen.push(x); });
    p.t.forEach(function (id) { var x = findItem('trans-' + p.tl, id); if (x) out.trans.push(x); });
    p.w.forEach(function (id) { var x = findItem('write', id); if (x) out.write.push(x); });
    return out;
  }

  function markSeen(date, p) {
    var idx = dayIndex(date);
    var map = { read: p.re.concat(p.rh), listen: p.l, trans: p.t, write: p.w };
    Object.keys(map).forEach(function (k) {
      var store = State.seen[k] || (State.seen[k] = {});
      var order = State.seenOrder[k] || (State.seenOrder[k] = []);
      map[k].forEach(function (id) {
        store[id] = idx;
        var at = order.indexOf(id);
        if (at >= 0) order.splice(at, 1);
        order.push(id);
      });
      while (order.length > MAX_SEEN) {
        var old = order.shift();
        delete store[old];
      }
    });
  }

  function prunePush() {
    var dates = Object.keys(State.push).sort();
    while (dates.length > MAX_PUSH) delete State.push[dates.shift()];
  }

  /* =========================================================
     打卡与统计
     ========================================================= */
  function getDay(date) { return State.days[date] || null; }
  function ensureDay(date) {
    if (!State.days[date]) State.days[date] = { w: 0, r: 0, l: 0, t: 0, p: 0, carry: true };
    return State.days[date];
  }

  function baseTargets() {
    var g = State.goals;
    return { w: Math.max(1, g.word), r: Math.max(1, g.read), l: Math.max(1, g.listen), t: Math.max(1, g.trans), p: Math.max(1, g.write) };
  }

  // 逾期只顺延一天：昨天的缺口并入今天；可手动关掉
  function targetsFor(date) {
    var base = baseTargets();
    var d = getDay(date);
    if (d && d.carry === false) return base;
    var prev = shift(date, -1);
    var pd = getDay(prev);
    if (!pd) return base;
    var out = {};
    ['w', 'r', 'l', 't', 'p'].forEach(function (k) {
      var gap = Math.max(0, base[k] - (pd[k] || 0));
      out[k] = base[k] + gap;
    });
    return out;
  }

  function carryGaps(date) {
    var base = baseTargets();
    var d = getDay(date);
    if (d && d.carry === false) return null;
    var pd = getDay(shift(date, -1));
    if (!pd) return null;
    var g = {}, any = 0;
    ['w', 'r', 'l', 't', 'p'].forEach(function (k) {
      var gap = Math.max(0, base[k] - (pd[k] || 0));
      g[k] = gap;
      any += gap;
    });
    return any > 0 ? g : null;
  }

  function statsFor(date) {
    var d = getDay(date) || { w: 0, r: 0, l: 0, t: 0, p: 0 };
    var tg = targetsFor(date);
    var items = SUBJECTS.map(function (s) {
      var done = Math.max(0, +d[s.k] || 0);
      var target = tg[s.k];
      return {
        k: s.k, name: s.name, color: s.color, unit: s.unit,
        done: done, target: target, ok: done >= target,
        gap: Math.max(0, target - done),
        pct: Math.min(1, done / Math.max(1, target))
      };
    });
    var okCount = items.filter(function (i) { return i.ok; }).length;
    return { items: items, okCount: okCount, complete: okCount === 5, targets: tg, raw: d };
  }

  function addCount(date, key, n) {
    var d = ensureDay(date);
    d[key] = Math.max(0, (+d[key] || 0) + n);
    save();
    return d[key];
  }
  function setCount(date, key, v) {
    var d = ensureDay(date);
    d[key] = Math.max(0, +v || 0);
    save();
  }
  function setAllDone(date) {
    var st = statsFor(date);
    var d = ensureDay(date);
    st.items.forEach(function (i) { d[i.k] = Math.max(d[i.k] || 0, i.target); });
    save();
  }

  function streak(today) {
    var n = 0, cur = today;
    if (!statsFor(today).complete) cur = shift(today, -1);
    while (statsFor(cur).complete) { n++; cur = shift(cur, -1); }
    return n;
  }

  function totalFive() {
    var sum = 0;
    Object.keys(State.days).forEach(function (d) {
      var o = State.days[d];
      sum += (o.w || 0) + (o.r || 0) + (o.l || 0) + (o.t || 0) + (o.p || 0);
    });
    return sum;
  }

  function weekRate(today) {
    var done = 0;
    for (var i = 0; i < 7; i++) if (statsFor(shift(today, -i)).complete) done++;
    return done / 7;
  }

  function firstRecordDate() {
    var ds = Object.keys(State.days).sort();
    return ds.length ? ds[0] : State.created;
  }

  function rangeStat(days, today) {
    var start = shift(today, -(days - 1));
    var sum = { w: 0, r: 0, l: 0, t: 0, p: 0 }, meet = { w: 0, r: 0, l: 0, t: 0, p: 0 }, complete = 0;
    for (var i = 0; i < days; i++) {
      var date = shift(start, i);
      var st = statsFor(date);
      st.items.forEach(function (it) {
        sum[it.k] += it.done;
        if (it.ok) meet[it.k]++;
      });
      if (st.complete) complete++;
    }
    return { days: days, start: start, sum: sum, meet: meet, complete: complete };
  }

  function subjectRates() {
    var start = firstRecordDate(), today = todayStr();
    var total = Math.max(1, daysBetween(start, today) + 1);
    var meet = { w: 0, r: 0, l: 0, t: 0, p: 0 };
    var cur = start;
    while (dayIndex(cur) <= dayIndex(today)) {
      var st = statsFor(cur);
      st.items.forEach(function (it) { if (it.ok) meet[it.k]++; });
      cur = shift(cur, 1);
    }
    return SUBJECTS.map(function (s) {
      return { k: s.k, name: s.name, color: s.color, rate: meet[s.k] / total, meet: meet[s.k], days: total };
    });
  }

  function examDaysLeft() {
    return daysBetween(todayStr(), State.examDate);
  }

  /* ---------------- 对外导出 ---------------- */
  global.Core = {
    DB: DB, SCHEMA: SCHEMA, KEY: KEY, MAX_SEEN: MAX_SEEN, MAX_SOURCE_ITEMS: MAX_SOURCE_ITEMS,
    SUBJECTS: SUBJECTS, SUBJ: SUBJ, WORD_OPTIONS: WORD_OPTIONS, LIB_META: LIB_META, LIB_ORDER: LIB_ORDER,
    ICONS: ICONS, COLORS: COLORS,
    esc: esc, truncate: truncate, ymd: ymd, todayStr: todayStr, parseYmd: parseYmd, dayIndex: dayIndex,
    shift: shift, dateCN: dateCN, weekdayCN: weekdayCN, daysBetween: daysBetween,
    hash32: hash32, mulberry32: mulberry32, shuffle: shuffle,
    parseImport: parseImport, cleanTitle: cleanTitle, extractUrl: extractUrl, platformOf: platformOf,
    titleFromUrl: titleFromUrl, hostOf: hostOf,
    load: load, save: save, onSave: onSave, migrate: migrate,
    clearSamples: clearSamples, seedSamples: seedSamples,
    state: function () { return State; },
    libCount: libCount, libList: libList, wordBatch: wordBatch, suffixHint: suffixHint, speak: speak,
    poolFor: poolFor, getPush: getPush, pushItems: pushItems, findItem: findItem, customItems: customItems,
    resetPush: function (date) {
      delete State.push[date];
      var p = buildPush(date);
      State.push[date] = p;
      markSeen(date, p);
      save(true);
      return p;
    },
    invalidatePush: function () {
      State.poolV = (State.poolV || 1) + 1;
      State.push = {};
      save(true);
    },
    statsFor: statsFor, targetsFor: targetsFor, carryGaps: carryGaps, addCount: addCount, setCount: setCount,
    setAllDone: setAllDone, getDay: getDay, ensureDay: ensureDay, baseTargets: baseTargets,
    streak: streak, totalFive: totalFive, weekRate: weekRate, rangeStat: rangeStat,
    subjectRates: subjectRates, examDaysLeft: examDaysLeft, firstRecordDate: firstRecordDate
  };
})(window);
