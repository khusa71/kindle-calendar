# kindle-calendar

Weekly block calendar for a jailbroken Kindle 8th gen (6", 800×600 e-ink).
Renders a PNG server-side from multiple iCal feeds; Kindle pulls it and
draws via `eips` on a cron.

```
Gmail/Outlook ICS ──►  render.js (Puppeteer)  ──►  cal.png
                                              ─►  GitHub Pages
                                                       │
                                                       ▼
                                       Kindle daemon (curl + eips, 24h)
```

## One-time setup

### 1. Install Node.js (≥ 20) on your Mac

```sh
brew install node
```

### 2. Install dependencies

```sh
cd ~/Desktop/kindle-calendar
npm install
```

### 3. Test the renderer locally

Create a local `.env`-style file (not committed):

```sh
cat > .env.local <<'EOF'
CAL_URL_NETSOFT=https://outlook.office365.com/owa/calendar/.../calendar.ics
CAL_URL_SEVENSEAS=https://outlook.office365.com/owa/calendar/.../calendar.ics
EOF
```

Run once to verify output:

```sh
set -a && . ./.env.local && set +a
npm run render
open output/cal.png
```

You should see a landscape 800×600 grayscale PNG matching the reference
design.

### 4. Push to GitHub

```sh
cd ~/Desktop/kindle-calendar
git init
git add .
git commit -m "Initial kindle-calendar"
gh repo create kindle-calendar --public --source=. --push
```

### 5. Add the two secrets on GitHub

`Settings → Secrets and variables → Actions → New repository secret`:

- `CAL_URL_NETSOFT`  = Netsoft ICS URL
- `CAL_URL_SEVENSEAS` = Seven Seas ICS URL

### 6. Enable GitHub Pages

`Settings → Pages → Source: Deploy from a branch → gh-pages / root`.

First run: `Actions → Render calendar → Run workflow` (manual). After it
completes, your PNG is live at:

```
https://<your-username>.github.io/kindle-calendar/cal.png
```

### 7. Point the Kindle at the URL

Mount the Kindle via USB (already done if you see `/Volumes/Kindle`).
Edit `extensions/calendar-dashboard/dashboard.url` to contain the
single line above.

Unmount, open KUAL → Calendar Dashboard → **Start Dashboard**.

## Adding / removing calendars

Edit `calendars.yml`:

```yaml
calendars:
  - name: Personal
    urlEnv: CAL_URL_PERSONAL
    style: filled
```

Then add the matching GitHub Actions secret. No code changes needed.

Available styles: `filled` (black), `outline` (white w/ border —
useful for tentative / proposed events).

## Layout / design changes

- `renderer/template.html` — DOM structure.
- `renderer/style.css` — typography, colors, spacing.
- `config.yml` — hour range, timezone, week start, orientation.

After changes, push to `main` — the workflow reruns and the Kindle
picks up the new image at next refresh (or via **Refresh Now**).

## Project layout

```
.
├── calendars.yml            # which ICS feeds to display
├── config.yml               # timezone, hours, display size
├── renderer/
│   ├── render.js            # Puppeteer entry point
│   ├── template.html        # DOM + populate script
│   ├── style.css
│   └── index-page.html      # published with cal.png
├── src/
│   ├── ics-fetcher.js       # per-calendar fetch + RRULE expand
│   ├── event-merger.js      # dedupe + sort
│   └── layout.js            # week window + grid positioning
├── .github/workflows/render.yml
└── output/                  # generated PNG (gitignored)
```

## Operational notes

- Cron runs every 6 hours. Kindle polls every 24 hours. Adjust in
  `.github/workflows/render.yml` and `bin/daemon.sh` respectively.
- ICS URLs are "security-by-obscurity" — rotate them in OWA if leaked.
- `renameotabin` KUAL extension on the Kindle keeps Amazon from pushing
  firmware updates that would un-jailbreak the device. Leave it alone.

## Known limitations

- Only iCal-source calendars for now. Corporate M365 tenants that
  disable calendar publishing will need an OAuth-based fetcher —
  easy to add behind the same `ics-fetcher` interface.
- 6" Kindle screen is tight for seven days. If titles clip, reduce
  `hourStart`/`hourEnd` in `config.yml` or shorten event titles.
