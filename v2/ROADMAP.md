# HiFi Planner v2 — roadmap

Ideas for what to build next, roughly in the order they would pay off. Written 2026-11-23; tick them off or reorder as things change.

## 1. The customer sends their picks back
On the customer page (the QR code), the customer ticks the related products they are interested in and taps **"Send til min rådgiver"**. That opens a ready-written SMS or email to the shop with the product names and SKUs (an `sms:` / `mailto:` link built from the shop's phone and email on the cover).

- No server and nothing saved: it only fills in a message the customer sends themselves.
- Turns the related-products list into leads the seller can follow up.

## 2. A system check in "Relaterede produkter"
Suggest what the system *needs*, not only accessories, worked out from the ports already in the catalogue:

- a turntable without a phono stage, and an amplifier without a phono input → phono stage;
- passive speakers without an amplifier → amplifier;
- a TV without anything on HDMI ARC/eARC or optical → soundbar or amplifier with HDMI ARC;
- a subwoofer and nothing with a sub out → amplifier/receiver with sub out, or a wireless sub kit.

The most "seller-like" upsell, because it answers "will this work?" before the customer asks.

## 3. Stock on the cards
The hourly sync already reads availability from the product pages (`data/site-details.js`). Show **"På lager" / delivery time** on the cards, in the price list and on the customer page. Note: this is the website's stock, not the shop's.

## 4. Good, better, best
Two or three versions of a proposal on separate pages, each with its own total, so the customer chooses between them instead of saying yes or no. A classic way to lift the average sale. Needs: a page per option, a total per page, and a cover that compares the options.

## 5. A list of your proposals
Customer name, date, total and status per proposal, so the seller can follow up a week later. Today projects live in one browser only:

- first step: a per-browser list ("Mine tilbud") built on the projects already saved;
- shop-wide (several PCs, several sellers) needs somewhere to store them — a real backend decision.

## 6. Clean up the data
- Ports for the website products waiting under **Review** in the Editor.
- Odd L/R speaker port labels: T778 (`HEIGHT 1 R` / `HEIGHT 2 L`), Powernode N331 (`SPEAKER OUT CENTER`).
- A **"sold as pair / sold singly"** marker on speaker cables (Rocket 44 comes as two cables, others as one), in `tools/overrides.js` or from the website data. With that, the price list can count a stereo speaker connection as two runs (*Rocket 11 · 2 × 3 m*), which it cannot do reliably today.

## Done (for reference)
- 2026-11-23: customer page shows related products and links to hifiklubben.dk; one of each kind (one banana plug, one stand per speaker); one cable question per speaker pair.
