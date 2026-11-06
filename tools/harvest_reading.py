#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓取真实外刊 RSS，生成阅读池 data/reading.json。

只收录真实文章页（RSS 里的 <link>/<id>），标题与链接原样保存，不编造。
难度按「题材 + 摘要关键词」打分，再分档：
  易（2–3 星）：健康 / 教育 / 社会 / 科普短讯
  难（4–5 星）：硬科学论文报道 / 长文随笔 / 数据长报告
"""
import json
import os
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
NS = {"atom": "http://www.w3.org/2005/Atom"}

FEEDS = [
    ("https://www.sciencedaily.com/rss/top/science.xml", "ScienceDaily", 3),
    ("https://www.sciencedaily.com/rss/health_medicine.xml", "ScienceDaily", 2),
    ("https://www.sciencedaily.com/rss/mind_brain.xml", "ScienceDaily", 3),
    ("https://www.sciencedaily.com/rss/computers_math.xml", "ScienceDaily", 4),
    ("https://www.sciencedaily.com/rss/space_time.xml", "ScienceDaily", 4),
    ("https://www.sciencedaily.com/rss/earth_climate.xml", "ScienceDaily", 3),
    ("https://www.sciencedaily.com/rss/education_learning.xml", "ScienceDaily", 2),
    ("https://www.sciencedaily.com/rss/strange_offbeat.xml", "ScienceDaily", 2),
    ("https://aeon.co/feed.rss", "Aeon", 5),
    ("https://ourworldindata.org/atom.xml", "Our World in Data", 4),
]

CAP = {"ScienceDaily": 400, "Aeon": 20, "Our World in Data": 12}

HARD_WORDS = ("quantum", "neural", "neurons", "genome", "genetic", "particle", "astro",
              "cosmic", "protein", "molecule", "semiconductor", "thermodynamic", "photonic",
              "microbiome", "gravitational", "superconduct", "catalyst", "algorithm",
              "crispr", "enzyme", "galaxy", "quantum", "radiation", "vaccine trial")
EASY_WORDS = ("tips", "how to", "students", "sleep", "diet", "walking", "screen time",
              "coffee", "exercise", "happiness", "stress", "shopping", "hobby")


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    return urllib.request.urlopen(req, timeout=timeout).read()


def sanitize(raw):
    """修掉未转义的裸 &（Smithsonian 之类站点常见），保留 &amp; 等实体。"""
    txt = raw.decode("utf-8", "ignore")
    return re.sub(r"&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)", "&amp;", txt)


def plain(s):
    s = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", s, flags=re.S)
    s = re.sub(r"<[^>]+>", "", s)
    s = (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
         .replace("&quot;", '"').replace("&apos;", "'").replace("&#8217;", "'"))
    return re.sub(r"\s+", " ", s).strip()


def parse_feed(url, platform):
    items = []
    try:
        root = ET.fromstring(sanitize(get(url)))
    except Exception as exc:            # noqa: BLE001
        print("  ! %-54s %s" % (url, exc), file=sys.stderr)
        return items
    nodes = root.findall(".//item") or root.findall(".//atom:entry", NS)
    for n in nodes:
        def tx(*paths):
            for p in paths:
                v = n.findtext(p, "", NS)
                if v and v.strip():
                    return v
            return ""

        title = plain(tx("title", "atom:title"))
        link = plain(tx("link", "atom:link"))
        if not link:
            le = n.find("atom:link", NS)
            if le is not None:
                link = le.get("href", "")
        if not link:
            ident = plain(tx("id", "atom:id"))
            link = ident if ident.startswith("http") else ""
        desc = plain(tx("description", "atom:summary", "summary"))
        if not title or not link.startswith("http"):
            continue
        items.append({"title": title, "url": link, "src": platform, "desc": desc})
    return items


def stars_for(item):
    text = (item["title"] + " " + item["desc"]).lower()
    score = {"ScienceDaily": 3, "Aeon": 5, "Our World in Data": 4, "WHO": 2}.get(item["src"], 3)
    if any(w in text for w in HARD_WORDS):
        score += 1
    if any(w in text for w in EASY_WORDS):
        score -= 1
    return max(2, min(5, score))


def minutes_for(item):
    wc = max(len(item["desc"].split()), 40)
    base = {"Aeon": 13, "Our World in Data": 10, "ScienceDaily": 7, "WHO": 6}.get(item["src"], 8)
    return max(5, min(16, base + (1 if wc > 55 else 0)))


def check(url, tries=2):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=18) as r:
                if 200 <= r.status < 400:
                    return r.status
                code = r.status
        except Exception:               # noqa: BLE001
            code = 0
        time.sleep(1.2)
    return code


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pool, seen = [], set()
    for url, platform, _ in FEEDS:
        got = parse_feed(url, platform)
        print("  %-54s %3d" % (url.split("//")[1][:52], len(got)), file=sys.stderr)
        for it in got:
            key = it["url"].split("?")[0].rstrip("/")
            if key in seen:
                continue
            seen.add(key)
            it["stars"] = stars_for(it)
            it["min"] = minutes_for(it)
            pool.append(it)

    capped, used = [], {}
    for it in pool:
        if used.get(it["src"], 0) >= CAP.get(it["src"], 40):
            continue
        used[it["src"]] = used.get(it["src"], 0) + 1
        capped.append(it)

    hard = [x for x in capped if x["stars"] >= 4]
    easy = [x for x in capped if x["stars"] <= 3]
    print("candidates total=%d hard=%d easy=%d" % (len(capped), len(hard), len(easy)), file=sys.stderr)

    def round_robin(items, n):
        by = {}
        for it in items:
            by.setdefault(it["src"], []).append(it)
        keys = sorted(by, key=lambda k: -len(by[k]))
        out, i = [], 0
        while len(out) < n and any(by[k] for k in keys):
            k = keys[i % len(keys)]
            if by[k]:
                out.append(by[k].pop(0))
            i += 1
        return out

    take = round_robin(hard, 90) + round_robin(easy, 90)
    with ThreadPoolExecutor(max_workers=6) as ex:
        statuses = list(ex.map(lambda x: check(x["url"]), take))

    ok = [it for it, st in zip(take, statuses) if st]
    for it, st in zip(take, statuses):
        if not st:
            print("  dead %s" % it["url"], file=sys.stderr)
    print("link check ok=%d dead=%d" % (len(ok), len(take) - len(ok)), file=sys.stderr)

    out = [{
        "id": "r%03d" % i,
        "title": it["title"][:160],
        "url": it["url"],
        "src": it["src"],
        "stars": it["stars"],
        "min": it["min"],
        "level": "hard" if it["stars"] >= 4 else "easy",
    } for i, it in enumerate(ok)]

    dst = os.path.join(root, "data", "reading.json")
    json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    from collections import Counter
    print("easy=%d hard=%d" % (sum(1 for x in out if x["level"] == "easy"),
                               sum(1 for x in out if x["level"] == "hard")))
    print(dict(Counter(x["src"] for x in out)))
    print("->", dst, os.path.getsize(dst) // 1024, "KB")


if __name__ == "__main__":
    main()
