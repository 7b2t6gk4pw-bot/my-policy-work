#!/usr/bin/env python3
"""Build data/documents.js (full text) and data/writing.js (summaries) from sources/.

Sources are Twitter archive CSVs and an Evernote export. Titles, summaries,
topic labels and pull quotes are editorial and live in data/writing-meta.json;
the topic of each post is assigned by the keyword patterns below.

    python3 scripts/build_documents.py
"""
import collections
import csv
import html
import json
import os
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PATTERNS = {
    "guns": r"\bguns?\b|gun ?violence|gunsense|#enough\b|momsdemand|sb ?656|concealed carry|firearm|shooter|nobillnobreak|lockupguns",
    "repro": r"abortion|naral|planned parenthood|standwithpp|reproductive|hb ?1370|pro-?choice|contracepti|birth control|protectawomansrights",
    "lgbtq": r"sjr ?39|\bg?lgbt|\bglbt|same-sex|marriage equality|transgender|notinmystate",
    "voting": r"voter ?id|voting rights|hb ?1631|noon6|voter ?suppress|suppression of votes|disenfranchis|registered? to vote|voter registration|photo id",
    "earlyed": r"#ece\b|pre-?k\b|earlyed|early childhood|parents ?as ?teachers|child ?care|daycare|bthru8|#amendment3",
    "schools": r"suspension|school-to-prison|#stpp|pipeline|public schools?|school funding|foundation formula|charter school|school board|school district|teacher",
    "specialed": r"special ?ed|\biep\b|\b504\b|adhd|autis|disabilit|dyslexi|executive function|chadd|subminimum",
    "health": r"medicaid|obamacare|health ?care|health insurance|uninsured|mental health|mentally ill",
    "policing": r"ferguson|mike ?brown|michael ?brown|police|blacklivesmatter|racial|racism|darren wilson|grand jury|protest|prosecutor",
    "family": r"custody|child support|guardian ad litem|\bgals?\b|divorce|co-?parent|family (law|court|drug court)|form 14|foster|child abuse",
    "ethics": r"lobby|campaign finance|ethics reform|\$25,000 check|cooling off|sunshine law|corruption",
    "econ": r"colorofdebt|debt collect|default judgment|payday|poverty|food insecure|homeless|minimum wage|living wage|equal pay|paycheck ?deception|right to work|\btif\b|wage theft",
    "maternal": r"breastfe|bfing|bfcafe|preemie|preterm|\bnicu\b|maternal|midwi|home ?birth|postpartum|prenatal|pregnan",
    "environment": r"west ?lake|landfill|climate change|pollution|toxic smoke",
    "immigration": r"immigra|refugee|undocumented",
    "trafficking": r"traffick",
    "deathpenalty": r"death penalty|death row",
}
RX = {k: re.compile(v, re.I) for k, v in PATTERNS.items()}


def tag(text):
    return [k for k, rx in RX.items() if rx.search(text)]


def tweets(path):
    out = []
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        for x in csv.DictReader(f):
            t = html.unescape(x["text"]).strip()
            if x["retweeted_status_id"] or t.startswith("RT @"):
                kind = "repost"
            elif x["in_reply_to_status_id"] or t.startswith("@"):
                kind = "reply"
            else:
                kind = "post"
            urls = [u for u in dict.fromkeys(x["expanded_urls"].split(",")) if u.startswith("http")
                    and "/photo/" not in u]
            out.append({"d": x["timestamp"][:10], "k": kind, "t": t, "u": urls, "p": tag(t)})
    out.sort(key=lambda i: i["d"], reverse=True)
    return out


class Enml(HTMLParser):
    """Reduce Evernote markup to a small set of plain tags, escaping all text."""
    KEEP = {"ol", "ul", "li", "div", "p", "s", "b", "strong", "i", "em", "br", "h1", "h2", "h3"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.text, self.skip = [], [], 0

    def handle_starttag(self, t, a):
        if t in ("script", "style", "en-media", "img") or self.skip:
            if t in ("script", "style"):
                self.skip += 1
            return
        if t in self.KEEP:
            self.out.append("<br>" if t == "br" else f"<{'p' if t == 'div' else t}>")

    def handle_endtag(self, t):
        if t in ("script", "style"):
            self.skip = max(0, self.skip - 1)
        elif t in self.KEEP and t != "br" and not self.skip:
            self.out.append(f"</{'p' if t == 'div' else t}>")

    def handle_data(self, d):
        if not self.skip:
            self.out.append(html.escape(d, quote=False))
            self.text.append(d)


def notes(path, note_topics):
    out, seen = [], set()
    for n in ET.parse(path).getroot().findall("note"):
        title = re.sub(r" - copy \d+$", "", n.findtext("title") or "")
        p = Enml()
        p.feed(n.findtext("content") or "")
        body = "".join(p.out)
        # Evernote leaves a placeholder where its Tasks feature was used.
        body = re.sub(r"<p>Content not supported</p>\s*<p>This block is a placeholder for Tasks.*?</p>", "", body, flags=re.S)
        body = re.sub(r"<p>\s*</p>", "", body)
        plain = re.sub(r"\s+", " ", " ".join(p.text)).strip()
        if not plain or (title, plain) in seen:
            continue
        seen.add((title, plain))
        c = n.findtext("created") or ""
        out.append({"d": f"{c[:4]}-{c[4:6]}-{c[6:8]}", "k": "note", "title": title, "h": body, "t": plain,
                    "u": [], "p": note_topics.get(title, [])})
    out.sort(key=lambda i: i["d"], reverse=True)
    return out


def main():
    meta = json.load(open(os.path.join(ROOT, "data", "writing-meta.json")))
    docs, summary = [], []
    counts = collections.Counter()
    for m in meta["documents"]:
        src = os.path.join(ROOT, "sources", m["source"])
        items = tweets(src) if m["kind"] == "twitter" else notes(src, meta["noteTopics"])
        kinds = collections.Counter(i["k"] for i in items)
        for i in items:
            if i["k"] != "repost":
                counts.update(i["p"])
        dates = sorted(i["d"] for i in items)
        info = {"id": m["id"], "title": m["title"], "kind": m["kind"], "summary": m["summary"],
                "source": "sources/" + m["source"], "from": dates[0], "to": dates[-1], "counts": dict(kinds),
                "topics": [t for t, _ in collections.Counter(
                    p for i in items if i["k"] != "repost" for p in i["p"]).most_common(5)]}
        summary.append(info)
        docs.append(dict(info, items=items))
    topics = [dict(t, count=counts[t["id"]]) for t in meta["topics"] if counts[t["id"]] >= 2]
    topics.sort(key=lambda t: -t["count"])
    with open(os.path.join(ROOT, "data", "writing.js"), "w") as f:
        f.write("window.POLICY_WRITING = " + json.dumps({"topics": topics, "documents": summary},
                                                         ensure_ascii=False, separators=(",", ":")) + ";\n")
    with open(os.path.join(ROOT, "data", "documents.js"), "w") as f:
        f.write("window.POLICY_DOCS = " + json.dumps({"topics": topics, "documents": docs},
                                                      ensure_ascii=False, separators=(",", ":")) + ";\n")
    for s in summary:
        print(s["id"], s["from"], s["to"], s["counts"], s["topics"])
    for t in topics:
        print(f'{t["count"]:5d}  {t["label"]}')


if __name__ == "__main__":
    main()
