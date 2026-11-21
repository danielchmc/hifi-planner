# HiFi Planner v2

Rebuild of HiFi Planner as a static web app. No build step and no dependencies: plain HTML, CSS and JavaScript that runs from GitHub Pages or by double-clicking `index.html`.

## Try it

- **Locally:** open `v2/index.html` in Chrome or Edge. Log in with a shop number.
- **Online demo:** push the `v2` folder to the `hifi-planner` repository. It is then served at `<your GitHub Pages address>/v2/` while the old planner stays untouched at the root.

## Folder layout

| Path | What it is |
|---|---|
| `index.html` | Entry point |
| `next.html` | Forwards to `index.html` (it was the test page for the new catalogue) |
| `css/app.css` | All styling, light and dark theme, print rules |
| `js/ports.js` | The I/O standard: signals, connector types, label rules, port matching, cable fit |
| `js/site.js` | Everything about hifiklubben.dk: image URLs, product-page parser, type → category map, port suggestions, Bluetooth/WiFi, colour swatches (used by the app and the sync) |
| `js/core.js` | Storage, DA/EN text helper, icons, modal/toast, catalogue with admin drafts, document store with undo/redo |
| `js/canvas.js` | Canvas: pan/zoom, A4 pages, cards, wires, selection, replace, Shortcuts, CI mode, print |
| `js/panels.js` | Top bar, sidebar, cable picker, replace picker, projects, help, settings, login |
| `js/editor.js` | Product Editor, Shortcut saving, publishing to GitHub |
| `js/tour.js` | Guided walkthrough |
| `data/config.js` | Shop numbers, admin code, GitHub target, support phone, feedback link |
| `data/products.js` | The catalogue as it was at the switch to the generated catalogue; no longer used or written (kept for rollback) |
| `data/templates.js` | Shortcuts (written by Publish) |
| `data/price-sync.js` | Date and result of the last catalogue sync |
| `data/site-details.js` | Product-page data per website product: gallery, connection specs, availability (admins only) |
| `data/site-new.js` | Website products not in HiFi Planner, mostly accessories (admins only) |
| `data/own.js` | HiFi Planner's own layer, the master for everything HiFi Planner adds to the website's data (ids, names, images, ports, categories chosen by hand, links to website products). Written by Publish in the Editor |
| `data/site-ignore.js` | Website SKUs the sync must not add (written when an admin deletes an auto-added product) |
| `img/` | Product images, trimmed and compressed to WebP, max 640 px (20 MB instead of 278 MB) |
| `img/hd/` | The same images at full resolution (max 1600 px, 61 MB), used when zooming in and in the full-screen viewer |
| `img/hk/`, `img/hd/hk/` | Copies of hifiklubben.com images, named by their image ID (written by the sync job) |
| `mirror/` | Raw copy of hifiklubben.dk's product data (listing, product pages, types), written by `tools/mirror.js`; never loaded by the app, never edited by hand. See `mirror/README.md` |
| `build/` | Generated every hour by `tools/catalog-build.js`: `app-products.js` (**the app's catalogue**: own layer + website), `categories.js` (the category tree), `catalog.json` (normalized website catalogue), `report.md` |
| `tools/` | Catalogue sync (`price-sync.js`, `mirror.js`, `catalog-build.js`, `taxonomy.js`, `overrides.js`, `cable-ends.js`, `migrate-connectors.js`, `own-split.js`, `site-match.js`, `mirror_images.py`, `price-sync.workflow.yml`), one-off migration scripts and reports |

## Admin

1. Settings (gear) → Admin → enter the admin code from `data/config.js` (`hifi-admin` until you change it).
2. **Product Editor** creates, edits, duplicates and deletes products and cables. **Save as Shortcut** stores the canvas or selection as a template.
3. Changes are drafts on that PC until **Publish**. Publish commits `data/own.js` (the master), `build/app-products.js` (so shops see the change at once, until the next hourly build regenerates it), `data/templates.js`, `data/site-ignore.js` and any uploaded images to the GitHub repository. Shops get them a few minutes later on reload. For products that follow the website, price, discount and colours are read-only in the Editor: they come from hifiklubben.dk every hour.
4. Publishing needs a GitHub fine-grained personal access token with *Contents: Read and write* on the `hifi-planner` repository only. Paste it under Settings → Admin. It is stored in that browser only.

The admin code only hides the admin tools; it is visible in the page source like the shop numbers. The GitHub token is what actually protects the data.

## Shop accounts and sellers

Login is two steps: the shop number (from `data/config.js`), then the seller's own number (5–7 digits). The first time a shop is used on a PC, staff enter the shop's name, email and phone; the first time a seller number is used, its owner enters their name. Both are stored in that browser only. The A4 footer prints the shop's details and "Your adviser: <seller name>". The top bar shows the signed-in seller; click it to switch. Sellers already used on the PC are listed for one-click login and can be removed there.

## Shortcuts

An admin saves the canvas (or the selection) as a Shortcut; Publish shares it with all shops. A Shortcut keeps everything on the canvas except the floor plan image: product cards (colour, front/back, left out of the price list), text boxes, marks with their letters, symbols, rooms, cable runs with their cable, the legend, the price list and the connections. It also keeps the drawing's settings: card size, CI mode, mark size, scale, A4 orientation and pages (`s` in the template).

- **On an empty canvas** (nothing drawn yet; a floor plan, legend or price list on its own does not count) the Shortcut goes back exactly where it was on the page, whether clicked or dragged in, and applies the settings. A scale already set for the floor plan is kept, and so is the orientation of a page that has a floor plan.
- **On a drawing in progress** the Shortcut only adds its items, at the drop point or in the middle, and the drawing keeps its own settings. A second legend or price list is not added.
- Shortcuts saved before this change (no `s`) contain only products, text, marks and connections, and no settings or page position: re-save them to get those. Copy/paste never changes settings and always pastes under the pointer.

## CI mode: marks on a floor plan

CI mode is for custom-install proposals. Upload a floor plan (JPG, PNG or PDF, or drop the file on the canvas); on landscape pages it leaves a column free on the right for the legend. A PDF is drawn to an image with the bundled pdf.js (`vendor/pdfjs`, Mozilla, Apache-2.0), which is loaded only when a PDF is opened; a PDF with several pages shows the pages so the seller can pick the floor plan. PDFs work in the online version, not when the planner is opened as a local file (browsers block it there).

- **Marks.** With CI mode on, clicking a product in the list arms it: every click on the canvas places one mark, Esc or right-click stops (dragging a product onto the plan places a single mark). Each product gets one letter (A, B, C…) and colour; the shape shows the kind of product: circle = ceiling speaker, square = wall speaker, triangle = subwoofer, hexagon = other/outdoor speaker, diamond = electronics. Marks have one size for the whole proposal (slider in the CI bar) and move on a 5 px grid.
- **Symbols.** The CI bar has generic symbols that are not products: rack, router, TV, listening position, volume control, cable outlet.
- **Legend.** Appears with the first mark and explains the plan: every mark with image, name and quantity, the symbols used, cable runs with metres, and the scale bar. It shows no prices. Movable; show/hide with the Legend button.
- **Replace.** "Replace all A" swaps the product behind every A mark and keeps the letter.
- **Cards and price list.** With CI mode off, products are added as normal cards (for a wiring diagram on another page). A card whose product has marks shows the same letter. The price list counts marks too; a product that is both marked and drawn as cards is counted once (the larger number). Any card or mark can be left out of the price list with the "In price list" button in the selection bar (or right-click → Count in price list); it stays on the drawing, marked "Not priced" on screen only. Stored as `np: 1` on the item.
- **Rooms.** "Room" in the CI bar: drag a rectangle around a room and type its name. The price list gets a "Per room (floor plan)" section with what each room gets and a subtotal: the marks in it and the product cards placed inside it (by the card's centre, so a card can be dropped into a room with CI mode off, e.g. a TV or an amplifier). Within a room a product that is both marked and drawn as a card counts once (the larger number), as in the price list. Marks outside every room are listed as "Outside the rooms"; cards outside are not (they are usually a wiring diagram on another page). Cables are not tied to a room. Move a room by the dotted grip beside its name, resize it at the bottom-right corner.
- **Scale.** "Scale": click the two ends of something with a known length (a wall, a door) and type the length in metres. The legend then shows a scale bar.
- **Cable runs.** "Cable": click along the route (points snap to the centre of marks), double-click or Enter to finish; the tool stays on for the next run. Each run shows its length once the scale is set. Select a run and choose "Cable" to pick speaker cable sold by the metre; the next runs get the same cable. Metres are summed per cable type, rounded up to whole metres; the legend shows the metres and the price list the cable. Runs cannot be reshaped afterwards: delete and redraw.
- **Data.** Rooms are `{ kind: 'zone', x, y, w, h, name }`, cable runs `{ kind: 'run', x, y, pts, cable }`, and `doc.sc` is the scale in canvas units per metre. Marks are items `{ kind: 'mark', k: <product id or '@symbol'> }`, the legend is `{ kind: 'legend' }`, `doc.mk` keeps the letter order and `doc.ms` the mark size (document version 3). Older CI drawings, where products were thumbnails, are converted to marks when opened.

## Grid and A4 pages

- The canvas grid is 20 units (100 when zoomed out). An A4 page is 1400 × 1000 units (portrait 1000 × 1400) and pages are 100 apart, so every page edge falls exactly on a grid dot. Printing scales the page uniformly to fit A4 and centres it (1.5 mm side margins, since 1400 : 1000 is 1 % narrower than A4).
- A new floor plan is placed on the grid and its frame is sized in whole grid steps; the image keeps its proportions inside the frame, so a measured scale stays true. Moving and resizing the plan keeps it on the grid.
- Drawings from before this change (document version 3, page width 1414, gap 60) are converted when opened: items on page 2 and later move with their page.

## Mouse controls

- Left-drag on empty canvas: selection box (Shift or Ctrl adds to the selection). A click on empty canvas deselects.
- Right-drag or middle-drag (also starting on a card): pan. Right-click without moving: the menu. Space + left-drag: pan. Scroll wheel: zoom.
- Left-drag on a card, note, mark or wire: move it.

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

**Load on hifiklubben.dk.** Each run reads the website once: the listing (~28 requests of 50 products) and 60 product pages, one at a time with a pause between them, about 90 requests an hour, identified by its User-Agent (*HiFi Planner catalogue mirror*). That step is `tools/mirror.js`, the first step of the workflow; `tools/price-sync.js` runs after it with `--mirror` and reads the listing and the page details from `mirror/` instead of the website (until 2026-11-20 both read the website, about 175 requests an hour). The mirror keeps, per page, what price-sync takes from it (`hp`: spec table, the description's connection lines, gallery, availability, parsed with the same `S.parsePage`). Prices stay hourly: if the mirror step fails, price-sync reads the listing from the website itself (its listing must be under 2 hours old, `listingAt` in `mirror/index.json`); product-page details then wait for the next run. Images come from images.hifiklubben.com, each only once.

**Website mirror.** First in each run, `tools/mirror.js` updates `mirror/`: the raw listing, the product record of about 60 product pages per hour, an index of every website SKU (first/last seen, gone) and `types.json`, which compares the website's product types with what HiFi Planner maps. The run summary lists new website types and the types the sync does not map, so a missing category (like projectors) shows up there instead of being skipped silently. The mirror step may fail without stopping prices and images from being committed.

**Normalized catalogue (stage 2).** `tools/catalog-build.js` turns the mirror into `build/catalog.json` and `build/report.md`, every hour after the mirror:

- **Categories** are the website's own tree (from the product pages' breadcrumbs, identified by URL path such as `/tv/projektor/`), plus a few of HiFi Planner's own (Væghøjtaler, Pladespillere, Moduler & opgraderinger).
- **Rules** live in `tools/taxonomy.js`, the only hand-edited part: for every website type key (`modelTypeKey`, e.g. `InCeilingLoudspeaker`) its *kind*, *scope* (`diagram` = drawn and wired, `pricelist` = on proposals without ports, `skip`), *facets* (active, wireless, battery, mount, role, cable connector) and, where the website files it oddly, the category to move it to. A new website type without a rule is listed in the report.
- **Products** carry variants (SKU, colour, EAN, price, stock, image), the variant kind (colour, size, metre), flattened specs, and the website's accessory/alternative SKU lists. **Bundles** become parts lists (product SKUs with quantities).
- **report.md** compares the result with today's catalogue: where today's categories end up, Bluetooth/WiFi/per-metre differences, products not on the website, and what is new per category.

**Own layer (stage 3).** `data/own.js` holds only what HiFi Planner adds, one entry per catalogue product: the id (what saved drawings and Shortcuts refer to), brand/name/SKU as HiFi Planner shows them, picked images, ports, cable connectors, today's categories (legacy), Bluetooth/WiFi, review status, and a `link` to the website product it follows (`site` = product SKU, `v` = variant SKU when the card is one variant such as a cable length, `single` = the card is one speaker of a pair the website sells as a pair). Products the website does not list keep their last website facts in `frozen`.

- Until the switch, `tools/own-split.js` wrote `data/own.js` from `data/products.js` every hour, and `tools/catalog-build.js` rebuilds `build/products.js` from the own layer and the mirror, using the sync's own matching and price logic (`tools/site-match.js`, copied unchanged from `price-sync.js`), including its plausibility check (a price that jumps more than −35 %/+60 % is held and listed).
- The **round trip** section of `build/report.md` compares the result with `data/products.js` field by field. First run: 847 of 847 products identical.

**The app catalogue (stage 4, live since 2026-11-19).** `index.html` loads `build/app-products.js` and `build/categories.js` (it loaded `data/products.js` before; rollback: put that file back in the loader in `index.html`). Every product there carries its website category path in `cats` (e.g. `['/tv/', '/tv/projektor/']`; today's categories are kept in `lcats`), plus `kind`, `scope` and the website facts in `fx` (mount, active, wireless, per metre…). Products the website does not list get the category most of their old category's products went to (stand-ins: Tilbehør > Pladsholdere). The website products HiFi Planner does not have yet are added (`web: 1`, id `w-<sku>`, no ports). `build/categories.js` holds the category tree (`HP_DATA.categories`, section order and English names in `tools/taxonomy.js`).

- The sidebar groups by the website's sections (Højtaler, HiFi, Surround, TV, Pladespiller, Høretelefoner, Kabler, Tilbehør) and their categories; search also finds category names (`projektor`).
- CI marks take their shape from the website type (ceiling, in-wall, on-wall, subwoofer), and the cable-run picker also offers the cables the website sells by the metre.
- **The Editor** saves to `data/own.js` through Publish (`HP.toOwn` in `js/core.js` turns a product into its own-layer entry; the link to the website product is kept). The category is picked from the website's tree; a category chosen by hand is stored as `cat` and wins over the website's (`wc` holds the website's, shown in the Editor). Website products HiFi Planner does not have yet are in the catalogue as `w-<sku>`: diagram gear is listed under **Review** until someone adds its ports and saves it, which adopts it into `data/own.js`. Deleting one puts its SKU on the ignore list.
- **The hourly run** no longer writes `data/products.js`: `price-sync.js` still reads the website for its report, the product-page details (`data/site-details.js`) and the Website tab (`data/site-new.js`), and `own-split.js` does nothing (both check whether `index.html` loads `build/app-products.js`). `catalog-build.js` rebuilds `build/app-products.js` from `data/own.js` and the mirror; the plausibility check now compares with the previous build, and the report lists the changes since the previous build.
- **Corrections of website facts** live in `tools/overrides.js`, per website product SKU (kind, scope, facts such as `perMetre`, category, with a note), applied by the build and listed in the report. Example: the SLiP cables, which the website sells by the metre but marks as colours.
- **Stock pictures**: a local image file used by cards of 3 or more different website products (the generic RCA photo that was on 23 speaker cables) is replaced in the build by each product's own website photo.
- Still to do: ports for the new website products, banana/spade/bare-wire speaker connectors, and using the facets in more places (filters).

## Product links and colour variants

- In the printed PDF every product name (on cards, in the price list and in the legend) is a link to the product page on hifiklubben.dk, marked with a small ↗. On screen the names are not clickable, so cards still select and drag normally.
- If a colour is chosen on the card, the link goes to that colour's page.
- Colour variant SKUs (e.g. RACLARITY66BK) are in the catalogue and can be searched in the sidebar.

## Product search (sidebar)

- **Scrolling.** The list builds 30 products at first and adds the next 30 when you scroll near its end, so only thumbnails in reach are loaded. The count shows how many are on screen (*Viser 60 af 1057 produkter*). Changing the search or a filter starts again from the top.
- **Categories.** The top row of chips is the main groups (Amplifiers, Speakers, Sources, TV, Accessories) with the number of matching products. Picking a group opens a second row with its sub-categories (Floorstanding, Subwoofers, …), also with counts. Click a chip again to turn it off. Counts follow the search and the other filters; a chip with nothing to show is greyed out.
- **Quick filters.** Sale, Bluetooth and WiFi can be combined with everything else. Brand and sort order (best match, price up/down, name, brand) are dropdowns.
- **Colours.** If the search points at one colour, by part of its SKU (`raclarity66b`, `66bk`) or its colour name (`clarity sort`, `black`), the row shows that colour's picture, name, SKU and price, and adding it gives the card that colour. A search that fits every colour alike (`raclarity66`) shows the product normally. Code: `HP.matchVariant` in `js/core.js`, `buildSidebar()` in `js/panels.js`, Danish chip names in `HP.catLabel`.

## Systems (the website's bundles)

hifiklubben.dk sells ready-made systems (bundles): a turntable with an amplifier and speakers, a receiver with a 5.1 speaker set, a soundbar with a sub. The sidebar lists them under the **Systemer** chip, after the categories, with the website's own types as sub-chips (Stereosystem til TV, Soundbar system/pakke, Pladespiller system…), the Sale chip, the brand filter and sort order. The search box finds systems by name, type, or any part's name, brand or SKU; while searching under another chip, the Systemer chip shows how many systems match. Each row shows the bundle price, what it saves against the parts one by one, and the parts.

- **Dropping a system** (drag, or click/tap) places one card per part, in columns from the sources to the speakers (turntable → amplifier → speakers; a receiver's speakers in the order of its outputs, so the wires do not cross), and wires them. The wires have no cable: the seller picks the cables. Parts that are not wired (stands, a backbox) go in a row underneath. The whole drop is one step for Undo.
- **Wiring** is worked out by `P.autoWire` in `js/ports.js` from the cards' ports, so ports corrected in the Editor are used at once. The best matches are taken first: same signal, then the same group (line/aux/pre…, HDMI, USB, coaxial); a sub output only feeds a subwoofer and is preferred over a line or pre output; FRONT/CENTER/SURROUND outputs go to the matching speakers (the dearest pair in front); a dedicated box such as a phono stage is used before the amplifier's own input; an input named for the source (LINE IN CD for a CD player, TUNER, NETWORK, TV) and the same plug at both ends win ties; numbered ports are used from 1. Each input takes one wire, each output gives one, and two cards are joined once, except that a stereo amplifier's L and R outputs both go to a speaker pair card, and a stereo output without L/R feeds two single speakers (e.g. Phantom K-60 (1 Unit) ×2).
- **Not wired:** wireless systems (Sonos, Bluesound Pulse, Marshall, Ambeo, KEF's wireless sub kit) and speaker sets without an amplifier are placed as cards. A part without ports yet (a website product not reviewed in the Editor) is placed but cannot be wired; once its ports are added it is wired on the next drop. The toast after a drop says how many cards and connections were made and how many parts were left without a wire.
- **Price list:** every complete set of a system's cards is one line, *System* + the bundle's name and link, at the bundle price, with its parts listed underneath and "Spar X%" against the parts one by one (or the website's own before-price, if higher); the saving counts in "Du sparer". Each card shows a small SYSTEM tag (not printed). If a part is deleted, the remaining cards are priced one by one; duplicating a whole system prices it twice. Cards carry the bundle's SKU as `sy`, which Shortcuts, copy/paste and share links keep.
- **Data:** `build/bundles.js` (`HP_DATA.bundles`), written every hour by `tools/catalog-build.js`: the website's bundles whose parts are all in the app catalogue (220 of 253 on 2026-11-21), each with its parts as app product ids and quantities, the colour when the bundle comes in one, the bundle price and before-price. The report lists the bundles left out and why. Of the 194 with two or more drawn parts, 121 wire completely, 5 partly (a wireless part) and 68 not at all (wireless systems and speaker-only sets).

## Share links

**Share link** in the top bar packs the whole canvas (products, cables, notes, page setup) into the URL after `#p=`, in a compact format (about half the length of a plain encoding). Nothing is uploaded. Opening the link loads a copy; the floor plan image is not included.

## I/O standard: ports, connectors and cables

Every port is `{ key, label, sig, conn }`:

- **label**: what is written on the product, free text in the Editor (`AUX IN`, `CD`, `TAPE IN`, `Line In (Analog)`). Older ports were named `SIGNAL DIR DETAIL` (`HDMI IN 1`, `SUB OUT 2`), which still works.
- **sig**: what the port carries, from the list in `js/ports.js` (`SIGNALS`: line, aux, phono, coax, sub, speaker, hdmi-arc, usb…). For a new port the Editor suggests it from the label (AUX/LINE/CD/TAPE → line or aux, MM/MC/PHONO → phono, USB-C → usbc) until one is picked by hand.
- **conn**: the physical connector, from one strict list (`CONNECTORS`): RCA, XLR, Jack 6.35 mm, Minijack 3.5 mm, Jack 4.4 mm, Jack 2.5 mm, XLR 4-pin, DIN, Speaker terminal, Speakon, Toslink, Mini-Toslink, BNC, HDMI, USB-A, USB-B, USB-C, Micro-USB, RJ45, RS-232, Antenna, Power (IEC), Wireless, Other. Speaker terminals are one type (no banana/spade/bare wire yet). Older values are mapped wherever they appear (`P.conn`): `coax` and `sub` → RCA, `trigger` → Minijack, `usb` → USB-A/B/C from the label and side; `tools/migrate-connectors.js` converted the ports in `data/own.js` (501 ports on 202 products, report in `build/connector-migration.md`; it runs every hour and does nothing once everything is converted).
- **key** is made from the label once and then kept, also when the label is edited later, so wires in saved drawings stay connected.
- Wires and port dots are coloured by the signal where one plug serves several uses (RCA: line, coax, sub; `P.colorOf`), otherwise by the connector.

**Cables** have two ends, `ends: [A, B]` (connector ids). The cable picker offers a cable as *matching* when its two ends fit the two ports, either way round (`P.cableFit`): a Minijack ↔ RCA cable for a minijack output to an RCA input, but not for RCA to RCA. In the Editor a cable has *End A* and *End B*. Ends set there are stored in `data/own.js`; for all other cables `tools/catalog-build.js` works them out (`tools/cable-ends.js`, marked `endsAuto`): from the connectors named in the cable's name, in order (`Evergreen - Minijack - RCA`, `USB B - USB A`, `USB CC`), else the website's connector list (`Stik`), else the usual plugs of the cable type (HDMI cable → HDMI ↔ HDMI, subwoofer cable → RCA ↔ RCA). The report lists the guessed ones (a USB cable that does not say which USB, Y-splitters) for checking in the Editor. The website itself has no standard for this: only 35 of 154 cable pages list connectors, and never which end is which.

**Cable lengths.** In the cable picker each cable is one row, with a button per length and its price; the cards of one website cable (one per length, e.g. *Evergreen - Minijack - RCA 1m … 16m*) and the website's own lengths (`lens` on the product, from the variants' *Kabellængde*, added by `tools/catalog-build.js`) are shown together. Clicking a length only selects it, so lengths and cables can be compared: the bar above the buttons shows the choice with its price (*Evergreen - Minijack - RCA 3 m · 999,-*), and **Brug kabel** puts it on the connection (Enter or a double-click does the same; Annuller leaves the wire as it was). Clicking the row selects the wire's current length, else the length used last, else the first of at least 1 m. A length that has its own card in HiFi Planner picks that card; any other website length is stored on the wire as `lv` (its SKU) with the website's price. Cable sold by the metre (speaker cable such as Rocket or SLiP) gets a metres field in whole metres instead, as cable is cut in the shop (Enter commits), stored as `m`, and is counted per started metre in the price list, like CI cable runs. The wire's label and the price list show the length (*Evergreen - Minijack - RCA 20 m*, *Rocket 11 3,5 m*). Share links and Shortcuts keep `lv` and `m`.

**A length the website stops selling.** A card for one length of a cable (e.g. *Rocket 44 Single-Wire - 1.5m*, AQROCKET44SC1,5AA) is not marked discontinued when only that length leaves the website: `tools/catalog-build.js` finds the cable by the SKU with the length taken out (AQROCKET44SC#AA → AQROCKET44SCAA), and the card then follows that cable, without the length in its name (`lenGone` keeps the old length). In the cable picker it is one row with the cable's current lengths; a wire on the card in an older drawing shows and prices the cheapest current length until another is picked. The report lists these cards under *Length no longer sold, cable still sold*.

Wiring two ports whose connectors do not normally go together (e.g. HDMI to RCA) shows a warning; common pairs joined by one cable (Minijack–RCA, Jack–RCA, DIN–RCA, USB-A–USB-B, Toslink–Mini-Toslink, RCA–XLR…) do not. When a card is replaced, connections are carried over by: same key → same signal and number → same signal → same connector type. `tools/io-migration-report.md` lists how each of the 409 old labels was renamed.

## Going live

1. Copy the contents of `v2/` to the repository root (replacing the old `index.html`, `scripts/`, `styles/`; the old `images/` folder can be deleted).
2. In `data/config.js` set `github.path` to `""`.
3. Commit. `hifiplanner.dk` then serves the new planner.

## Known limits

- Tested in Chrome only. Printing uses the browser print dialog (choose "Save as PDF").
- Projects are stored per browser; use Export/Import to move them.
- Bluetooth/WiFi badges were inferred from categories and names during migration and should be reviewed in the Editor.
