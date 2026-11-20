#!/usr/bin/env python3
"""Build data/bills.json from the Missouri House's official bill records.

Source: https://archive.house.mo.gov (sponsored-bill lists, bill detail,
action history and co-sponsor pages). Pages are cached in a directory so
re-runs don't re-download.

    python3 scripts/build_data.py [cache_dir]
"""
import difflib
import html
import json
import os
import re
import sys
import time
import urllib.request

BASE = "https://archive.house.mo.gov/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".cache")

# (year, session code, session label, district held that year)
SESSIONS = [
    (2017, "R", "2017 Regular Session"), (2017, "S1", "2017 Extraordinary Session"),
    (2017, "S2", "2017 2nd Extraordinary Session"),
    (2018, "R", "2018 Regular Session"), (2018, "S1", "2018 Special Session"),
    (2018, "S2", "2018 1st Extraordinary Session"),
    (2019, "R", "2019 Regular Session"), (2019, "S1", "2019 1st Extraordinary Session"),
    (2020, "R", "2020 Regular Session"), (2020, "S1", "2020 1st Extraordinary Session"),
    (2020, "S2", "2020 2nd Extraordinary Session"),
    (2021, "R", "2021 Regular Session"), (2021, "S1", "2021 1st Extraordinary Session"),
    (2022, "R", "2022 Regular Session"), (2022, "S1", "2022 1st Extraordinary Session"),
    (2023, "R", "2023 Regular Session"), (2024, "R", "2024 Regular Session"),
]


def district(year):
    return "083" if year >= 2023 else "091"


def get(kind, key, path):
    """Return page text, downloading into the cache on first use."""
    f = os.path.join(CACHE, kind, key + ".html")
    if not os.path.exists(f):
        os.makedirs(os.path.dirname(f), exist_ok=True)
        for attempt in range(4):
            try:
                with urllib.request.urlopen(BASE + path, timeout=60) as r:
                    data = r.read()
                break
            except OSError:
                if attempt == 3:
                    raise
                time.sleep(2 * (attempt + 1))
        with open(f, "wb") as out:
            out.write(data)
        time.sleep(0.4)
    return open(f, encoding="utf-8", errors="replace").read()


def text(s):
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def iso(d):
    m, dd, y = d.strip().split("/")
    return f"{y}-{int(m):02d}-{int(dd):02d}"


# Ordered milestones; a bill's "stage" is the furthest one it reached.
STAGES = [
    ("introduced", "Introduced"),
    ("referred", "Referred to committee"),
    ("hearing", "Public hearing held"),
    ("committee", "Passed committee"),
    ("perfected", "Perfected on House floor"),
    ("passed_house", "Passed the House"),
    ("senate", "Advanced in the Senate"),
    ("passed", "Truly agreed and finally passed"),
    ("signed", "Signed into law"),
]


def stage_of(actions, is_resolution):
    reached = 0
    for a in actions:
        d = a["text"].lower()
        s = 0
        if d.startswith("referred") and "(h)" in d:
            s = 1
        if "public hearing completed (h)" in d:
            s = 2
        if re.search(r"(voted|reported) do pass", d) and "(h)" in d:
            s = 3
        if "perfected" in d and "(h)" in d:
            s = 4
        if "third read and passed (h)" in d:
            s = 5
        if re.search(r"\(s\)", d) and s == 0 and reached >= 5:
            s = 6
        if "truly agreed" in d:
            s = 7
        if "approved by governor" in d or "signed by governor" in d:
            s = 8
        if is_resolution and re.search(r"\badopted\b", d) and "amendment" not in d:
            s = max(s, 7)
        reached = max(reached, s)
    return STAGES[reached][0]


def build_amendments():
    """Amendments offered to other members' bills, from the member page's Amendments list."""
    out = []
    for year, code, label in SESSIONS:
        d = district(year)
        page = get("amend", f"{year}-{code}",
                   f"MemberDetails.aspx?year={year}&code={code}&district={d}&category=amendment")
        sec = page[page.find('id="ExpandedAmendments"'):]
        sec = sec[:sec.find("</nav>")]
        for cell in sec.split('<div class="DocInfoCell"')[1:]:
            num = re.search(r"bill=(\w+)&", cell).group(1)
            status = re.search(r'title="([^"]+)"', cell).group(1)
            m = re.search(r'href="(https://documents[^"]+)"[^>]*>([^<]+)</a>\)(.*?)<br', cell, re.S)
            c = get("content", f"{year}-{code}-{num}", f"BillContent.aspx?bill={num}&year={year}&code={code}&style=new")
            title = text(re.search(r'class="BillDescription">(.*?)</div>', c, re.S).group(1))
            sponsor = re.search(r'<th scope="row">Sponsor:</th>\s*<td>(.*?)</td>', c, re.S)
            kind = re.match(r"[A-Z]+", num).group(0)
            desig = text(m.group(3)).lstrip("*").strip()
            desig = re.sub(r"^(HC?A)\s*(\d+)$", r"\1 \2", desig)
            out.append({
                "year": year,
                "session": label,
                "sessionCode": code,
                "bill": f"{kind} {int(re.search(r'[0-9]+', num).group(0))}",
                "billTitle": title[0].upper() + title[1:].rstrip("."),
                "billSponsor": re.sub(r"\s*\(\d+\)$", "", text(sponsor.group(1))) if sponsor else "",
                "status": status,
                "designation": desig,
                "lr": m.group(2),
                "pdf": m.group(1),
                "billUrl": f"{BASE}Bill.aspx?bill={num}&year={year}&code={code}",
            })
    return out


