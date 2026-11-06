#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 src/ 与 data/ 打包成一个自包含的 index.html。

用法：
    python tools/build.py            # 生成 index.html
    python tools/build.py --check    # 只做校验（数据条数 / JSON 合法性）

不做压缩混淆：产物是可以直接读、直接改的单文件。
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
DATA = os.path.join(ROOT, "data")

# 听力五类各取多少条（合计 145）
LISTEN_QUOTA = {"exam": 45, "skill": 12, "shadow": 8, "ted": 30, "teded": 50}

EMOJI = re.compile(
    "[" "\U0001F000-\U0001FAFF" "\u2600-\u27BF" "\u2B00-\u2BFF" "\uFE0F" "\u2190-\u21FF" "]+"
)


def load(name):
    path = os.path.join(DATA, name)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_items(prefix):
    out = []
    for name in sorted(os.listdir(DATA)):
        if name.startswith(prefix + "_") and name.endswith(".json"):
            out.extend(load(name)["items"])
    out.sort(key=lambda x: x["id"])
    return out


def clean_title(t):
    return re.sub(r"\s{2,}", " ", EMOJI.sub(" ", t)).strip()


def build_data():
    vocab = load("vocab.json")
    reading = load("reading.json")
    listening = load("listening.json")
    translation = load_items("translation")
    writing = load_items("writing")

    picked, used = [], {k: 0 for k in LISTEN_QUOTA}
    for it in listening:
        g = it.get("grp")
        if g not in LISTEN_QUOTA:
            continue
        if used[g] >= LISTEN_QUOTA[g]:
            continue
        if it.get("min", 0) > 30:      # 每日听力累计上限 30 分钟，超长合集不进池
            continue
        used[g] += 1
        it = dict(it)
        it["title"] = clean_title(it["title"])
        picked.append(it)

    data = {
        "meta": {
            "version": "1.0.0",
            "schema": 4,
            "poolVersion": 1,
            "counts": {
                "words": len(vocab["words"]),
                "reading": len(reading),
                "listening": len(picked),
                "translation": len(translation),
                "writing": len(writing),
            },
        },
        "vocab": vocab,
        "reading": reading,
        "listening": picked,
        "translation": translation,
        "writing": writing,
    }
    return data


def validate(data):
    errs = []
    c = data["meta"]["counts"]
    if c["reading"] != 180:
        errs.append("阅读应为 180，实际 %d" % c["reading"])
    easy = sum(1 for x in data["reading"] if x["level"] == "easy")
    hard = sum(1 for x in data["reading"] if x["level"] == "hard")
    if easy != 90 or hard != 90:
        errs.append("阅读易/难应为 90/90，实际 %d/%d" % (easy, hard))
    if c["listening"] != 145:
        errs.append("听力应为 145，实际 %d" % c["listening"])
    te = sum(1 for x in data["translation"] if x["lv"] == "easy")
    th = sum(1 for x in data["translation"] if x["lv"] == "hard")
    if (te, th) != (45, 45):
        errs.append("翻译易/难应为 45/45，实际 %d/%d" % (te, th))
    if c["writing"] != 90:
        errs.append("写作应为 90，实际 %d" % c["writing"])
    libs = data["vocab"]["libs"]
    want = {"c4all": 2607, "c4key": 1302, "c6all": 2345, "c6key": 1313}
    for k, v in want.items():
        if len(libs.get(k, [])) != v:
            errs.append("词库 %s 应为 %d，实际 %d" % (k, v, len(libs.get(k, []))))
    for it in data["listening"]:
        if not re.match(r"^https://www\.bilibili\.com/video/BV[0-9A-Za-z]{10}$", it["url"]):
            errs.append("听力链接格式异常：%s" % it["url"])
            break
        if it["min"] > 30:
            errs.append("听力条目超过 30 分钟：%s" % it["title"])
            break
    for it in data["reading"]:
        if not it["url"].startswith("http"):
            errs.append("阅读链接异常：%s" % it["url"])
            break
    return errs


def main():
    data = build_data()
    errs = validate(data)
    c = data["meta"]["counts"]
    print("词 %d · 阅读 %d（易 %d / 难 %d）· 听力 %d · 翻译 %d · 写作 %d" % (
        c["words"], c["reading"],
        sum(1 for x in data["reading"] if x["level"] == "easy"),
        sum(1 for x in data["reading"] if x["level"] == "hard"),
        c["listening"], c["translation"], c["writing"]))
    if errs:
        print("校验失败：", file=sys.stderr)
        for e in errs:
            print("  -", e, file=sys.stderr)
        sys.exit(1)
    print("校验通过")

    if "--check" in sys.argv:
        return

    with open(os.path.join(SRC, "style.css"), encoding="utf-8") as f:
        css = f.read()
    js = []
    for name in ("core.js", "views.js", "boot.js"):
        with open(os.path.join(SRC, name), encoding="utf-8") as f:
            js.append("/* ---- %s ---- */\n" % name + f.read())
    app = "\n".join(js)

    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

    with open(os.path.join(SRC, "index.template.html"), encoding="utf-8") as f:
        tpl = f.read()

    html = tpl.replace("/*__CSS__*/", css.strip())
    html = html.replace("/*__DATA__*/", payload)
    html = html.replace("/*__APP__*/", app.strip())

    out = os.path.join(ROOT, "index.html")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("→ %s  %.0f KB" % (out, os.path.getsize(out) / 1024))


if __name__ == "__main__":
    main()
