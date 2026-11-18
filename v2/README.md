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
| `js/site.js` | Everything about hifiklubben.dk: image URLs, product-page parser, type → category map, port suggestions, Bluetooth/WiFi, colour swatches (used by the app and the sync) |
| `js/core.js` | Storage, DA/EN text helper, icons, modal/toast, catalogue with admin drafts, document store with undo/redo |
| `js/canvas.js` | Canvas: pan/zoom, A4 pages, cards, wires, selection, replace, Shortcuts, CI mode, print |
| `js/panels.js` | Top bar, sidebar, cable picker, replace picker, projects, help, settings, login |
| `js/editor.js` | Product Editor, Shortcut saving, publishing to GitHub |
| `js/tour.js` | Guided walkthrough |
| `data/config.js` | Shop numbers, admin code, GitHub target, support phone, feedback link |
| `data/products.js` | The catalogue (written by the Editor / Publish) |
| `data/templates.js` | Shortcuts (written by Publish) |
| `data/price-sync.js` | Date and result of the last catalogue sync |
| `data/site-details.js` | Product-page data per website product: gallery, connection specs, availability (admins only) |
| `data/site-new.js` | Website products not in HiFi Planner, mostly accessories (admins only) |
| `data/site-ignore.js` | Website SKUs the sync must not add (written when an admin deletes an auto-added product) |
| `img/` | Product images, trimmed and compressed to WebP, max 640 px (20 MB instead of 278 MB) |
| `img/hd/` | The same images at full resolution (max 1600 px, 61 MB), used when zooming in and in the full-screen viewer |
| `img/hk/`, `img/hd/hk/` | Copies of hifiklubben.com images, named by their image ID (written by the sync job) |
| `tools/` | Catalogue sync (`price-sync.js`, `mirror_images.py`, `price-sync.workflow.yml`), one-off migration scripts and reports |

## Admin

1. Settings (gear) → Admin → enter the admin code from `data/config.js` (`hifi-admin` until you change it).
2. **Product Editor** creates, edits, duplicates and deletes products and cables. **Save as Shortcut** stores the canvas or selection as a template.
3. Changes are drafts on that PC until **Publish**. Publish commits `data/products.js`, `data/templates.js` and any uploaded images to the GitHub repository. Shops get them a few minutes later on reload.
4. Publishing needs a GitHub fine-grained personal access token with *Contents: Read and write* on the `hifi-planner` repository only. Paste it under Settings → Admin. It is stored in that browser only.

The admin code only hides the admin tools; it is visible in the page source like the shop numbers. The GitHub token is what actually protects the data.

## Shop accounts and sellers

Login is two steps: the shop number (from `data/config.js`), then the seller's own number (5–7 digits). The first time a shop is used on a PC, staff enter the shop's name, email and phone; the first time a seller number is used, its owner enters their name. Both are stored in that browser only. The A4 footer prints the shop's details and "Your adviser: <seller name>". The top bar shows the signed-in seller; click it to switch. Sellers already used on the PC are listed for one-click login and can be removed there.

## CI mode: marks on a floor plan

CI mode is for custom-install proposals. Upload a floor plan (JPG/PNG); on landscape pages it leaves a column free on the right for the legend.

- **Marks.** With CI mode on, clicking a product in the list arms it: every click on the canvas places one mark, Esc or right-click stops (dragging a product onto the plan places a single mark). Each product gets one letter (A, B, C…) and colour; the shape shows the kind of product: circle = ceiling speaker, square = wall speaker, triangle = subwoofer, hexagon = other/outdoor speaker, diamond = electronics. Marks have one size for the whole proposal (slider in the CI bar) and move on a 5 px grid.
- **Symbols.** The CI bar has generic symbols that are not products: rack, router, TV, listening position, volume control, cable outlet.
- **Legend.** Appears with the first mark and lists every mark with image, name, quantity and price, plus the symbols used. Movable; show/hide with the Legend button.
- **Replace.** "Replace all A" swaps the product behind every A mark and keeps the letter.
- **Cards and price list.** With CI mode off, products are added as normal cards (for a wiring diagram on another page). A card whose product has marks shows the same letter. The price list counts marks too; a product that is both marked and drawn as cards is counted once (the larger number). Any card or mark can be left out of the price list with the "In price list" button in the selection bar (or right-click → Count in price list); it stays on the drawing, marked "Not priced" on screen only. Stored as `np: 1` on the item.
- **Rooms.** "Room" in the CI bar: drag a rectangle around a room and type its name. Marks inside a room are grouped in the legend with a subtotal per room. Move a room by the dotted grip beside its name, resize it at the bottom-right corner.
- **Scale.** "Scale": click the two ends of something with a known length (a wall, a door) and type the length in metres. The legend then shows a scale bar.
- **Cable runs.** "Cable": click along the route (points snap to the centre of marks), double-click or Enter to finish; the tool stays on for the next run. Each run shows its length once the scale is set. Select a run and choose "Cable" to pick speaker cable sold by the metre; the next runs get the same cable. Metres are summed per cable type, rounded up to whole metres, and added to the legend and the price list. Runs cannot be reshaped afterwards: delete and redraw.
- **Data.** Rooms are `{ kind: 'zone', x, y, w, h, name }`, cable runs `{ kind: 'run', x, y, pts, cable }`, and `doc.sc` is the scale in canvas units per metre. Marks are items `{ kind: 'mark', k: <product id or '@symbol'> }`, the legend is `{ kind: 'legend' }`, `doc.mk` keeps the letter order and `doc.ms` the mark size (document version 3). Older CI drawings, where products were thumbnails, are converted to marks when opened.

