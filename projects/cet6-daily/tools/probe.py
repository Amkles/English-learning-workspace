#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""诊断横向溢出：把超出视口的元素写进 <pre id="dbg">，再用 --dump-dom 抓回来。"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index.html')
TMP = os.path.join(ROOT, 'tools', '.shots', 'debug.html')
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
W = sys.argv[1] if len(sys.argv) > 1 else '400'
H = sys.argv[2] if len(sys.argv) > 2 else '900'
ROUTE = sys.argv[3] if len(sys.argv) > 3 else 'today'

with open(SRC, encoding='utf-8') as f:
    html = f.read()

probe = """
<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    window.App.go('%s');
    setTimeout(function () {
      var vw = document.documentElement.clientWidth;
      var out = ['viewport=' + vw + ' scrollWidth=' + document.documentElement.scrollWidth];
      var all = document.querySelectorAll('body *');
      for (var i = 0; i < all.length; i++) {
        var el = all[i], r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.width > vw + 1) {
          var cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '';
          out.push(el.tagName.toLowerCase() + '.' + String(cls).split(' ').join('.') +
            '  w=' + Math.round(r.width) + ' right=' + Math.round(r.right) +
            ' text=' + (el.textContent || '').slice(0, 24).replace(/\\s+/g, ' '));
        }
        if (out.length > 60) break;
      }
      var pre = document.createElement('pre');
      pre.id = 'dbg';
      pre.textContent = out.join('\\n');
      document.body.appendChild(pre);
    }, 200);
  }, 80);
});
</script>
""" % ROUTE

html = html.replace('</body>', probe + '</body>')
os.makedirs(os.path.dirname(TMP), exist_ok=True)
with open(TMP, 'w', encoding='utf-8') as f:
    f.write(html)

res = subprocess.run([
    CHROME, '--headless=old', '--disable-gpu', '--hide-scrollbars',
    '--window-size=%s,%s' % (W, H), '--virtual-time-budget=4000', '--dump-dom',
    'file:///' + TMP.replace('\\', '/'),
], capture_output=True, text=True, encoding='utf-8', errors='replace')

dom = res.stdout or ''
start = dom.find('id="dbg"')
print(dom[start:start + 4000] if start > 0 else '没拿到诊断输出\n' + dom[:600])