def main():
    bills = []
    for year, code, label in SESSIONS:
        d = district(year)
        page = get("members", f"{year}-{code}",
                   f"MemberDetails.aspx?year={year}&code={code}&district={d}&category=sponsor")
        who = re.search(r"Representative\s+Sarah Unsicker", text(page))
        assert who, f"unexpected member page for {year} {code}"
        sec = page[page.find("Sponsored Bills"):page.find("Co-sponsored Bills")]
        for num in re.findall(r"bill\.aspx\?bill=(\w+)&", sec):
            key = f"{year}-{code}-{num}"
            q = f"bill={num}&year={year}&code={code}"
            c = get("content", key, f"BillContent.aspx?{q}&style=new")
            title = text(re.search(r'class="BillDescription">(.*?)</div>', c, re.S).group(1))
            fields = {text(k).rstrip(":"): text(v) for k, v in
                      re.findall(r'<th scope="row">(.*?)</th>\s*<td>(.*?)</td>', c, re.S)}
            assert "Unsicker" in fields["Sponsor"], key
            ga = text(re.search(r'id="Header2">(.*?)</div>', c, re.S).group(1))
            docs = []
            doc_sec = c[c.find('id="DocRows"'):]
            heading = ""
            for m in re.finditer(r"<h2>(.*?)</h2>|<a href=\"(https://documents[^\"]+)\"[^>]*>(.*?)</a>",
                                 doc_sec, re.S):
                if m.group(1):
                    heading = text(m.group(1))
                else:
                    docs.append({"type": heading, "label": text(m.group(3)), "url": m.group(2)})

            a = get("actions", key, f"BillActions.aspx?{q}")
            tbl = a[a.find('id="actionTable"'):]
            actions = []
            for row in re.findall(r"<tr><td>(\d+/\d+/\d+)</td><td>(.*?)</td><td class=\"billactions\">(.*?)</td></tr>",
                                  tbl, re.S):
                actions.append({"date": iso(row[0]), "text": text(row[2])})

            cs = get("cosp", key, f"CoSponsors.aspx?{q}")
            cos = [{"name": text(n), "district": text(dn), "party": text(p)} for n, dn, p in
                   re.findall(r"<tr><td>(.*?)</td><td[^>]*>(.*?)</td><td[^>]*>(.*?)</td><td[^>]*>.*?</td></tr>",
                              cs, re.S)]

            kind = re.match(r"[A-Z]+", num).group(0)
            n = int(re.search(r"\d+", num).group(0))
            la = fields.get("Last Action", "")
            lm = re.match(r"(\d+/\d+/\d+)\s*-\s*(.*)", la)
            committees = []
            for x in actions:
                m = re.match(r"Referred: (.*?)\s*\(H\)", x["text"])
                if m and m.group(1) not in committees:
                    committees.append(m.group(1))
            bills.append({
                "id": key,
                "year": year,
                "session": label,
                "sessionCode": code,
                "assembly": ga,
                "district": int(d),
                "type": kind,
                "number": n,
                "label": f"{kind} {n}",
                "title": title[0].upper() + title[1:].rstrip("."),
                "lr": fields.get("LR Number", ""),
                "effective": fields.get("Proposed Effective Date", ""),
                "lastActionDate": iso(lm.group(1)) if lm else "",
                "lastAction": lm.group(2) if lm else la,
                "stage": stage_of(actions, kind in ("HR", "HCR")),
                "committees": committees,
                "actions": actions,
                "cosponsors": cos,
                "documents": docs,
                "url": f"{BASE}Bill.aspx?bill={num}&year={year}&code={code}",
            })

    amendments = build_amendments()

    topics = json.load(open(os.path.join(ROOT, "data", "topics.json")))
    missing = [b["id"] for b in bills if b["id"] not in topics["bills"]]
    if missing:
        print("No topic assigned:", ", ".join(missing))
    for b in bills:
        b["topics"] = topics["bills"].get(b["id"], [])

    # Group bills refiled across sessions (same or near-identical official title).
    def norm(t):
        t = re.sub(r"before august 28, \d{4},?", "", t.lower())
        return re.sub(r"[^a-z0-9 ]", "", t)
    series = []
    for b in sorted(bills, key=lambda b: (b["year"], b["number"])):
        n = norm(b["title"])
        for s in series:
            if difflib.SequenceMatcher(None, n, s["norm"]).ratio() >= 0.86:
                s["ids"].append(b["id"])
                break
        else:
            series.append({"norm": n, "ids": [b["id"]]})
    by_id = {b["id"]: b for b in bills}
    series_out = []
    for i, s in enumerate(series):
        years = sorted({by_id[x]["year"] for x in s["ids"]})
        for x in s["ids"]:
            by_id[x]["series"] = i
        if len(years) >= 3:
            last = by_id[s["ids"][-1]]
            series_out.append({"id": i, "title": last["title"], "topic": last["topics"][0],
                               "years": years, "bills": s["ids"]})
    series_out.sort(key=lambda s: (-len(s["years"]), s["years"][0]))

    bills.sort(key=lambda b: (b["year"], b["sessionCode"] != "R", b["type"], b["number"]))
    out = {
        "source": "Missouri House of Representatives, archive.house.mo.gov",
        "retrieved": time.strftime("%Y-%m-%d"),
        "stages": [{"id": i, "label": l} for i, l in STAGES],
        "topics": topics["topics"],
        "series": series_out,
        "bills": bills,
        "amendments": amendments,
    }
    with open(os.path.join(ROOT, "data", "bills.json"), "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    # Same data as a script so the page also works when opened from disk.
    with open(os.path.join(ROOT, "data", "bills.js"), "w") as f:
        f.write("window.POLICY_DATA = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(len(bills), "bills written")


if __name__ == "__main__":
    main()
