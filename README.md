---
title: MIR·AI Deadlines
emoji: ⏳
colorFrom: indigo
colorTo: pink
sdk: static
app_file: index.html
pinned: true
license: mit
short_description: Deadline tracker for MIR, Audio/Speech, Multimodal & AI venues
---

# ⏳ MIR·AI Deadlines

A living countdown tracker for research deadlines in **Music Information Retrieval,
Audio & Speech, Multimodal learning, and AI/ML** — in the spirit of
[ai-deadlines](https://huggingface.co/spaces/huggingface/ai-deadlines).

**Live site:** hosted on Hugging Face Spaces (static SDK — `index.html` is served as-is).

## Features

- Live per-venue countdowns in **AoE (UTC−12)** with automatic local-time conversion
- Category filters (Music/MIR · Audio/Speech · Multimodal · AI/ML), search (`/`), dark/light theme
- **Confirmed ✓ vs Estimated** status — estimated entries are predictions from previous years
- One-click **Google Calendar** export per deadline
- **Auto-monitoring**: GitHub Actions checks each venue's official page twice a week;
  when a CFP/venue announcement changes, Claude extracts the new dates and updates
  `data/conferences.yml` automatically (estimated → confirmed)

## Editing data

All content lives in [`data/conferences.yml`](data/conferences.yml):

```yaml
- id: icassp2027
  title: ICASSP
  year: 2027
  full_name: IEEE International Conference on Acoustics, Speech and Signal Processing
  link: https://2027.ieeeicassp.org/
  deadline: "2026-09-16 23:59"   # AoE unless timezone says otherwise
  date: May 16–21, 2027
  place: Toronto, Canada
  categories: [audio]            # music | audio | multimodal | ai
  status: confirmed              # confirmed | estimated
  monitor:
    url: https://2027.ieeeicassp.org/call-for-papers/   # watched by the bot
```

## Auto-monitoring setup (GitHub → HF Space)

1. Push this repo to GitHub (`main` branch).
2. Create a **static** Space on Hugging Face and add these GitHub repo settings:
   - Secret `HF_TOKEN` — HF write token (hf.co/settings/tokens)
   - Secret `ANTHROPIC_API_KEY` — enables automatic date extraction (optional;
     without it, changes are only flagged as GitHub issues)
   - Variables `HF_USER`, `HF_SPACE` — your HF username and Space name
3. Done. `monitor.yml` runs Mon/Thu, commits data updates, opens an issue
   summarizing what changed, and `sync-to-hf.yml` pushes every commit to the Space.

Run the monitor locally:

```bash
pip install requests pyyaml anthropic
ANTHROPIC_API_KEY=sk-... python scripts/monitor.py
```

## Local preview

```bash
python -m http.server 8000
# open http://localhost:8000
```
