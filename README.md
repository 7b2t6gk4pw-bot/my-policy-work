# Policy showcase

A static site presenting legislation filed by Sarah Unsicker in the Missouri
House of Representatives, 2017–2024: 107 bills and resolutions, 180
amendments, and her own writing (Twitter archives and 2023 session notes)
organized by policy topic.

Open `index.html` directly, or serve the folder with any static host
(it is GitHub Pages–ready; there is no build step).

## Layout

- `index.html`, `assets/` — the site
- `documents.html` — reader for the full Twitter archives and notes, with
  search and topic filters
- `sources/` — the original Twitter CSV exports and Evernote export
- `data/writing-meta.json` — document titles and summaries, topic labels and
  pull quotes (editorial; edit freely)
- `scripts/build_documents.py` — rebuilds `data/documents.js` and
  `data/writing.js` from `sources/`; topic keywords are at the top of the file
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

```bash
python3 scripts/build_documents.py
```

Downloaded pages are cached in `.cache/`. Bill facts come from the official
record; the policy-area groupings are editorial.
