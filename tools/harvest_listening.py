#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 B 站搜索结果页解析真实视频（BV 号 + 标题 + 时长），生成 data/listening.json。

只收真实存在的视频页，不用占位符；解析不到的维度就少收，不编造。
分组：真题 / 技巧 / 精听 / TED / TED-Ed
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

SEARCH = "https://search.bilibili.com/all?keyword=%s&page=%d"

# (关键词, 目标组, 需要的条数, 标题必须包含的任一关键词, 标题禁止包含)
QUERIES = [
    ("六级听力真题", "exam", 14, ("六级", "CET6", "cet6", "CET-6"), ("非真题",)),
    ("六级听力真题 2024年12月", "exam", 6, ("六级", "CET6", "cet6"), ()),
    ("六级听力真题 2023年12月", "exam", 6, ("六级", "CET6", "cet6"), ()),
    ("六级听力真题 2023年6月", "exam", 5, ("六级", "CET6", "cet6"), ()),
    ("六级听力真题 2022年12月", "exam", 5, ("六级", "CET6", "cet6"), ()),
    ("六级听力真题 2025年6月", "exam", 5, ("六级", "CET6", "cet6"), ()),
    ("六级听力真题 2021年12月", "exam", 5, ("六级", "CET6", "cet6"), ()),
    ("六级听力 2024年6月 真题", "exam", 6, ("六级", "CET6", "cet6"), ()),
    ("六级听力 2019年12月 真题", "exam", 5, ("六级", "CET6", "cet6"), ()),
    ("六级听力技巧", "skill", 12, ("六级", "CET6", "cet6"), ()),
    ("英语精听方法", "shadow", 8, ("精听", "跟读"), ()),
    ("TED演讲 中英字幕", "ted", 14, ("TED", "ted", "Ted"), ()),
    ("TED 演讲 英语学习", "ted", 10, ("TED", "ted", "Ted"), ()),
    ("TED talk 中英双语", "ted", 8, ("TED", "ted", "Ted"), ()),
    ("TED-Ed 双语字幕", "teded", 20, ("TED", "ted", "Ted"), ()),
    ("TED-Ed 英语 科普", "teded", 18, ("TED", "ted", "Ted"), ()),
    ("TED Ed 动画 英语", "teded", 14, ("TED", "ted", "Ted"), ()),
    ("TED-Ed 短片 英语", "teded", 16, ("TED", "ted", "Ted"), ()),
    ("TED 演讲 十分钟", "ted", 12, ("TED", "ted", "Ted"), ()),
    ("六级听力 技巧 讲解", "skill", 10, ("六级", "CET6", "cet6"), ()),
    ("英语精听 训练 打卡", "shadow", 8, ("精听", "听力", "跟读"), ()),
]

CARD = re.compile(r'<div class="bili-video-card"')
TITLE = re.compile(r'<h3 class="bili-video-card__info--tit" title="([^"]*)"')
BV = re.compile(r'//www\.bilibili\.com/video/(BV[0-9A-Za-z]{10})/')
DENY = ("日语", "俄语", "德语", "法语", "韩语")
DUR = re.compile(r'bili-video-card__stats__duration[^>]*>(\d{1,2}):(\d{2})<')
OWNER = re.compile(r'class="bili-video-card__info--author"[^>]*>([^<]*)<')


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Referer": "https://www.bilibili.com/",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })
    return urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "ignore")


def parse_cards(html):
    out = []
    parts = CARD.split(html)
    for p in parts[1:]:
        t = TITLE.search(p)
        b = BV.search(p)
        if not t or not b:
            continue
        d = DUR.search(p)
        owner = OWNER.search(p)
        out.append({
            "bvid": b.group(1),
            "title": re.sub(r"\s+", " ", t.group(1)).strip(),
            "min": (int(d.group(1)) * 60 + int(d.group(2))) // 60 if d else 0,
            "sec": (int(d.group(1)) * 60 + int(d.group(2))) if d else 0,
            "up": owner.group(1).strip() if owner else "",
        })
    return out


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    seen, got = {}, []
    for kw, group, need, must, deny in QUERIES:
        picked = 0
        for page in range(1, 3):
            if picked >= need:
                break
            try:
                cards = parse_cards(get(SEARCH % (urllib.parse.quote(kw), page)))
            except Exception as exc:    # noqa: BLE001
                print("  ! %s p%d %s" % (kw, page, exc), file=sys.stderr)
                continue
            print("  %-26s p%d -> %d cards" % (kw, page, len(cards)), file=sys.stderr)
            for c in cards:
                if picked >= need:
                    break
                if c["bvid"] in seen:
                    continue
                if must and not any(m in c["title"] for m in must):
                    continue
                if any(x in c["title"] for x in DENY):
                    continue
                if deny and any(x in c["title"] for x in deny):
                    continue
                if c["sec"] < 120:      # 太短的片段不算一次听力练习
                    continue
                c["group"] = group
                seen[c["bvid"]] = c
                picked += 1
            time.sleep(0.8)

    items = list(seen.values())
    print("collected:", len(items), Counter(i["group"] for i in items), file=sys.stderr)

    # 逐条校验视频页可达（B 站对不存在的稿件返回 404 或「啊叻」页）
    alive = []
    for i, it in enumerate(items):
        url = "https://www.bilibili.com/video/%s/" % it["bvid"]
        try:
            head = get(url, timeout=20)
            if "啊叻" in head or "视频去哪了呢" in head:
                print("  gone %s" % it["bvid"], file=sys.stderr)
                continue
            alive.append(it)
        except Exception as exc:        # noqa: BLE001
            print("  err %s %s" % (it["bvid"], exc), file=sys.stderr)
        if i % 20 == 0:
            time.sleep(0.5)

    out = []
    for idx, it in enumerate(alive):
        out.append({
            "id": "l%03d" % idx,
            "title": it["title"][:90],
            "url": "https://www.bilibili.com/video/%s" % it["bvid"],
            "src": "B站",
            "grp": it["group"],
            "min": max(3, round(it["sec"] / 60)),
            "up": it["up"][:20],
        })
    print("alive:", len(out), Counter(x["grp"] for x in out))
    dst = os.path.join(root, "data", "listening.json")
    json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print("->", dst, os.path.getsize(dst) // 1024, "KB")


if __name__ == "__main__":
    main()
