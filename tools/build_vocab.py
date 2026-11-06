#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 qwerty-learner 的公开词书压缩成打卡台用的单文件词库数据。

数据来源（MIT 许可，仓库 https://github.com/Kaiyiwing/qwerty-learner）：
  public/dicts/CET4_T.json        2607 词
  public/dicts/CET6_T.json        2345 词
  public/dicts/GaoKao_3500.json   3893 词（用于反推「重点库」）

四个库的定义：
  四级全库   = CET4_T                        2607
  四级重点库 = CET4_T - 高考3500              1302
  六级全库   = CET6_T                        2345
  六级重点库 = CET6_T - CET4_T                1313

输出 data/vocab.json，结构：
  {"src": "...", "words": [[word, phone, pos, def], ...],
   "libs": {"c4all": [索引...], "c4key": [...], "c6all": [...], "c6key": [...]}}
"""
import json
import os
import re
import sys
import urllib.request

CACHE = os.path.join(os.path.dirname(__file__), ".cache")
BASE = "https://cdn.jsdelivr.net/gh/Kaiyiwing/qwerty-learner@master/public/dicts/"
FILES = {"c4": "CET4_T.json", "c6": "CET6_T.json", "gk": "GaoKao_3500.json"}

POS_MAP = [
    ("vt", "vt."), ("vi", "vi."), ("v", "v."),
    ("n", "n."), ("adj", "adj."), ("adv", "adv."),
    ("prep", "prep."), ("conj", "conj."), ("pron", "pron."),
    ("num", "num."), ("art", "art."), ("int", "int."), ("aux", "aux."),
]
POS_RE = re.compile(r"[(（]\s*(vt|vi|v|n|adj|adv|prep|conj|pron|num|art|int|aux)\.?\s*[)）]", re.I)


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return json.load(open(path, encoding="utf-8"))
    url = BASE + name
    print("  downloading", url, file=sys.stderr)
    req = urllib.request.Request(url, headers={"User-Agent": "cet6-daily-build/1.0"})
    raw = urllib.request.urlopen(req, timeout=90).read().decode("utf-8")
    open(path, "w", encoding="utf-8").write(raw)
    return json.loads(raw)


def norm_phone(p):
    if not p:
        return ""
    p = p.split(";")[0].strip()
    p = p.replace("'", "ˈ").replace(",", "ˌ").strip()
    return p


def take_pos(trans_list):
    """只在释义里显式标了词性时才返回，否则返回空串（宁缺勿错）。"""
    text = " ".join(trans_list)
    hits = []
    for m in POS_RE.finditer(text):
        code = m.group(1).lower()
        hits.append(code)
    if not hits:
        return ""
    uniq = []
    for h in hits:
        mapped = dict(POS_MAP).get(h, h + ".")
        if mapped not in uniq:
            uniq.append(mapped)
    # vt./vi. 合并成 v.
    if set(uniq) <= {"vt.", "vi."}:
        return "v."
    return " / ".join(uniq[:2])


def clean_defs(trans_list):
    """释义截短：按 ；和 ，切分，去重，最多 3 条，每条 ≤ 22 字。"""
    out = []
    for t in trans_list:
        t = POS_RE.sub("", t)
        t = t.replace("（", "(").replace("）", ")")
        for part in re.split(r"[；;]", t):
            for piece in re.split(r"[，,]", part):
                piece = piece.strip(" .。·\t")
                piece = re.sub(r"\s+", " ", piece)
                if not piece or len(piece) > 26:
                    continue
                if piece not in out:
                    out.append(piece)
    return out[:3]


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print("fetching dictionaries ...", file=sys.stderr)
    d4, d6, gk = (fetch(FILES[k]) for k in ("c4", "c6", "gk"))

    gk_set = {(x.get("name") or "").strip().lower() for x in gk}
    c4_set = {(x.get("name") or "").strip().lower() for x in d4}

    words, index = [], {}

    def add(entry, lib):
        key = (entry.get("name") or "").strip()
        low = key.lower()
        if not key:
            return
        if low not in index:
            index[low] = len(words)
            words.append([
                key,
                norm_phone(entry.get("usphone") or entry.get("ukphone")),
                take_pos(entry.get("trans") or []),
                clean_defs(entry.get("trans") or []) or [""],
            ])
        lib.append(index[low])

    libs = {"c4all": [], "c4key": [], "c6all": [], "c6key": []}
    for e in d4:
        add_each = (e.get("name") or "").strip().lower()
        add(e, libs["c4all"])
        if add_each and add_each not in gk_set:
            add(e, libs["c4key"])
    for e in d6:
        low = (e.get("name") or "").strip().lower()
        add(e, libs["c6all"])
        if low and low not in c4_set:
            add(e, libs["c6key"])

    out = {
        "src": "qwerty-learner (MIT) · CET4_T / CET6_T / GaoKao_3500",
        "count": len(words),
        "words": words,
        "libs": libs,
    }
    dst = os.path.join(root, "data", "vocab.json")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    pos_cnt = sum(1 for w in words if w[2])
    print("words=%d  no-pos=%d (%.1f%%)" % (len(words), len(words) - pos_cnt,
                                            (len(words) - pos_cnt) / len(words) * 100))
    for k, v in libs.items():
        print("  %-6s %d" % (k, len(v)))
    print("->", dst, "%.1f KB" % (os.path.getsize(dst) / 1024))


if __name__ == "__main__":
    main()