## Phones and tablets

The app works on phones and iPads with touch.

- **Layout.** Up to 1024 px wide (iPad portrait, phones) the product list is a drawer opened with the orange **Products** button, and a **⋯** button holds everything that does not fit in the top bar. Up to 700 px (phones) the top bar only keeps Products, undo/redo, Print and ⋯; windows open full screen.
- **Canvas gestures.** One finger on empty canvas pans; two fingers pinch-zoom and pan. Long-press (about half a second) opens the context menu on a product, cable or empty spot; long-press on empty canvas and then drag selects an area. Dragging items, wiring (tap an output dot, then an input dot) and the CI tools work with a finger; drawing a cable run has a **Finish run** button.
- **Product list.** Scrolls with a finger. Tap adds the product (in CI mode: arms it for placing marks); long-press picks it up for dragging onto the canvas, and the drawer slides away while dragging.
- **Touch details.** Larger hit areas for port dots and resize handles; form fields use 16 px text so iOS does not zoom when typing; the full-screen image viewer supports pinch and double-tap. Code: `drag()` and the pinch handler in `js/canvas.js`, `listDrag()`, `Pn.drawer` and `moreMenu()` in `js/panels.js`, the "v3.0" section of `css/app.css`.

## Catalogue sync (hifiklubben.dk mirror)

A GitHub Action runs every hour (`tools/price-sync.workflow.yml`; copy it into the repository as `.github/workflows/price-sync.yml` once). It can also be started under Actions → Catalogue sync → Run workflow, or from Settings → Admin (token needs *Actions: Read and write*). Each run's report is under Actions → the run → Summary.

What it keeps in step with the website:

- **Prices and discounts.** The website's `priceBefore` is stored as `was`; the price list shows the old price struck through, "Save X%" and the total saving. A price is left alone (and reported) if it jumps more than −35 %/+60 %, or if one SKU is used by several catalogue products.
- **Colour variants.** Products sold in several colours get `vars` (name, price, discount, image). Staff pick a colour with the dots on the card image, the Colour button, right-click → Colour, or C. The card image, card label and price list follow the choice.
- **Discontinued products.** A product that leaves the website listing (or whose page says Discontinued) gets `gone: <date>`: a warning icon in the product list and an UDGÅET tag on the card (not printed). It clears itself if the product comes back. The report suggests likely successors.
- **New products.** Website products of a relevant type (amplifiers, speakers, TVs, sources, cables…) are added automatically, marked `review` with an AUTO tag on the card. Their inputs/outputs are suggested from the website's connection specs. In the Editor, the **Review** tab lists them; the website panel shows the product's image gallery (pick the front and back-panel image), the listed connections and a "Use suggested ports" button. Saving a product marks it as checked. Deleting an auto-added product puts its SKU on the ignore list so it is not added again. Everything else on the website (mostly accessories) is under the **Website** tab.
- **Bluetooth/WiFi.** Switched on when the product page lists it. The sync never switches them off, because the website's lists are sometimes incomplete; ticking them by hand in the Editor stops the sync from touching them.
- **Images.** Website images are referenced as `hk:<image id>`. `tools/mirror_images.py` copies them into `img/hk/` (640 px) and `img/hd/hk/` (1600 px, front/back only), up to 400 per run. Until a copy exists, the app shows the image straight from images.hifiklubben.com.

Product pages are read in batches (60 per run, new products first), so all pages are refreshed about once a day. `tools/sync-report-2026-11-15.md` is the first full run against live data.

## Share links

**Share link** in the top bar packs the whole canvas (products, cables, notes, page setup) into the URL after `#p=`, in a compact format (about half the length of a plain encoding). Nothing is uploaded. Opening the link loads a copy; the floor plan image is not included.

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
