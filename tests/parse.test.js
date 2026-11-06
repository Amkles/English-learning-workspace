/* 附一 · 11 条解析验收用例（node tests/parse.test.js） */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/' });
const { window } = dom;
const C = window.Core;

function p(text) { return C.parseImport(text).map(x => ({ title: x.title, url: x.url })); }

const cases = [
  {
    n: 1,
    input: '【六级听力真题精讲｜2023年12月第一套】 https://www.bilibili.com/video/BV1xx411c7mD',
    want: [{ title: '六级听力真题精讲｜2023年12月第一套', url: 'https://www.bilibili.com/video/BV1xx411c7mD' }],
  },
  {
    n: 2,
    input: '59 【震惊！六级阅读原来这样读 - 小红书】 http://xhslink.com/a/xyz，复制本条信息，打开【小红书】App查看精彩内容！',
    want: [{ title: '震惊！六级阅读原来这样读', url: 'http://xhslink.com/a/xyz' }],
  },
  {
    n: 3,
    input: '7.43 复制打开抖音，看看【英语老师Wendy的作品】六级作文万能句 https://v.douyin.com/iRxY8qK/',
    want: [{ title: '六级作文万能句', url: 'https://v.douyin.com/iRxY8qK/' }],
  },
  {
    n: 4,
    input: 'TED: How to speak so people listen\nhttps://www.ted.com/talks/x',
    want: [{ title: 'TED: How to speak so people listen', url: 'https://www.ted.com/talks/x' }],
  },
  {
    n: 5,
    input: 'WEF 原文 | https://www.weforum.org/stories/2025/01/x/',
    want: [{ title: 'WEF 原文', url: 'https://www.weforum.org/stories/2025/01/x/' }],
  },
  {
    n: 6,
    input: 'b23.tv/abc123',
    want: [{ title: 'B站视频', url: 'https://b23.tv/abc123' }],
  },
  {
    n: 7,
    input: '[{"title":"A篇","url":"https://a.com/1"}]',
    want: [{ title: 'A篇', url: 'https://a.com/1' }],
  },
  {
    n: 8,
    input: '<rss><item><title>C篇</title><link>https://c.com/3</link></item></rss>',
    want: [{ title: 'C篇', url: 'https://c.com/3' }],
  },
  {
    n: 9,
    input: 'BV1xx411c7mD https://www.bilibili.com/video/BV1xx411c7mD',
    want: [{ title: 'B站视频', url: 'https://www.bilibili.com/video/BV1xx411c7mD' }],
  },
  {
    n: 10,
    input: '【专八】 https://www.bilibili.com/video/BV1zz',
    want: [{ title: '专八', url: 'https://www.bilibili.com/video/BV1zz' }],
  },
  {
    n: 11,
    input: '【六级写作模板】 https://www.bilibili.com/video/BV1yy #英语学习# #六级#',
    want: [{ title: '六级写作模板', url: 'https://www.bilibili.com/video/BV1yy' }],
  },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const got = p(c.input);
  const ok = got.length === c.want.length && got.every((g, i) =>
    g.title === c.want[i].title && g.url === c.want[i].url);
  if (ok) { pass++; console.log(`  ✓ #${c.n} ${c.want[0].title}  →  ${c.want[0].url}`); }
  else {
    fail++;
    console.log(`  ✗ #${c.n} 期望 ${JSON.stringify(c.want)}\n         实际 ${JSON.stringify(got)}`);
  }
}

// 额外：解析 0 条不抛错
const zero = C.parseImport('随便一段没有任何链接的文字');
if (zero.length === 0) { pass++; console.log('  ✓ 额外：无链接文本解析为 0 条'); }
else { fail++; console.log('  ✗ 无链接文本竟然解析出内容'); }

// 额外：注释行与重复链接
const mix = p('# 这是注释\nA | https://a.com/1\nA again | https://a.com/1/');
if (mix.length === 1) { pass++; console.log('  ✓ 额外：注释跳过、重复链接去重'); }
else { fail++; console.log('  ✗ 注释/去重异常', mix); }

console.log(`\n解析用例：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
