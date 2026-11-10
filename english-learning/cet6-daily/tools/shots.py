#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用本机 Chrome 无头模式给工作台截屏。

用法：
    python tools/shots.py            # 生成 docs/screenshots 下全部图
    python tools/shots.py --check    # 只截到 tools/.shots/ 供人工检查

原理：复制一份 index.html 到临时目录，在 </body> 前注入一段脚本，
按需写入示例历史数据、切路由、打开抽屉，再让 Chrome 出图。
"""
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index.html')
OUT = os.path.join(ROOT, 'docs', 'screenshots')
TMP = os.path.join(ROOT, 'tools', '.shots')

CHROME_CANDIDATES = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

# 造一段像样的使用历史：近 78 天，最近 10 天全部达标，今天 4/5
SEED = r"""
(function () {
  var C = window.Core, S = C.state();
  var seed = 20261106;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  S.days = {}; S.seen = {}; S.seenOrder = {}; S.push = {};
  for (var i = 77; i >= 1; i--) {
    var d = C.shift(C.todayStr(), -i);
    var r = rnd();
    if (r < 0.05) continue;                        // 整天没打开
    var full = i <= 10 || r > 0.3;
    var day = { w: 20 + Math.floor(rnd() * 4), r: 2, l: 2, t: 1, p: 1, carry: false };
    if (!full) {
      day.w = Math.floor(rnd() * 20);
      if (rnd() > 0.55) day.l = 0;
      if (rnd() > 0.6) day.t = 0;
      if (rnd() > 0.7) day.p = 0;
    }
    S.days[d] = day;
  }
  S.days[C.todayStr()] = { w: 20, r: 2, l: 2, t: 1, p: 0, carry: true };
  C.save(true);
})();
"""

SHOTS = [
    # 文件名, 路由, 宽, 高, 注入脚本
    ('desktop-today.png', 'today', 1440, 1660, SEED),
    ('desktop-goals.png', 'goals', 1440, 1400, SEED),
    ('desktop-stats.png', 'stats', 1440, 1500, SEED),
    ('desktop-settings.png', '', 1440, 980, SEED + '''
      window.App.render();
      document.querySelector('[data-act="open-drawer"]').click();'''),
    ('mobile-today.png', 'today', 390, 844, SEED),
    ('mobile-stats.png', 'stats', 390, 844, SEED),
]


def chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    raise SystemExit('没找到 Chrome / Edge，装一个再来')


def build_page(route, inject, out_html):
    with open(SRC, encoding='utf-8') as f:
        html = f.read()
    tail = """
<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    %s
    %s
  }, 80);
});
</script>
""" % (inject, ("window.App.go('%s');" % route) if route else '')
    html = html.replace('</body>', tail + '</body>')
    with open(out_html, 'w', encoding='utf-8') as f:
        f.write(html)


def shoot(binary, page, w, h, out_png, route):
    """窄屏用 iframe 撑出真实视口——Chrome 的窗口最小宽度约 500px，
    直接 --window-size=390 会被撑大，截出来是错的。"""
    target = page
    win_w = w
    if w < 520:
        win_w = 520
        wrap = os.path.join(os.path.dirname(page), '_wrap.html')
        with open(wrap, 'w', encoding='utf-8') as f:
            f.write(
                '<!doctype html><meta charset="utf-8">'
                '<style>html,body{margin:0;background:#FCF2F6;display:flex;justify-content:center}'
                'iframe{display:block;width:%dpx;height:%dpx;border:0;background:#FCF2F6}'
                '</style><iframe src="%s"></iframe>' % (w, h, os.path.basename(page))
            )
        target = wrap
    cmd = [
        binary, '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--force-device-scale-factor=2', '--window-size=%d,%d' % (win_w, h),
        '--virtual-time-budget=5000',
        '--screenshot=' + out_png,
        'file:///' + target.replace('\\', '/'),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    check = '--check' in sys.argv
    dest = TMP if check else OUT
    for d in (dest, TMP):
        os.makedirs(d, exist_ok=True)
    binary = chrome()
    for name, route, w, h, inject in SHOTS:
        page = os.path.join(TMP, name.replace('.png', '.html'))
        png = os.path.join(dest, name)
        build_page(route, inject, page)
        shoot(binary, page, w, h, png, route)
        print('→', os.path.relpath(png, ROOT))
    if not check:
        shutil.rmtree(TMP, ignore_errors=True)


if __name__ == '__main__':
    main()
