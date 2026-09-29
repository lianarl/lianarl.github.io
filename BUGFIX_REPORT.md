# medikem.si frontend – bug fix report

Date: 2026-09-27 · Scope: static frontend in this repo (`*.html`, `js/`, `css/`, `data/products.js`, `scrape_wc.js`)

## Summary

The most serious problem was in the **product data**, not the page code. `scrape_wc.js` threw away the size/side options, set wrong price ranges, left brands empty and never marked price-on-request products. Because of that, **no product with sizes could be ordered correctly**. `data/products.js` has now been rebuilt from the live WooCommerce Store API (287 products, 545 variations, 57 categories) and the frontend bugs are fixed on top of it.

Verified in headless Chrome with a 34-check end-to-end suite. The suite runs every page at desktop and phone width, plus all 287 product pages, listing, search, cart, checkout and wishlist. It passed 3 runs in a row with 0 JS errors.

## 1. Product data (critical)

| Bug | Effect | Fix |
|---|---|---|
| `attributes: []` hard-coded for all 86 variable products | No size/side picker. "Add to cart" silently added the first variation, which was often the wrong or an out-of-stock size | The scraper maps WooCommerce attributes and variations (price, stock, SKU, image) |
| 50 variable products had no variations at all | Shown as out of stock / unbuyable (e.g. Polar Frost gel is really in stock at 11,70–29,90 €) | Variations fetched in bulk (`type=variation`) |
| `priceMax` = regular price, not the range max | Wrong "od …" prices, sorting and price filter | Uses `price_range` |
| Products with price 0 not flagged `onRequest` | 4 products showed **0,00 €** and could be added to the cart | `onRequest` when not purchasable or 0 € |
| Unpriced variations counted as in stock | 5 products offered sizes at 0 € | Treated as not orderable |
| `brand` always empty | Brand filter and brand link didn't work | Taken from `brands` |
| HTML entities in names (`&#8211;`) | Literal "&#8211;" shown in names | Decoded |
| `info` empty | Cards had no teaser text | First sentence of the short description |
| Category hierarchy: only Opornice had `parent`; `sapimed` listed itself as a child; 11 children didn't exist | Missing breadcrumbs and subcategory tiles, broken sidebar tree | Hierarchy rebuilt from the API; real popularity/date ordering added |

To refresh the data later, run `node scrape_wc.js`. It keeps the hand-written category intro/guide/images.

## 2. Listing & search (`js/shop.js`)

- **Search lost its query** after any filter or sort change. The URL was rewritten to `kategorija=search`, so reloading showed Opornice. Fixed.
- Search ignored diacritics and brand ("glezenj" found nothing). It now uses term-wise folded matching over name, brand, SKU and slug.
- `?s=` (the "Vsi izdelki" / "Prikaži vse priljubljene" links) fell back to Opornice. It now lists the whole catalogue with the right sort.
- Unknown `?kategorija=` (old brand links such as `mediroyal`) silently showed Opornice. It is now searched instead.
- Lists with no priced products (empty search, all "on request") broke the price slider with `Infinity`. Guarded, and the slider is hidden.
- **Quick add on cards added variable products without a size.** Those cards now say "Izberite možnosti" and link to the product page.
- "Load more" focused an `aria-hidden` link. It now focuses the product name.

## 3. Product page

- The "Kategorije" row showed raw slugs (`hladilne-kreme`). It now shows names.
- The primary category / breadcrumb picked the parent instead of the subcategory. Fixed.
- Related products fell back to Opornice for every category. They now fall back to the parent category first.
- The brand link pointed to a non-existent category. It now opens a brand search.
- The "Kako izbrati pravo velikost?" link appeared for colour/flavour options. It is now shown for sizes only.
- Options were listed in API order ("L M S XL XS", "Desna Leva"). They are now sorted by size and Leva/Desna.

## 4. Cart, checkout, wishlist

- **Cart page (`kosarica.html`)**: the inline script keyed +/−/Remove by product id, but the cart is keyed by `id:variant`. Those buttons did nothing for any product with a size. It also fired a keyless `storage` event that `main.js` ignored, so the header count and mini-cart went stale and later overwrote the edits. It also didn't show the variant or shipping. Replaced with a shared implementation that reuses the mini-cart line and totals.
- **Checkout (`blagajna.html`)**: the button was `type="button"` with `alert()`, so the `required` fields were never validated. It "ordered" even with an empty cart and never cleared the cart. Replaced with a labelled, validated form (plus a terms checkbox), an order summary, an empty-cart state, and an inline confirmation that clears the cart.
- **Homepage best-seller cards**: 7 of 10 linked to `izdelek.html?id=` (empty). They also used numeric WooCommerce ids, so hearted items never appeared on the wishlist and cart lines duplicated. They now use the slugs.
- **Wishlist / account pages** were missing the mobile menu drawer, toast, mini-cart and cookie notice. The wishlist page was also missing `shop.css` (unstyled cards). The account-form labels weren't tied to their inputs, and "Ste pozabili geslo?" was a dead `#` link.
- The wishlist now syncs across tabs like the cart.
- Search suggestions showed the same product twice (home card + catalogue). They are now deduped by link.

## 5. Navigation & pages (all 34 HTML files)

- 11 menu links pointed to categories that don't exist in the shop (374 links in total). Removed. Added the missing Opornica za komolec and Oksimeter.
- The Sapimed dropdown only repeated itself. It is now a plain link.
- Promo banners linked to `kategorija=proizvajalecmediroyal/`. Fixed.
- 14 "Ta stran je v izdelavi" placeholder pages were linked from the homepage (slider and category cards). The links now go to the real listings, and the old URLs redirect.
- The drawer link "Poslovalnice" pointed to `#poslovalnice` on pages without that section. It now goes to `poslovalnice.html`.
- 13 content pages used classes that exist only in `css/main.css`, which no page linked. Now linked.
- 4 WordPress-style root links (`/piskotki/` …) were broken locally. Fixed.

## Not fixed – needs a decision or a backend

- **Checkout has no backend.** "Oddaj naročilo" confirms the order in the browser but nothing is sent anywhere. The same is true of the newsletter, reviews (stored in localStorage) and login. This must not go live as is.
- Product names come from WooCommerce in UPPERCASE. That is how the shop stores them; normalising them is a content decision.
- Blog cards link to posts on the live site (there are no local post pages).
- Product images are hot-linked from medikem.si `wp-content`.
