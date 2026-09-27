/* Medikem – category listing, product page, quick add and reviews */
(() => {
  'use strict';

  const D = window.MEDIKEM_DATA;
  const M = window.Medikem;
  if (!D || !M) return;

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const { eur, storage } = M;
  const params = new URLSearchParams(location.search);
  const bySlug = new Map(D.products.map((p) => [p.slug, p]));
  const byId = new Map(D.products.map((p) => [p.id, p]));

  const ROOT_CAT = 'opornice';
  const SIDE_KEY = 'pa_leva-desna';
  const LABEL_ORDER = ['XXS', 'XS', 'S', 'S/M', 'M', 'L', 'L/XL', 'XL', 'XXL', 'XXXL', 'XXXXL', 'Leva', 'Desna'];
  const PAGE_SIZE = 24;

  // "Izberite …" wording per option group
  const attrPhrase = (a) => (a.key === SIDE_KEY ? 'levo ali desno različico' : a.label.toLowerCase());
  // URL parameter per attribute; "stran" keeps links from the first version working
  const paramOf = (key) => (key === SIDE_KEY ? 'stran' : key.replace(/^pa_/, ''));

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const productUrl = (p, cat) => `izdelek.html?id=${encodeURIComponent(p.slug)}${cat ? `&kat=${encodeURIComponent(cat)}` : ''}`;
  const listingUrl = (slug) => `izdelki.html?kategorija=${encodeURIComponent(slug)}`;
  const inquiryHref = (p) => `mailto:ravne@medikem.si?subject=${encodeURIComponent(`Povpraševanje: ${p.name}`)}`;
  const buyable = (p) => !p.onRequest && p.inStock;
  const labelRank = (label) => { const i = LABEL_ORDER.indexOf(label); return i < 0 ? 99 : i; };

  // Slovenian has four plural forms: 1 izdelek, 2 izdelka, 3–4 izdelki, 5+ izdelkov.
  const plural = (n, one, two, few, many) => {
    const m = n % 100;
    return m === 1 ? one : m === 2 ? two : m === 3 || m === 4 ? few : many;
  };
  const productsWord = (n) => plural(n, 'izdelek', 'izdelka', 'izdelki', 'izdelkov');
  const reviewsWord = (n) => plural(n, 'mnenje', 'mnenji', 'mnenja', 'mnenj');

  /* ------------------------------------------------------------------
     Prices (regular, sale, "od" ranges, price on request)
     ------------------------------------------------------------------ */
  const discount = (price, regular) => (regular > price ? Math.round((1 - price / regular) * 100) : 0);
  const priceHTML = (p, variation, { compact = false } = {}) => {
    if (p.onRequest) return '<span class="price price--request">Cena na povpraševanje</span>';
    if (variation) {
      return variation.regular > variation.price
        ? `<span class="price price--sale"><ins>${eur.format(variation.price)}</ins> <del>${eur.format(variation.regular)}</del></span>`
        : `<span class="price">${eur.format(variation.price)}</span>`;
    }
    if (p.priceMax > p.price) {
      return compact
        ? `<span class="price"><span class="price__from">od</span> ${eur.format(p.price)}</span>`
        : `<span class="price">${eur.format(p.price)} – ${eur.format(p.priceMax)}</span>`;
    }
    return p.regular > p.price
      ? `<span class="price price--sale"><ins>${eur.format(p.price)}</ins> <del>${eur.format(p.regular)}</del></span>`
      : `<span class="price">${eur.format(p.price)}</span>`;
  };
  const priceText = (p, variation) => {
    if (p.onRequest) return 'Cena na povpraševanje';
    return variation ? eur.format(variation.price) : M.priceRange(p);
  };

  /* ------------------------------------------------------------------
     Ratings: the counts scraped from medikem.si plus reviews written here
     ------------------------------------------------------------------ */
  const allLocalReviews = () => storage.get('mk-reviews', {});
  const localReviews = (p) => allLocalReviews()[p.slug] || [];
  const ratingOf = (p) => {
    const mine = localReviews(p);
    const count = p.reviewCount + mine.length;
    const sum = p.rating * p.reviewCount + mine.reduce((s, r) => s + r.rating, 0);
    return { count, avg: count ? sum / count : 0 };
  };
  const fmt1 = (n) => n.toLocaleString('sl-SI', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const ratingHTML = (p, { withLink = false } = {}) => {
    const { avg, count } = ratingOf(p);
    const label = count ? `Ocena ${fmt1(avg)} od 5 (${count} ${reviewsWord(count)})` : 'Izdelek še ni ocenjen';
    const text = count ? `<strong>${fmt1(avg)}</strong> <span>(${count})</span>` : 'Še ni ocen';
    const link = withLink ? ` <a class="rating__link" href="#mnenja" data-open-reviews>${count ? 'Preberite mnenja' : 'Napišite prvo mnenje'}</a>` : '';
    return `<div class="rating" data-rating-for="${esc(p.slug)}"><span class="stars" style="--rating:${avg.toFixed(2)}" role="img" aria-label="${label}"></span><span class="rating__text">${text}</span>${link}</div>`;
  };
  const refreshRatings = (p) => {
    $$(`[data-rating-for="${p.slug}"]`).forEach((el) => {
      el.outerHTML = ratingHTML(p, { withLink: !!el.querySelector('.rating__link') });
    });
  };

  /* ------------------------------------------------------------------
     Product card – image, name, short info, rating, price, add to cart
     ------------------------------------------------------------------ */
  const cardHTML = (p, catSlug) => {
    const img = p.gallery[0];
    const url = productUrl(p, catSlug);
    const off = !p.onRequest && p.priceMax === p.price ? discount(p.price, p.regular) : 0;
    const badges = [
      !p.onRequest && !p.inStock ? '<span class="badge">Ni na zalogi</span>' : '',
      off ? `<span class="badge badge--sale">−${off} %</span>` : ''
    ].join('');
    const action = buyable(p)
      ? `<button class="btn btn--primary btn--block shop-card__btn" type="button" data-quick-add="${esc(p.slug)}">
           <svg class="icon" aria-hidden="true"><use href="#i-bag"/></svg><span>Dodaj v košarico</span>
         </button>`
      : `<a class="btn btn--outline btn--block shop-card__btn" href="${inquiryHref(p)}">
           <svg class="icon" aria-hidden="true"><use href="#i-mail"/></svg><span>Pošlji povpraševanje</span>
         </a>`;
    return `
      <article class="shop-card${!p.onRequest && !p.inStock ? ' is-oos' : ''}" data-id="${esc(p.id)}">
        <a class="shop-card__media" href="${url}" tabindex="-1" aria-hidden="true">
          <img src="${esc(img.sm)}" alt="" width="520" height="520" loading="lazy">
          ${badges ? `<span class="badges">${badges}</span>` : ''}
        </a>
        <button class="wish" type="button" data-wish="${esc(p.id)}" aria-pressed="false" aria-label="Dodaj med priljubljene">
          <svg class="icon"><use href="#i-heart"/></svg>
        </button>
        <div class="shop-card__body">
          <h3 class="shop-card__name"><a href="${url}">${esc(p.name)}</a></h3>
          <p class="shop-card__info">${esc(p.info)}</p>
          ${ratingHTML(p)}
          <p class="shop-card__price">${priceHTML(p, null, { compact: true })}</p>
          ${action}
        </div>
      </article>`;
  };

  /* ------------------------------------------------------------------
     Variant picker (size, left/right, …) with live stock per option
     ------------------------------------------------------------------ */
  let pickerSeq = 0;
  function createPicker(p, root, onChange) {
    const uid = `opt${++pickerSeq}`;
    const sel = {};
    const matches = (v, s) => Object.entries(s).every(([k, val]) => !val || !v.attrs[k] || v.attrs[k] === val);

    root.innerHTML = p.attributes.map((a) => `
      <fieldset class="opt" data-attr="${esc(a.key)}">
        <legend class="opt__legend">${esc(a.label)}: <span class="opt__chosen" data-chosen>Izberite</span></legend>
        <div class="opt__list">
          ${a.options.map((o) => `
            <label class="opt__item">
              <input type="radio" name="${uid}-${esc(a.key)}" value="${esc(o.value)}">
              <span>${esc(o.label)}</span>
            </label>`).join('')}
        </div>
        <p class="opt__error" role="alert" hidden>Izberite ${esc(attrPhrase(a))}.</p>
      </fieldset>`).join('');

    const update = () => {
      p.attributes.forEach((a) => {
        const fs = $(`[data-attr="${a.key}"]`, root);
        $$('input', fs).forEach((input) => {
          const test = { ...sel, [a.key]: input.value };
          const exists = p.variations.some((v) => matches(v, test));
          const available = p.variations.some((v) => v.inStock && matches(v, test));
          const item = input.parentElement;
          input.disabled = !exists;
          item.classList.toggle('is-oos', exists && !available);
          item.title = !exists ? 'Kombinacija ni na voljo' : available ? '' : 'Ni na zalogi';
        });
        const chosen = a.options.find((o) => o.value === sel[a.key]);
        $('[data-chosen]', fs).textContent = chosen ? chosen.label : 'Izberite';
        fs.classList.toggle('is-chosen', !!chosen);
        if (chosen) { fs.classList.remove('is-missing'); $('.opt__error', fs).hidden = true; }
      });
      const complete = p.attributes.every((a) => sel[a.key]);
      const variation = complete ? p.variations.find((v) => matches(v, sel)) || null : null;
      onChange({ complete, variation, selection: { ...sel } });
    };

    root.addEventListener('change', (e) => {
      const fs = e.target.closest('[data-attr]');
      if (!fs) return;
      sel[fs.dataset.attr] = e.target.value;
      update();
    });

    p.attributes.forEach((a) => {
      if (a.options.length === 1) {
        sel[a.key] = a.options[0].value;
        $(`[data-attr="${a.key}"] input`, root).checked = true;
      }
    });
    update();

    return {
      showMissing() {
        let first = null;
        p.attributes.forEach((a) => {
          if (sel[a.key]) return;
          const fs = $(`[data-attr="${a.key}"]`, root);
          fs.classList.remove('is-missing');
          void fs.offsetWidth;
          fs.classList.add('is-missing');
          $('.opt__error', fs).hidden = false;
          first = first || fs;
        });
        if (first) $('input:not(:disabled)', first).focus({ preventScroll: false });
      },
      label() {
        return p.attributes.map((a) => {
          const o = a.options.find((x) => x.value === sel[a.key]);
          return a.key === SIDE_KEY ? o.label : `${a.label}: ${o.label}`;
        }).join(' · ');
      },
      key() { return `${p.id}:${p.attributes.map((a) => sel[a.key]).join('/')}`; }
    };
  }

  const qtyHTML = (id) => `
    <div class="qty" data-qty-control>
      <button type="button" data-step="-1" aria-label="Zmanjšaj količino"><svg class="icon"><use href="#i-minus"/></svg></button>
      <input id="${id}" type="number" inputmode="numeric" min="1" max="99" value="1" aria-label="Količina">
      <button type="button" data-step="1" aria-label="Povečaj količino"><svg class="icon"><use href="#i-plus"/></svg></button>
    </div>`;
  const readQty = (root) => {
    const input = $('[data-qty-control] input', root);
    const v = Math.max(1, Math.min(99, parseInt(input.value, 10) || 1));
    input.value = v;
    return v;
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qty-control] [data-step]');
    if (!b) return;
    const input = $('input', b.parentElement);
    input.value = Math.max(1, Math.min(99, (parseInt(input.value, 10) || 1) + Number(b.dataset.step)));
  });

  const stockLine = (cls, html) => `<span class="stock${cls ? ` ${cls}` : ''}"><span class="stock__dot"></span><span>${html}</span></span>`;
  const stockHTML = (p, state) => {
    if (p.onRequest) return stockLine('', `Cena in dobavni rok na povpraševanje · <a href="${inquiryHref(p)}">pošlji povpraševanje</a>`);
    if (p.type === 'simple') {
      return p.inStock ? stockLine('is-in', 'Na zalogi')
        : stockLine('is-out', `Ni na zalogi · <a href="${inquiryHref(p)}">pošlji povpraševanje</a>`);
    }
    if (!state.complete) return stockLine('', `Za prikaz zaloge izberite ${esc(p.attributes.map(attrPhrase).join(' in '))}.`);
    if (state.variation && state.variation.inStock) return stockLine('is-in', 'Na zalogi');
    return stockLine('is-out', `Ta izbira ni na zalogi · <a href="${inquiryHref(p)}">pošlji povpraševanje</a>`);
  };

  /* ------------------------------------------------------------------
     Quick add dialog (used from cards on listing and product pages)
     ------------------------------------------------------------------ */
  let qa = null;
  function quickAdd(p, trigger) {
    M.cart.add({ id: p.id, key: p.id, name: p.name, price: p.price, img: p.gallery[0].sm, href: productUrl(p) });
    if (trigger) M.flashAdded(trigger);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick-add]');
    if (!btn) return;
    const p = bySlug.get(btn.dataset.quickAdd);
    if (p) quickAdd(p, btn);
  });

  /* ------------------------------------------------------------------
     Category helpers
     ------------------------------------------------------------------ */
  const catItems = (cat) => cat.order.default.map((id) => byId.get(id)).filter(Boolean);
  const popular = (cat) => cat.order.popularity.map((id) => byId.get(id)).filter(Boolean);
  const primaryCat = (p) => {
    const hinted = D.categories[params.get('kat')];
    if (hinted && hinted.order.default.includes(p.id)) return hinted;
    const child = p.categories.map((c) => D.categories[c]).find((c) => c && c.slug !== ROOT_CAT);
    return child || D.categories[ROOT_CAT];
  };
  const shortName = (name) => { const s = name.replace(/^Opornica za /, ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  const crumbsHTML = (trail) => trail.map(([label, href]) => (href
    ? `<li><a href="${href}">${esc(label)}</a></li>`
    : `<li aria-current="page">${esc(label)}</li>`)).join('');

  /* ------------------------------------------------------------------
     Category listing page
     ------------------------------------------------------------------ */
  function initListing() {
    const page = $('[data-listing]');
    if (!page) return;
    
    const searchQ = params.get('s');
    let cat, parent;
    
    if (searchQ) {
      const qLower = searchQ.toLowerCase();
      const matchedIds = D.products
        .filter(p => p.name.toLowerCase().includes(qLower) || p.slug.toLowerCase().includes(qLower))
        .map(p => p.id);
        
      cat = {
        name: `Rezultati iskanja: "${searchQ}"`,
        slug: 'search',
        parent: null,
        children: [],
        intro: matchedIds.length === 0 ? '<p>Ni najdenih izdelkov za vaše iskanje.</p>' : '',
        order: {
          default: matchedIds,
          popularity: matchedIds,
          date: matchedIds
        },
        count: matchedIds.length,
        image: '' // no image for search
      };
      parent = null;
    } else {
      cat = D.categories[params.get('kategorija')] || D.categories[ROOT_CAT];
      parent = cat.parent ? D.categories[cat.parent] : null;
    }
    
    const items = catItems(cat);
    const grid = $('[data-grid]', page);
    const countEl = $('[data-count]', page);
    const activeEl = $('[data-active]', page);
    const sortEl = $('[data-sort]', page);
    const moreEl = $('[data-more]', page);
    const filtersRoot = $('[data-filters-shell]');
    const filtersPanel = M.createPanel(filtersRoot);

    /* --- header --- */
    document.title = `${cat.name} – Medikem`;
    $('[data-crumbs]', page).innerHTML = crumbsHTML([['Domov', 'index.html'], ...(parent ? [[parent.name, listingUrl(parent.slug)]] : []), [cat.name]]);
    $('[data-cat-eyebrow]', page).textContent = parent ? parent.name : `${items.length} ${productsWord(items.length)}`;
    $('[data-cat-title]', page).textContent = cat.name;
    const introEl = $('[data-cat-intro]', page);
    if (introEl) {
      if (cat.intro) {
        introEl.innerHTML = cat.intro;
        introEl.hidden = false;
      } else {
        introEl.hidden = true;
      }
    }
    const media = $('[data-cat-media]', page);
    if (cat.image) {
      media.innerHTML = `<img src="${esc(cat.image)}" alt="" width="632" height="597" fetchpriority="high">`;
    } else {
      const top = popular(cat)[0];
      if (top && top.gallery && top.gallery[0]) {
        media.classList.add('cat-hero__media--product');
        media.innerHTML = `
          <a class="cat-feature" href="${productUrl(top, cat.slug)}">
            <img src="${esc(top.gallery[0].sm)}" alt="" width="520" height="520">
            <span class="cat-feature__label"><span class="eyebrow">Najbolj priljubljeno</span><strong>${esc(top.name)}</strong></span>
          </a>`;
      } else {
        media.innerHTML = '';
      }
    }

    // subcategory shortcuts: children on the parent page, siblings on a subcategory
    const shortcuts = cat.children.length ? cat.children : (parent ? parent.children : []);
    const subcats = $('[data-subcats]', page);
    if (shortcuts.length) {
      const tiles = [];
      if (!cat.children.length && parent) {
        tiles.push(`<li><a class="subcat" href="${listingUrl(parent.slug)}"><span class="subcat__img subcat__img--all"><svg class="icon"><use href="#i-grid"/></svg></span><span class="subcat__name">Vse ${esc(parent.name.toLowerCase())}<em>${parent.count}</em></span></a></li>`);
      }
      shortcuts.forEach((slug) => {
        const c = D.categories[slug];
        if (!c) return;
        const pop = popular(c);
        if (!pop.length || !pop[0].gallery || !pop[0].gallery[0]) return;
        const img = pop[0].gallery[0].sm;
        const current = c.slug === cat.slug;
        tiles.push(`<li><a class="subcat${current ? ' is-current' : ''}" href="${listingUrl(c.slug)}"${current ? ' aria-current="page"' : ''}>
          <span class="subcat__img"><img src="${esc(img)}" alt="" width="520" height="520" loading="lazy"></span>
          <span class="subcat__name">${esc(shortName(c.name))}<em>${c.count}</em></span></a></li>`);
      });
      subcats.innerHTML = `<ul class="subcats__list">${tiles.join('')}</ul>`;
      subcats.hidden = false;
      const current = $('.is-current', subcats);
      if (current) {
        const row = $('.subcats__list', subcats);
        row.scrollLeft = current.parentElement.offsetLeft - (row.clientWidth - current.offsetWidth) / 2;
      }
    }

    /* --- facets --- */
    const priced = items.filter((p) => !p.onRequest);
    const lo = Math.floor(Math.min(...priced.map((p) => p.price)));
    const hi = Math.ceil(Math.max(...priced.map((p) => p.priceMax)));

    const facetMap = new Map();
    items.forEach((p) => p.attributes.forEach((a) => {
      if (!facetMap.has(a.key)) facetMap.set(a.key, { key: a.key, label: a.label, options: new Map(), products: 0 });
      const f = facetMap.get(a.key);
      f.products += 1;
      a.options.forEach((o) => { if (!f.options.has(o.value)) f.options.set(o.value, o.label); });
    }));
    const facets = [...facetMap.values()]
      .filter((f) => f.options.size > 1)
      .sort((a, b) => (a.key === SIDE_KEY) - (b.key === SIDE_KEY) || b.products - a.products)
      .map((f) => ({ ...f, options: [...f.options].sort(([, a], [, b]) => labelRank(a) - labelRank(b) || a.localeCompare(b, 'sl', { numeric: true })) }));

    const brandCounts = new Map();
    items.forEach((p) => { if (p.brand) brandCounts.set(p.brand, (brandCounts.get(p.brand) || 0) + 1); });
    const brands = [...brandCounts].sort((a, b) => b[1] - a[1]);

    const splitParam = (k) => new Set((params.get(k) || '').split(',').filter(Boolean));
    const [pMin, pMax] = (params.get('cena') || '').split('-').map(Number);
    const state = {
      attrs: Object.fromEntries(facets.map((f) => [f.key, splitParam(paramOf(f.key))])),
      brands: splitParam('znamka'),
      min: Number.isFinite(pMin) && pMin >= lo ? pMin : lo,
      max: Number.isFinite(pMax) && pMax > 0 && pMax <= hi ? pMax : hi,
      stock: params.get('zaloga') === '1',
      sort: params.get('razvrsti') || 'default',
      limit: PAGE_SIZE
    };
    const priceActive = (s) => s.min > lo || s.max < hi;

    // Attribute filters are strict: a product must come in the chosen option (all chosen
    // attributes have to be available in one variation, and in stock if that is requested).
    const fits = (p, s) => {
      if (s.stock && !buyable(p)) return false;
      if (s.brands.size && !s.brands.has(p.brand)) return false;
      if (priceActive(s) && (p.onRequest || p.priceMax < s.min || p.price > s.max)) return false;
      const active = Object.entries(s.attrs).filter(([, set]) => set.size);
      if (!active.length) return true;
      if (!active.every(([k]) => p.attributes.some((a) => a.key === k))) return false;
      return p.variations.some((v) => active.every(([k, set]) => set.has(v.attrs[k])) && (!s.stock || v.inStock));
    };

    const order = (list) => {
      const byOrder = (ids) => {
        const rank = new Map(ids.map((id, i) => [id, i]));
        return [...list].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
      };
      const onReq = (x) => (x.onRequest ? 1 : 0);
      const byPrice = (dir) => [...list].sort((a, b) => (onReq(a) - onReq(b)) || dir * (a.price - b.price));
      switch (state.sort) {
        case 'priljubljenost': return byOrder(cat.order.popularity);
        case 'najnovejse': return byOrder(cat.order.date);
        case 'cena-narascajoce': return byPrice(1);
        case 'cena-padajoce': return byPrice(-1);
        default: return byOrder(cat.order.default);
      }
    };

    /* --- filter UI --- */
    $('[data-cat-tree]').innerHTML = D.categoryTree.map((c) => {
      const href = (slug) => (D.categories[slug] ? listingUrl(slug) : `izdelki.html?kategorija=${slug}`);
      const cur = (slug) => (slug === cat.slug ? ' aria-current="page"' : '');
      const kids = c.children
        ? `<ul>${c.children.map((k) => `<li><a href="${href(k.slug)}"${cur(k.slug)}>${esc(k.name)}<span>${k.count}</span></a></li>`).join('')}</ul>`
        : '';
      return `<li class="${c.children ? 'has-children' : ''}"><a href="${href(c.slug)}"${cur(c.slug)}>${esc(c.name)}<span>${c.count}</span></a>${kids}</li>`;
    }).join('');

    const chips = (name, opts) => opts.map(([value, label]) => `
      <label class="fchip"><input type="checkbox" name="${esc(name)}" value="${esc(value)}"><span>${esc(label)}<em data-facet-count></em></span></label>`).join('');
    $('[data-f-attrs]').innerHTML = facets.map((f) => `
      <section class="filter" aria-labelledby="f-${esc(f.key)}">
        <h3 class="filter__title" id="f-${esc(f.key)}">${esc(f.label)}</h3>
        <div class="fchips" role="group" aria-labelledby="f-${esc(f.key)}">${chips(f.key, f.options)}</div>
      </section>`).join('');
    const brandBox = $('[data-f-brands]');
    brandBox.innerHTML = chips('znamka', brands.map(([b]) => [b, b]));
    brandBox.closest('.filter').hidden = brands.length < 2;

    const minR = $('[data-f-min]');
    const maxR = $('[data-f-max]');
    [minR, maxR].forEach((r) => { r.min = lo; r.max = hi; r.step = 1; });
    const range = $('[data-f-range]');
    const stockEl = $('[data-f-stock]');
    sortEl.value = state.sort;

    function paintRange() {
      const span = Math.max(1, hi - lo);
      range.style.setProperty('--a', `${((state.min - lo) / span) * 100}%`);
      range.style.setProperty('--b', `${((state.max - lo) / span) * 100}%`);
      $('[data-f-min-label]').textContent = eur.format(state.min);
      $('[data-f-max-label]').textContent = eur.format(state.max);
    }
    const syncControls = () => {
      facets.forEach((f) => $$(`[name="${f.key}"]`).forEach((i) => { i.checked = state.attrs[f.key].has(i.value); }));
      $$('[name="znamka"]').forEach((i) => { i.checked = state.brands.has(i.value); });
      minR.value = state.min;
      maxR.value = state.max;
      stockEl.checked = state.stock;
      paintRange();
    };

    const writeUrl = () => {
      const q = new URLSearchParams();
      q.set('kategorija', cat.slug);
      facets.forEach((f) => { if (state.attrs[f.key].size) q.set(paramOf(f.key), [...state.attrs[f.key]].join(',')); });
      if (state.brands.size) q.set('znamka', [...state.brands].join(','));
      if (priceActive(state)) q.set('cena', `${state.min}-${state.max}`);
      if (state.stock) q.set('zaloga', '1');
      if (state.sort !== 'default') q.set('razvrsti', state.sort);
      history.replaceState(null, '', `${location.pathname}?${q}`);
    };

    const activeCount = () => Object.values(state.attrs).reduce((n, s) => n + s.size, 0)
      + state.brands.size + (state.stock ? 1 : 0) + (priceActive(state) ? 1 : 0);

    const renderActive = () => {
      const list = [];
      facets.forEach((f) => state.attrs[f.key].forEach((v) => {
        const label = (f.options.find(([x]) => x === v) || [v, v])[1];
        list.push({ label: f.key === SIDE_KEY ? label : `${f.label} ${label}`, off: () => state.attrs[f.key].delete(v) });
      }));
      state.brands.forEach((b) => list.push({ label: b, off: () => state.brands.delete(b) }));
      if (priceActive(state)) list.push({ label: `${eur.format(state.min)} – ${eur.format(state.max)}`, off: () => { state.min = lo; state.max = hi; } });
      if (state.stock) list.push({ label: 'Na zalogi', off: () => { state.stock = false; } });
      activeEl.replaceChildren(...list.map((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'active-chip';
        b.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-close"/></svg>';
        b.prepend(c.label);
        b.setAttribute('aria-label', `Odstrani filter: ${c.label}`);
        b.addEventListener('click', () => { c.off(); apply(); });
        return b;
      }));
      if (list.length > 1) {
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'active-clear';
        clear.textContent = 'Počisti vse';
        clear.addEventListener('click', clearAll);
        activeEl.append(clear);
      }
      activeEl.hidden = list.length === 0;
      $$('[data-filter-count]').forEach((el) => { el.textContent = activeCount(); el.hidden = activeCount() === 0; });
    };

    const renderFacetCounts = () => {
      const setCount = (input, n) => {
        $('[data-facet-count]', input.parentElement).textContent = n;
        input.parentElement.classList.toggle('is-empty', n === 0 && !input.checked);
      };
      facets.forEach((f) => $$(`[name="${f.key}"]`).forEach((input) => {
        const s = { ...state, attrs: { ...state.attrs, [f.key]: new Set([input.value]) } };
        setCount(input, items.filter((p) => fits(p, s)).length);
      }));
      $$('[name="znamka"]').forEach((input) => {
        const s = { ...state, brands: new Set([input.value]) };
        setCount(input, items.filter((p) => fits(p, s)).length);
      });
    };

    let first = true;
    let list = [];
    function renderGrid(from) {
      const html = list.slice(from, state.limit).map((p) => `<li class="shop-grid__item">${cardHTML(p, cat.slug)}</li>`).join('');
      if (from === 0) grid.innerHTML = html;
      else grid.insertAdjacentHTML('beforeend', html);
      const fresh = $$('.shop-grid__item', grid).slice(from);
      if (!first) fresh.forEach((li, i) => { li.style.animationDelay = `${Math.min(i, 8) * 30}ms`; li.classList.add('is-entering'); });
      first = false;
      const shown = Math.min(state.limit, list.length);
      moreEl.hidden = shown >= list.length;
      $('[data-more-text]', moreEl).textContent = `Prikazanih ${shown} od ${list.length}`;
      $('[data-more-bar]', moreEl).style.setProperty('--p', list.length ? shown / list.length : 1);
      M.wish.sync(grid);
    }
    function apply() {
      state.limit = PAGE_SIZE;
      list = order(items.filter((p) => fits(p, state)));
      renderGrid(0);
      $('[data-empty]', page).hidden = list.length > 0;
      countEl.innerHTML = `<strong>${list.length}</strong> ${productsWord(list.length)}`;
      $$('[data-apply-count]').forEach((el) => { el.textContent = `Prikaži ${list.length} ${productsWord(list.length)}`; });
      syncControls();
      renderActive();
      renderFacetCounts();
      writeUrl();
    }
    function clearAll() {
      Object.values(state.attrs).forEach((s) => s.clear());
      state.brands.clear();
      state.stock = false;
      state.min = lo;
      state.max = hi;
      apply();
    }

    $('[data-more-btn]', moreEl).addEventListener('click', () => {
      const from = state.limit;
      state.limit += PAGE_SIZE;
      renderGrid(from);
      const next = $$('.shop-grid__item', grid)[from];
      if (next) $('a', next).focus({ preventScroll: true });
    });

    filtersRoot.addEventListener('change', (e) => {
      const t = e.target;
      if (state.attrs[t.name]) {
        t.checked ? state.attrs[t.name].add(t.value) : state.attrs[t.name].delete(t.value);
        apply();
      } else if (t.name === 'znamka') {
        t.checked ? state.brands.add(t.value) : state.brands.delete(t.value);
        apply();
      } else if (t === stockEl) {
        state.stock = t.checked;
        apply();
      } else if (t === minR || t === maxR) {
        apply();
      }
    });
    const onRange = (e) => {
      let a = Number(minR.value);
      let b = Number(maxR.value);
      if (a > b - 1) { if (e.target === minR) a = b - 1; else b = a + 1; }
      state.min = Math.max(lo, a);
      state.max = Math.min(hi, b);
      minR.value = state.min;
      maxR.value = state.max;
      paintRange();
    };
    minR.addEventListener('input', onRange);
    maxR.addEventListener('input', onRange);
    sortEl.addEventListener('change', () => { state.sort = sortEl.value; apply(); });
    $$('[data-filters-clear]').forEach((b) => b.addEventListener('click', clearAll));
    $$('[data-filters-open]').forEach((b) => b.addEventListener('click', () => filtersPanel.open(b)));
    window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches) filtersPanel.close(); });

    apply();
    renderGuide(cat);
  }

  function renderGuide(cat) {
    const target = $('[data-guide]');
    if (!target || !cat.guide) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = cat.guide;
    const sections = [];
    let current = null;
    Array.from(tpl.content.children).forEach((node) => {
      if (node.tagName === 'H2') {
        current = { title: node.textContent.trim(), nodes: [], long: false };
        sections.push(current);
      } else if (current) {
        current.nodes.push(node);
        if (node.tagName === 'H3') current.long = true;
      }
    });
    if (!sections.length) return;
    // Short question sections read best as FAQ; ones with sub-headings stay in the guide.
    const isFaq = (s) => s.title.endsWith('?') && !s.long;
    const faqs = sections.filter(isFaq);
    const articles = sections.filter((s) => !isFaq(s));
    const slug = (s) => M.fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    $('[data-guide-title]', target).textContent = `Vodnik: ${cat.name.toLowerCase()}`;
    const article = $('[data-guide-article]', target);
    const toc = $('[data-guide-toc]', target);
    articles.forEach((s) => {
      const sec = document.createElement('section');
      sec.id = `vodnik-${slug(s.title)}`;
      const h = document.createElement('h2');
      h.textContent = s.title;
      sec.append(h, ...s.nodes);
      article.append(sec);
      const li = document.createElement('li');
      li.innerHTML = '<a></a>';
      li.firstChild.href = `#${sec.id}`;
      li.firstChild.textContent = s.title;
      toc.append(li);
    });
    $('.guide__grid', target).hidden = articles.length === 0;

    const faqList = $('[data-faq]', target);
    faqs.forEach((s) => {
      const d = document.createElement('details');
      d.className = 'faq__item';
      const sum = document.createElement('summary');
      sum.innerHTML = '<span></span><svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg>';
      sum.firstChild.textContent = s.title;
      const body = document.createElement('div');
      body.className = 'faq__body prose';
      body.append(...s.nodes);
      d.append(sum, body);
      faqList.append(d);
    });
    $('[data-faq-wrap]', target).hidden = faqs.length === 0;

    const links = $$('a', toc);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${en.target.id}`));
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    $$('section', article).forEach((s) => io.observe(s));
    target.hidden = false;
  }

  /* ------------------------------------------------------------------
     Product page
     ------------------------------------------------------------------ */
  function initProduct() {
    const page = $('[data-product-page]');
    if (!page) return;
    const p = bySlug.get(params.get('id')) || byId.get(params.get('id'));
    if (!p) {
      ['[data-product-main]', '[data-tabs]', '.related', '[data-buybar]'].forEach((sel) => { const el = $(sel, page); if (el) el.hidden = true; });
      $('[data-product-missing]', page).hidden = false;
      $('[data-crumbs]', page).innerHTML = crumbsHTML([['Domov', 'index.html'], ['Opornice', listingUrl(ROOT_CAT)], ['Izdelek ni najden']]);
      document.title = 'Izdelek ni najden – Medikem';
      return;
    }
    const cat = primaryCat(p);
    const parent = cat.parent ? D.categories[cat.parent] : null;
    document.title = `${p.name} – Medikem`;
    $('[data-crumbs]', page).innerHTML = crumbsHTML([
      ['Domov', 'index.html'], ...(parent ? [[parent.name, listingUrl(parent.slug)]] : []), [cat.name, listingUrl(cat.slug)], [p.name]
    ]);
    $$('[data-cat-link]', page).forEach((a) => {
      a.href = listingUrl(cat.slug);
      const label = $('[data-cat-link-label]', a);
      if (label) label.textContent = `Vse iz kategorije ${cat.name.toLowerCase()}`;
    });

    /* --- gallery --- */
    const main = $('[data-gallery-main]', page);
    const mainImg = $('img', main);
    const thumbs = $('[data-gallery-thumbs]', page);
    const counter = $('[data-gallery-counter]', page);
    let current = 0;
    const show = (i) => {
      current = (i + p.gallery.length) % p.gallery.length;
      mainImg.src = p.gallery[current].md || p.gallery[current].sm;
      mainImg.alt = current === 0 ? p.name : `${p.name} – slika ${current + 1}`;
      $$('button', thumbs).forEach((b, k) => b.setAttribute('aria-current', String(k === current)));
      counter.textContent = `${current + 1} / ${p.gallery.length}`;
    };
    thumbs.innerHTML = p.gallery.map((g, i) => `
      <button type="button" class="gallery__thumb" aria-label="Prikaži sliko ${i + 1}" aria-current="false">
        <img src="${esc(g.sm)}" alt="" width="120" height="120" loading="lazy">
      </button>`).join('');
    $$('button', thumbs).forEach((b, i) => b.addEventListener('click', () => show(i)));
    const single = p.gallery.length < 2;
    $$('[data-gallery-nav]', page).forEach((b) => {
      b.hidden = single;
      b.addEventListener('click', () => show(current + Number(b.dataset.galleryNav)));
    });
    thumbs.hidden = single;
    counter.hidden = single;
    show(0);

    let x0 = null;
    main.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') x0 = e.clientX; });
    main.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 40 && !single) show(current + (dx < 0 ? 1 : -1));
    });

    const lb = $('[data-lightbox]');
    const lbImg = $('img', lb);
    const lbShow = () => { lbImg.src = p.gallery[current].md || p.gallery[current].sm; lbImg.alt = mainImg.alt; };
    $('[data-zoom]', page).addEventListener('click', () => { lbShow(); document.documentElement.classList.add('is-locked'); lb.showModal(); });
    lb.addEventListener('close', () => document.documentElement.classList.remove('is-locked'));
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target.closest('[data-lb-close]')) lb.close(); });
    $$('[data-lb-nav]', lb).forEach((b) => {
      b.hidden = single;
      b.addEventListener('click', () => { show(current + Number(b.dataset.lbNav)); lbShow(); });
    });
    lb.addEventListener('keydown', (e) => {
      if (single) return;
      if (e.key === 'ArrowRight') { show(current + 1); lbShow(); }
      if (e.key === 'ArrowLeft') { show(current - 1); lbShow(); }
    });

    /* --- summary --- */
    const brandEl = $('[data-p-brand]', page);
    brandEl.textContent = p.brand;
    brandEl.hidden = !p.brand;
    if (p.brand) brandEl.href = `izdelki.html?kategorija=${M.fold(p.brand).replace(/\s+/g, '-')}`;
    $('[data-p-name]', page).textContent = p.name;
    $('[data-p-rating]', page).innerHTML = ratingHTML(p, { withLink: true });
    const shortEl = $('[data-p-short]', page);
    shortEl.innerHTML = p.short || p.info;
    if (shortEl.textContent.length > 280) {
      shortEl.classList.add('is-clamped');
      shortEl.insertAdjacentHTML('afterend', '<a class="pdp__more" href="#tab-desc" data-open-desc>Preberite celoten opis</a>');
    }
    const priceEl = $('[data-p-price]', page);
    const stockEl = $('[data-p-stock]', page);
    const skuEl = $('[data-p-sku]', page);
    const addBtn = $('[data-p-add]', page);
    const barPrice = $('[data-bar-price]');
    const setSku = (sku) => { skuEl.hidden = !sku; $('span', skuEl).textContent = sku; };
    setSku(p.sku);

    $('[data-p-wish]', page).dataset.wish = p.id;
    M.wish.sync(page);

    let state = { complete: p.type === 'simple', variation: null };
    let picker = null;
    const pickerRoot = $('[data-p-picker]', page);
    const sizeHelp = $('[data-size-help]', page);
    sizeHelp.hidden = !p.attributes.some((a) => a.key !== SIDE_KEY);

    const refresh = () => {
      priceEl.innerHTML = priceHTML(p, state.variation);
      if (barPrice) barPrice.textContent = priceText(p, state.variation);
      stockEl.innerHTML = stockHTML(p, state);
      const blocked = p.type === 'simple' ? !buyable(p) : state.complete && !(state.variation && state.variation.inStock);
      $$('[data-p-add], [data-bar-add]').forEach((b) => { b.disabled = blocked; });
    };

    if (!buyable(p)) {
      // sold on request or out of stock: replace the buy row with an inquiry button
      pickerRoot.hidden = true;
      $('.buy', page).innerHTML = `
        <a class="btn btn--primary btn--lg buy__btn" href="${inquiryHref(p)}"><svg class="icon" aria-hidden="true"><use href="#i-mail"/></svg><span>Pošlji povpraševanje</span></a>
        <button class="wish wish--lg" type="button" data-wish="${esc(p.id)}" aria-pressed="false" aria-label="Dodaj med priljubljene"><svg class="icon"><use href="#i-heart"/></svg></button>`;
      M.wish.sync(page);
      const bar = $('[data-buybar]');
      if (bar) bar.remove();
      refresh();
    } else if (p.type === 'variable') {
      picker = createPicker(p, pickerRoot, (s) => {
        state = s;
        if (s.variation) {
          show(s.variation.image);
          setSku(s.variation.sku || p.sku);
        } else {
          setSku(p.sku);
        }
        refresh();
      });
      const fs = $(`[data-attr]:not([data-attr="${SIDE_KEY}"])`, pickerRoot);
      if (fs) { fs.classList.add('has-help'); fs.append(sizeHelp); }
    } else {
      pickerRoot.hidden = true;
      refresh();
    }

    const addToCart = () => {
      if (p.onRequest) return;
      if (p.type === 'variable' && !state.complete) {
        picker.showMissing();
        pickerRoot.scrollIntoView({ block: 'center', behavior: M.reducedMotion.matches ? 'auto' : 'smooth' });
        return;
      }
      const qty = readQty(page);
      if (p.type === 'simple') {
        M.cart.add({ id: p.id, key: p.id, name: p.name, price: p.price, img: p.gallery[0].sm, href: productUrl(p) }, qty);
      } else {
        M.cart.add({
          id: p.id, key: picker.key(), name: p.name, variant: picker.label(),
          price: state.variation.price, img: p.gallery[state.variation.image].sm, href: productUrl(p)
        }, qty);
      }
      M.flashAdded($('[data-p-add]', page));
    };
    if (!p.onRequest) {
      addBtn.addEventListener('click', addToCart);
      const barAdd = $('[data-bar-add]');
      if (barAdd) barAdd.addEventListener('click', addToCart);
      const bar = $('[data-buybar]');
      if (bar) {
        $('[data-bar-name]', bar).textContent = p.name;
        new IntersectionObserver(([en]) => {
          bar.classList.toggle('is-visible', !en.isIntersecting && en.boundingClientRect.top < 0);
        }).observe(addBtn);
      }
    }

    /* --- tabs --- */
    $('[data-tab-desc]', page).innerHTML = p.description || `<p>${esc(p.info)}</p>`;
    const details = [...p.details];
    if (p.brand) details.push(['Znamka', p.brand]);
    if (p.sku) details.push(['Šifra', p.sku]);
    details.push(['Kategorije', p.categories.map((c) => D.categoryNames[c] || c).join(', ')]);
    $('[data-tab-details]', page).innerHTML = `<table class="spec">${details.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;

    const tabs = $$('[role="tab"]', page);
    const panels = $$('[role="tabpanel"]', page);
    const selectTab = (tab, focus = false) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      panels.forEach((pn) => { pn.hidden = pn.id !== tab.getAttribute('aria-controls'); });
      if (focus) tab.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => selectTab(t));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length], true); }
      });
    });
    const openTab = (id) => {
      selectTab(tabs.find((x) => x.getAttribute('aria-controls') === id));
      $('[data-tabs]', page).scrollIntoView({ behavior: M.reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    };
    page.addEventListener('click', (e) => {
      if (e.target.closest('[data-open-reviews]')) { e.preventDefault(); openTab('tab-reviews'); }
      if (e.target.closest('[data-size-help], [data-open-desc]')) { e.preventDefault(); openTab('tab-desc'); }
    });

    initReviews(p, page);

    /* --- related: same category first, then the rest of Opornice --- */
    const seen = new Set([p.id]);
    const related = [...popular(cat), ...popular(D.categories[ROOT_CAT])]
      .filter((r) => !seen.has(r.id) && seen.add(r.id))
      .slice(0, 4);
    $('[data-related]', page).innerHTML = related.map((r) => `<li class="shop-grid__item">${cardHTML(r, cat.slug)}</li>`).join('');
    M.wish.sync($('[data-related]', page));
  }

  /* ------------------------------------------------------------------
     Reviews (medikem.si has none for these products yet; new ones are
     kept in this browser)
     ------------------------------------------------------------------ */
  function initReviews(p, page) {
    const wrap = $('[data-reviews]', page);
    const form = $('[data-review-form]', page);
    const msg = $('[data-review-msg]', page);
    const dateFmt = new Intl.DateTimeFormat('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' });

    const render = () => {
      const { avg, count } = ratingOf(p);
      const list = localReviews(p);
      $('[data-review-tab-count]', page).textContent = count;
      const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: list.filter((r) => r.rating === n).length }));
      $('[data-review-summary]', wrap).innerHTML = `
        <p class="rsum__avg">${count ? fmt1(avg) : '–'}</p>
        <div>
          <span class="stars stars--lg" style="--rating:${avg.toFixed(2)}" role="img" aria-label="${count ? `Ocena ${fmt1(avg)} od 5` : 'Še ni ocen'}"></span>
          <p class="rsum__count">${count ? `${count} ${reviewsWord(count)}` : 'Zaenkrat še ni mnenj'}</p>
        </div>
        <ul class="rsum__bars">${dist.map((d) => `
          <li><span>${d.n}</span><span class="rsum__bar" style="--p:${count ? d.c / count : 0}"></span><span>${d.c}</span></li>`).join('')}
        </ul>`;
      $('[data-review-list]', wrap).innerHTML = list.length ? list.slice().reverse().map((r) => `
        <li class="review">
          <div class="review__head">
            <span class="review__avatar" aria-hidden="true">${esc(r.name.trim().charAt(0).toUpperCase())}</span>
            <div><strong>${esc(r.name)}</strong><time datetime="${esc(r.date)}">${dateFmt.format(new Date(r.date))}</time></div>
            <span class="stars" style="--rating:${r.rating}" role="img" aria-label="Ocena ${r.rating} od 5"></span>
          </div>
          <p>${esc(r.text)}</p>
        </li>`).join('') : '<li class="review review--empty">Bodite prvi, ki boste ocenili ta izdelek.</li>';
      refreshRatings(p);
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const rating = Number((form.elements.rating || {}).value || 0);
      const name = form.elements.name.value.trim();
      const text = form.elements.text.value.trim();
      msg.className = 'review-form__msg';
      const fail = (m, el) => { msg.textContent = m; msg.classList.add('is-error'); el.focus(); };
      if (!rating) return fail('Izberite oceno od 1 do 5 zvezdic.', $('input[name="rating"]', form));
      if (!name) return fail('Vpišite svoje ime.', form.elements.name);
      if (text.length < 10) return fail('Mnenje naj ima vsaj 10 znakov.', form.elements.text);
      const all = allLocalReviews();
      (all[p.slug] = all[p.slug] || []).push({ rating, name: name.slice(0, 60), text: text.slice(0, 1500), date: new Date().toISOString() });
      storage.set('mk-reviews', all);
      form.reset();
      msg.textContent = 'Hvala za vaše mnenje!';
      msg.classList.add('is-success');
      render();
    });
    render();
  }

  function initWishlist() {
    const page = $('#seznam-zelja-page');
    if (!page) return;
    
    document.title = 'Seznam želja – Medikem';
    const grid = $('[data-wishlist-grid]', page);
    const emptyMsg = $('[data-wishlist-empty]', page);
    
    const render = () => {
      const items = M.wish.items().map(id => byId.get(id)).filter(Boolean);
      if (items.length === 0) {
        grid.innerHTML = '';
        grid.hidden = true;
        emptyMsg.hidden = false;
      } else {
        grid.innerHTML = items.map(p => `<div class="shop-grid__item">${cardHTML(p, ROOT_CAT)}</div>`).join('');
        grid.hidden = false;
        emptyMsg.hidden = true;
        M.wish.sync(grid);
      }
    };
    
    render();
    window.addEventListener('mk-wish-changed', render);
  }

  initListing();
  initProduct();
  initWishlist();
})();
