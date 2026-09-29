// Rebuilds data/products.js from the public WooCommerce Store API of medikem.si.
// Keeps the hand-written category content (intro, guide, image, description) from the
// existing file; everything else (products, variations, hierarchy, ordering) comes from the API.
const fs = require('fs');

const API = 'https://www.medikem.si/wp-json/wc/store';
const OUT = 'data/products.js';
const SIDE_KEY = 'pa_leva-desna';

async function getAll(path) {
  const all = [];
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`${API}${path}${sep}per_page=100&page=${page}`);
    if (!res.ok) throw new Error(`${path} page ${page}: HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 100) break;
  }
  return all;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, k) => ENTITIES[k]);
const text = (html) => decode(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugify = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = (p, v) => (v == null ? null : parseInt(v, 10) / 10 ** (p.currency_minor_unit ?? 2));
const sentence = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

// One-line teaser for product cards: first sentence, capped at ~160 characters.
const teaser = (html) => {
  const t = text(html);
  const first = (t.match(/^.+?[.!?](\s|$)/) || [t])[0].trim();
  if (first.length <= 160) return first;
  return `${first.slice(0, 157).replace(/\s+\S*$/, '')}…`;
};

const attrKey = (a) => a.taxonomy || `pa_${slugify(a.name)}`;
const attrLabel = (a) => (attrKey(a) === SIDE_KEY ? 'Leva / desna' : sentence(decode(a.name)));
// Sizes (S, XL, 150ML, 38) stay as written; words (ČRNA, LEVA) become sentence case.
const optionLabel = (a, name) => {
  const n = decode(name).trim();
  return /^(pa_velikost|pa_stevilka-noge)$/.test(attrKey(a)) ? n : sentence(n);
};

function mapGallery(images) {
  return (images || []).map((img) => ({ sm: img.thumbnail || img.src, md: img.src, lg: img.src }));
}

function mapProduct(p, variationsById) {
  const pr = p.prices || {};
  const range = pr.price_range;
  const price = money(pr, range ? range.min_amount : pr.price);
  const priceMax = money(pr, range ? range.max_amount : pr.price);
  const gallery = mapGallery(p.images);
  const onRequest = !p.is_purchasable || !price;

  const attrs = (p.attributes || []).filter((a) => a.has_variations && p.type === 'variable');
  const attributes = attrs.map((a) => ({
    key: attrKey(a),
    label: attrLabel(a),
    options: a.terms.map((t) => ({ value: t.slug, label: optionLabel(a, t.name) }))
  }));

  const variations = p.type !== 'variable' ? [] : (p.variations || []).map((ref) => {
    const v = variationsById.get(ref.id);
    if (!v) return null;
    const vattrs = {};
    ref.attributes.forEach(({ name, value }) => {
      const a = attrs.find((x) => x.name === name || x.taxonomy === name);
      if (!a || !value) return; // empty value = "any" in WooCommerce
      const term = a.terms.find((t) => t.slug === value || t.name === value);
      vattrs[attrKey(a)] = term ? term.slug : value;
    });
    const src = v.images && v.images[0] && v.images[0].src;
    let image = src ? gallery.findIndex((g) => g.md === src) : 0;
    if (src && image < 0) { gallery.push(...mapGallery([v.images[0]])); image = gallery.length - 1; }
    const vprice = money(v.prices, v.prices.price);
    return {
      attrs: vattrs,
      price: vprice,
      regular: money(v.prices, v.prices.regular_price),
      sku: v.sku || '',
      // unpriced variations exist in the shop but cannot be ordered
      inStock: !!v.is_in_stock && v.is_purchasable && vprice > 0,
      image: Math.max(0, image)
    };
  }).filter(Boolean);

  return {
    id: p.slug,
    slug: p.slug,
    name: decode(p.name),
    brand: p.brands && p.brands[0] ? decode(p.brands[0].name) : '',
    sku: p.sku || '',
    url: p.permalink,
    type: p.type === 'variable' && variations.length ? 'variable' : 'simple',
    price: onRequest ? null : price,
    priceMax: onRequest ? null : priceMax,
    regular: onRequest ? null : money(pr, pr.regular_price) || price,
    inStock: !!p.is_in_stock,
    onRequest,
    info: teaser(p.short_description || p.description),
    short: p.short_description || '',
    description: p.description || '',
    details: (p.attributes || []).map((a) => [attrLabel(a), a.terms.map((t) => optionLabel(a, t.name)).join(', ')]),
    attributes: variations.length ? attributes : [],
    gallery,
    rating: parseFloat(p.average_rating || '0'),
    reviewCount: p.review_count || 0,
    categories: (p.categories || []).map((c) => c.slug),
    variations
  };
}

async function sync() {
  console.log('Fetching products, variations and categories…');
  const [products, variations, byPopularity, byDate, cats] = await Promise.all([
    getAll('/products'),
    getAll('/products?type=variation'),
    getAll('/products?orderby=popularity'),
    getAll('/products?orderby=date&order=desc'),
    getAll('/products/categories')
  ]);
  console.log(`${products.length} products, ${variations.length} variations, ${cats.length} categories`);

  const src = fs.readFileSync(OUT, 'utf8');
  const old = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));

  const variationsById = new Map(variations.map((v) => [v.id, v]));
  const mapped = products.map((p) => mapProduct(p, variationsById));

  // Category hierarchy straight from WooCommerce
  const catById = new Map(cats.map((c) => [c.id, c]));
  const categories = {};
  cats.forEach((c) => {
    const prev = old.categories[c.slug] || {};
    const parent = c.parent ? catById.get(c.parent) : null;
    categories[c.slug] = {
      ...prev,
      slug: c.slug,
      name: decode(c.name),
      parent: parent ? parent.slug : null,
      children: cats.filter((k) => k.parent === c.id).map((k) => k.slug),
      url: c.permalink || prev.url
    };
  });

  // A parent lists its own products plus those of its subcategories
  const members = (slug) => {
    const c = categories[slug];
    const own = mapped.filter((p) => p.categories.includes(slug)).map((p) => p.id);
    return new Set([...own, ...c.children.flatMap((k) => [...members(k)])]);
  };
  const orderOf = (list, ids) => list.map((p) => p.slug).filter((id) => ids.has(id));
  Object.values(categories).forEach((c) => {
    const ids = members(c.slug);
    c.count = ids.size;
    c.order = { default: orderOf(products, ids), popularity: orderOf(byPopularity, ids), date: orderOf(byDate, ids) };
  });

  const node = (c) => ({ name: c.name, slug: c.slug, count: c.count });
  const categoryTree = Object.values(categories)
    .filter((c) => !c.parent && c.count)
    .map((c) => ({ ...node(c), ...(c.children.length ? { children: c.children.map((k) => node(categories[k])).filter((k) => k.count) } : {}) }));
  const categoryNames = Object.fromEntries(Object.values(categories).map((c) => [c.slug, c.name]));

  // Catalogue-wide ordering for search results and "all products"
  const everything = new Set(mapped.map((p) => p.id));
  const order = { default: orderOf(products, everything), popularity: orderOf(byPopularity, everything), date: orderOf(byDate, everything) };

  const D = { categories, categoryTree, categoryNames, order, products: mapped };
  fs.writeFileSync(OUT, `window.MEDIKEM_DATA = ${JSON.stringify(D, null, 2)};\n`);
  console.log(`Wrote ${OUT}`);
}

sync().catch((err) => { console.error(err); process.exit(1); });
