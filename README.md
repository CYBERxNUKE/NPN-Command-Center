# NPN Command Center

A free-hostable, source-grounded dashboard for trading-card No Purchase Necessary (NPN) and Alternate Method of Entry (AMOE) opportunities.

## What makes this different
This is not just a static list. It separates:
- **VERIFIED** official rules/programs
- **OPEN** actionable opportunities
- **VERIFY_NPN** release-radar leads
- submission history stored locally as a fallback and in Supabase when configured
- source monitoring / change detection
- printable entry packets
- deadline calculations
- CSV export
- PWA/offline support

The watcher automates discovery, not sweepstakes entry.

## Fastest $0 deployment: GitHub Pages

1. Create a new GitHub repository, e.g. `npn-command-center`.
2. Upload/push the contents of this folder to the repository's `main` branch.
3. In **Settings → Pages**, choose **GitHub Actions** as the source.
4. Open the **Actions** tab and run `Deploy Pages` once.
5. The included `NPN investigator` action runs daily at 12:17 UTC.
6. Give the workflow `Read and write permissions` if your repo defaults prevent its commits/issues.

The daily investigator:
- checks official sources,
- fingerprints page content,
- logs changes,
- commits source-state,
- opens a GitHub Issue when a watched official page changes.

That GitHub issue can trigger a phone/email notification through normal GitHub notifications.

## Run locally

```bash
python -m http.server 8080
```

Open http://localhost:8080

To run the investigator locally:

```bash
pip install -r requirements.txt
python scripts/watch.py
```

## Important legal/quality guardrail

A product appearing on a release calendar does **not** prove NPN eligibility.
For Topps specifically, current official rules define an Eligible Product as a product carrying a “No Purchase Necessary” or “Topps Access Program” designation on its packaging.

The system therefore uses a two-stage state:
`RADAR LEAD → VERIFIED ELIGIBLE → OPEN → MAILED → CLOSED/WON`

Never convert a lead to VERIFIED merely because a third-party site says so.

## Production capabilities

- Supabase/Postgres for multi-device submission history
- Magic-link authentication
- Email/SMS/push notification worker with protected scheduling
- Safe photo upload of package NPN language for evidence
- Product checklist URL and odds URL review fields
- Prize and card-pool intelligence fields
- Household/member profiles with enforced limits
- USPS postage estimator and batch mail manifest
- Admin review queue for scraper and share-sheet leads
- Browser extension intake for discovered NPN pages
