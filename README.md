# Policy showcase

A static site presenting legislation filed by Sarah Unsicker in the Missouri
House of Representatives, 2017–2024 (107 bills and resolutions).

Open `index.html` directly, or serve the folder with any static host
(it is GitHub Pages–ready; there is no build step).

## Layout

- `index.html`, `assets/` — the site
- `data/bills.json` — every bill: title, session, furthest stage, action
  history, co-sponsors, document links (`data/bills.js` is the same data as a
  script, so the page also works when opened from disk)
- `data/topics.json` — policy areas and which bill belongs to which; edit this
  to regroup bills
- `scripts/build_data.py` — rebuilds the data files from the official House
  record at archive.house.mo.gov

## Refreshing the data

```bash
python3 scripts/build_data.py
```

Downloaded pages are cached in `.cache/`. Bill facts come from the official
record; the policy-area groupings are editorial.
