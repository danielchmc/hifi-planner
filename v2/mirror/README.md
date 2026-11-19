# Website mirror (hifiklubben.dk)

The product data of hifiklubben.dk, stored as the website delivers it. Written every hour by `tools/mirror.js` (GitHub Action "Catalogue sync"). **Never edit these files by hand**: anything HiFi Planner adds or corrects lives elsewhere (`data/`), so the mirror can always be rebuilt and compared with the website. The git history of this folder is the website's change log (prices, stock, new and removed products).

The app never loads this folder; shops only download `data/`.

## Files

| File | What it is |
|---|---|
| `listing.jsonl` | Every product in the website's product listing (`POST /_search`), one raw JSON record per line, sorted by SKU. Includes bundles and outlet units. |
| `pages/<SKU>.json` | The product record from the product page (`window.initialState.page.payload.product`) and the page's category breadcrumb. About 60 pages are read per hour, so every page is refreshed about once a day. |
| `index.json` | Per website SKU: brand, model, type, type key, category path, first/last date seen in the listing, date the page was last read, `bundle`, `outlet`, `gone` (date it left the website). |
| `types.json` | Every website product type with its count, English type key, category paths, variant kind, bundle/outlet counts, what HiFi Planner maps it to (`js/site.js`) and how many of its products are in the catalogue. |

Left out of `pages/` to keep the files small (marketing text and tracking, no product facts): `bodyText`, `highlights`, `highlightsHeader`, `highlightsBullets`, `uniqueSellingPoints`, `expertOpinion`, `videos`, `heroQuote`, `teaser`, `smallTeaser`, `additionalTrackingData`, `lowestShippingPrice`, `sellableOnWebText`, `sellableOnWebTextHeader`.

Products that leave the website keep their files and get `gone` in `index.json`. Nothing is deleted.

## What the website's data contains

- **Type** (`modelType`, Danish, e.g. "Kompakt højtaler – Aktive") and **type key** (`modelTypeKey`, English, stable, e.g. `FloorStandingLoudspeaker`). One label per product, mixing several facts (kind, active/passive, mounting, battery).
- **Category path** from the breadcrumb, e.g. TV > Projektor, with a stable key per level (`tvandsurround`, `projector`). This is the website's navigation tree.
- **Variants** with SKU, EAN, colour, price, stock (`inventoryStatus`), images and their own technical specs (weight, dimensions). `variantNavigationType` says what the variants are (`colorOptions`, `dropDown` for sizes/lengths).
- **Technical specs** (`techSpecs`): groups of term/value pairs (impedance, sensitivity, connections…) plus free-text lines.
- **Relations**: `recommendedAccessories`, `recommendedAlternatives`, `recommendedProducts` (SKU lists); bundles list their parts in `bundle` and `boxContent`.

## Running it by hand

```
node tools/mirror.js mirror --pages 60
```

Options: `--pages N` (pages to read), `--dry` (report only), `--listing-fixture <file>` and `--pages-fixture <dir>` (offline test data). On GitHub, "Run workflow" has a *mirror_pages* field: a run with 1500 reads every page at once (about 15–20 minutes).
