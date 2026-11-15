# HiFi Planner v2

Rebuild of HiFi Planner as a static web app. No build step and no dependencies: plain HTML, CSS and JavaScript that runs from GitHub Pages or by double-clicking `index.html`.

## Try it

- **Locally:** open `v2/index.html` in Chrome or Edge. Log in with a shop number.
- **Online demo:** push the `v2` folder to the `hifi-planner` repository. It is then served at `<your GitHub Pages address>/v2/` while the old planner stays untouched at the root.

## Folder layout

| Path | What it is |
|---|---|
| `index.html` | Entry point |
| `css/app.css` | All styling, light and dark theme, print rules |
| `js/ports.js` | The I/O standard: signals, connector types, label rules, port matching, cable fit |
| `js/core.js` | Storage, DA/EN text helper, icons, modal/toast, catalogue with admin drafts, document store with undo/redo |
| `js/canvas.js` | Canvas: pan/zoom, A4 pages, cards, wires, selection, replace, Shortcuts, CI mode, print |
| `js/panels.js` | Top bar, sidebar, cable picker, replace picker, projects, help, settings, login |
| `js/editor.js` | Product Editor, Shortcut saving, publishing to GitHub |
| `js/tour.js` | Guided walkthrough |
| `data/config.js` | Shop numbers, admin code, GitHub target, support phone, feedback link |
| `data/products.js` | The catalogue (written by the Editor / Publish) |
| `data/templates.js` | Shortcuts (written by Publish) |
| `data/price-sync.js` | Date and result of the last price sync (written by the sync) |
| `img/` | Product images, trimmed and compressed to WebP (20 MB instead of 278 MB) |
| `tools/` | One-off migration scripts and the I/O rename report |

## Admin

1. Settings (gear) → Admin → enter the admin code from `data/config.js` (`hifi-admin` until you change it).
2. **Product Editor** creates, edits, duplicates and deletes products and cables. **Save as Shortcut** stores the canvas or selection as a template.
3. Changes are drafts on that PC until **Publish**. Publish commits `data/products.js`, `data/templates.js` and any uploaded images to the GitHub repository. Shops get them a few minutes later on reload.
4. Publishing needs a GitHub fine-grained personal access token with *Contents: Read and write* on the `hifi-planner` repository only. Paste it under Settings → Admin. It is stored in that browser only.

The admin code only hides the admin tools; it is visible in the page source like the shop numbers. The GitHub token is what actually protects the data.

## Share links

**Share link** in the top bar packs the whole canvas (products, cables, notes, page setup) into the URL after `#p=`. Nothing is uploaded. Opening the link loads a copy; the floor plan image is not included.

## Price sync

`tools/price-sync.js` fetches current prices from hifiklubben.dk and updates `data/products.js`. `.github/workflows/price-sync.yml` (in the repository root) runs it every night and commits the result; it can also be started by hand under Actions → Price sync → Run workflow, or from Settings → Admin in the app (token needs *Actions: Read and write*).

- Products are matched by SKU, then by brand + model name. Each run's report (Actions → the run → Summary) lists what changed, what was skipped and what was not found.
- A price is left alone when the jump is implausible, when one SKU is used by several catalogue products, or when the website's colour/length variants cost different amounts and the catalogue SKU does not name one variant. Fix those by giving the product the exact variant SKU in the Editor.
- Cables without a SKU are never matched and keep their manual price.
- If the website returns fewer than 300 products the run fails without touching anything.

## I/O standard

Every port is `{ key, label, sig, conn }`. Labels follow `SIGNAL DIR DETAIL`, for example `HDMI IN 1`, `SPEAKER OUT SURROUND BACK`, `SUB OUT 2`. The Editor builds labels from a signal dropdown so new products stay consistent. When a card is replaced, connections are carried over by: same key → same signal and number → same signal → same connector type. `tools/io-migration-report.md` lists how each of the 409 old labels was renamed.

## Going live

1. Copy the contents of `v2/` to the repository root (replacing the old `index.html`, `scripts/`, `styles/`; the old `images/` folder can be deleted).
2. In `data/config.js` set `github.path` to `""`.
3. Commit. `hifiplanner.dk` then serves the new planner.

## Known limits

- Tested in Chrome only. Printing uses the browser print dialog (choose "Save as PDF").
- Projects are stored per browser; use Export/Import to move them.
- Bluetooth/WiFi badges were inferred from categories and names during migration and should be reviewed in the Editor.
