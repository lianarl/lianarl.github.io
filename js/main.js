/* Medikem – front-end interactions (no dependencies) */
(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const eur = new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    }
  };

  // Search input is often typed without č/š/ž, so "glezenj" has to match "gleženj".
  const fold = (s) => s.toLocaleLowerCase('sl').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const priceRange = (p) => {
    if (p.onRequest || p.price == null) return 'Na povpraševanje';
    return p.priceMax > p.price ? `${eur.format(p.price)} – ${eur.format(p.priceMax)}` : eur.format(p.price);
  };
  const FREE_SHIPPING_FROM = 50;
  const SHIPPING_SI = 5;

  /* ------------------------------------------------------------------
     Sticky header: shadow when stuck, hide on scroll down, show on up
     ------------------------------------------------------------------ */
  function initHeader() {
    const header = $('[data-header]');
    const topbar = $('.topbar');
    const results = $('#search-results');
    if (!header) return;
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      const start = topbar ? topbar.offsetHeight : 0;
      const delta = y - lastY;
      header.classList.toggle('is-stuck', y > start);

      const busy = header.contains(document.activeElement)
        || $('.mainnav__item.is-open', header)
        || (results && !results.hidden);

      if (y > start + header.offsetHeight + 240 && delta > 6 && !busy) {
        header.classList.add('is-hidden');
      } else if (delta < -6 || y <= start + header.offsetHeight) {
        header.classList.remove('is-hidden');
      }
      if (Math.abs(delta) > 6) lastY = y;
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
    update();
  }

  /* ------------------------------------------------------------------
     Mega menu: hover/focus handled in CSS; JS adds touch + Escape support
     ------------------------------------------------------------------ */
  function initMegaMenu() {
    const nav = $('[data-mainnav]');
    if (!nav) return;
    const items = $$('.mainnav__item', nav);
    let lastPointer = 'mouse';

    const closeAll = (except) => items.forEach((it) => it !== except && it.classList.remove('is-open'));

    nav.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });

    items.forEach((item) => {
      const link = $('.mainnav__link', item);
      if (!$('.mega, .dropdown', item)) return;
      link.setAttribute('aria-haspopup', 'true');

      // First tap on a touch screen opens the panel, the second follows the link.
      link.addEventListener('click', (e) => {
        if (lastPointer !== 'mouse' && !item.classList.contains('is-open')) {
          e.preventDefault();
          closeAll(item);
          item.classList.add('is-open');
        }
      });
      item.addEventListener('mouseleave', () => {
        item.classList.remove('is-open', 'is-suppressed');
      });
    });

    nav.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const item = e.target.closest('.mainnav__item');
      if (!item) return;
      item.classList.remove('is-open');
      item.classList.add('is-suppressed');
      $('.mainnav__link', item).focus();
    });
    nav.addEventListener('focusout', (e) => {
      const item = e.target.closest('.mainnav__item');
      if (item && !item.contains(e.relatedTarget)) item.classList.remove('is-suppressed', 'is-open');
    });
    document.addEventListener('click', (e) => { if (!nav.contains(e.target)) closeAll(); });
  }

  /* ------------------------------------------------------------------
     Mobile drawer – built from the desktop navigation markup
     ------------------------------------------------------------------ */
  function initDrawer() {
    const drawer = $('[data-drawer]');
    const openBtn = $('[data-drawer-open]');
    const navTarget = $('[data-drawer-nav]');
    if (!drawer || !openBtn || !navTarget) return;

    const list = document.createElement('ul');
    $$('.mainnav__list > .mainnav__item').forEach((item, i) => {
      const top = $('.mainnav__link', item);
      const subs = $$('.mega__links a, .dropdown a', item)
        .filter((a) => a.getAttribute('href') !== top.getAttribute('href'));

      const li = document.createElement('li');
      li.className = 'drawer__item';
      const row = document.createElement('div');
      row.className = 'drawer__row';
      const a = document.createElement('a');
      a.href = top.href;
      a.textContent = top.textContent.trim();
      row.append(a);
      li.append(row);

      if (subs.length) {
        const id = `drawer-sub-${i}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'drawer__toggle';
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', id);
        btn.setAttribute('aria-label', `Podkategorije: ${a.textContent}`);
        btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-chevron-down"/></svg>';
        row.append(btn);

        const sub = document.createElement('ul');
        sub.className = 'drawer__sub';
        sub.id = id;
        sub.hidden = true;
        subs.forEach((s) => {
          const sl = document.createElement('li');
          const sa = document.createElement('a');
          sa.href = s.href;
          sa.textContent = s.textContent.trim();
          sl.append(sa);
          sub.append(sl);
        });
        li.append(sub);

        btn.addEventListener('click', () => {
          const open = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', String(!open));
          sub.hidden = open;
        });
      }
      list.append(li);
    });
    navTarget.append(list);

    const menu = createPanel(drawer);
    openBtn.addEventListener('click', () => menu.open(openBtn));
    window.matchMedia('(min-width: 1100px)').addEventListener('change', (e) => {
      if (e.matches) menu.close();
    });
  }

  /* ------------------------------------------------------------------
     Off-canvas panel behaviour shared by the menu, mini-cart and filters
     ------------------------------------------------------------------ */
  function createPanel(root) {
    const panel = $('.drawer__panel', root);
    let opener = null;
    let finish = null;
    const focusables = () => $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea', panel)
      .filter((el) => el.offsetParent !== null);

    const open = (trigger) => {
      if (finish) { panel.removeEventListener('transitionend', finish); finish = null; }
      opener = trigger || document.activeElement;
      root.hidden = false;
      document.documentElement.classList.add('is-locked');
      if (opener && opener.hasAttribute && opener.hasAttribute('aria-expanded')) opener.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => {
        root.classList.add('is-open');
        const first = focusables()[0];
        if (first) first.focus({ preventScroll: true });
      });
    };

    const close = () => {
      if (root.hidden || !root.classList.contains('is-open')) return;
      root.classList.remove('is-open');
      document.documentElement.classList.remove('is-locked');
      if (opener && opener.hasAttribute && opener.hasAttribute('aria-expanded')) opener.setAttribute('aria-expanded', 'false');
      finish = (e) => {
        if (e && e.target !== panel) return;
        panel.removeEventListener('transitionend', finish);
        finish = null;
        root.hidden = true;
      };
      if (reducedMotion.matches) finish();
      else panel.addEventListener('transitionend', finish);
      if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
    };

    root.addEventListener('click', (e) => { if (e.target.closest('[data-panel-close]')) close(); });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    return { open, close, root, isOpen: () => root.classList.contains('is-open') };
  }

  /* ------------------------------------------------------------------
     Search suggestions (categories from the menu + the product catalogue).
     Submitting the form opens the full results on izdelki.html?s=…
     ------------------------------------------------------------------ */
  function initSearch() {
    const form = $('[data-search]');
    if (!form) return;
    const input = $('#search-input', form);
    const panel = $('#search-results', form);

    const seen = new Set();
    const categories = $$('.mainnav a, .cat-card')
      .map((a) => ({ name: (a.querySelector('.cat-card__name') || a).textContent.trim(), href: a.href }))
      .filter((c) => c.name && !/^poglej vse|^vsi izdelki/i.test(c.name) && !seen.has(c.href) && seen.add(c.href))
      .map((c) => ({ ...c, key: fold(c.name) }));

    // Home page cards are the same products as the catalogue, so dedupe by link
    const seenLinks = new Set();
    const products = [
      ...((window.MEDIKEM_DATA && window.MEDIKEM_DATA.products) || []).map((p) => ({
        name: p.name, href: `izdelek.html?id=${encodeURIComponent(p.slug)}`, img: p.gallery[0] && p.gallery[0].sm, price: priceRange(p)
      })),
      ...$$('.product-card[data-name]').map((card) => ({
        name: card.dataset.name,
        href: $('.product-card__title a', card).getAttribute('href'),
        img: $('img', card).getAttribute('src'),
        price: $('.product-card__price', card).textContent.trim()
      }))
    ]
      .filter((p) => !seenLinks.has(p.href) && seenLinks.add(p.href))
      .map((p) => ({ ...p, key: fold(p.name) }));

    let options = [];
    let active = -1;

    const highlight = (text, q) => {
      const frag = document.createDocumentFragment();
      const key = fold(text);
      const at = key.indexOf(q);
      if (at < 0 || key.length !== text.length) { frag.append(text); return frag; }
      const mark = document.createElement('mark');
      mark.textContent = text.slice(at, at + q.length);
      frag.append(text.slice(0, at), mark, text.slice(at + q.length));
      return frag;
    };

    const setActive = (i) => {
      options.forEach((o, idx) => o.setAttribute('aria-selected', String(idx === i)));
      active = i;
      if (i >= 0) {
        input.setAttribute('aria-activedescendant', options[i].id);
        options[i].scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    };

    const close = () => {
      panel.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      setActive(-1);
    };

    const group = (label, rows) => {
      const wrap = document.createElement('div');
      wrap.className = 'search__group';
      wrap.setAttribute('role', 'group');
      const l = document.createElement('p');
      l.className = 'search__label';
      l.textContent = label;
      wrap.setAttribute('aria-label', label);
      wrap.append(l, ...rows);
      return wrap;
    };

    const render = () => {
      const raw = input.value.trim();
      const q = fold(raw);
      if (q.length < 2) { close(); return; }
      const terms = q.split(/\s+/);
      const matches = (key) => terms.every((t) => key.includes(t));
      const score = (key) => (key.startsWith(terms[0]) ? 0 : key.includes(' ' + terms[0]) ? 1 : 2);

      const cats = categories.filter((c) => matches(c.key)).sort((a, b) => score(a.key) - score(b.key)).slice(0, 6);
      const prods = products.filter((p) => matches(p.key)).slice(0, 5);

      panel.replaceChildren();
      options = [];
      let n = 0;
      const makeOption = (href) => {
        const a = document.createElement('a');
        a.className = 'search__option';
        a.href = href;
        a.id = `search-opt-${n++}`;
        a.setAttribute('role', 'option');
        a.setAttribute('aria-selected', 'false');
        a.tabIndex = -1;
        options.push(a);
        return a;
      };

      if (cats.length) {
        panel.append(group('Kategorije', cats.map((c) => {
          const a = makeOption(c.href);
          const span = document.createElement('span');
          span.append(highlight(c.name, terms[0]));
          a.append(span);
          a.insertAdjacentHTML('beforeend', '<svg class="icon search__chev" aria-hidden="true"><use href="#i-chevron-right"/></svg>');
          return a;
        })));
      }
      if (prods.length) {
        panel.append(group('Izdelki', prods.map((p) => {
          const a = makeOption(p.href);
          const img = document.createElement('img');
          img.src = p.img;
          img.alt = '';
          const name = document.createElement('span');
          name.append(highlight(p.name, terms[0]));
          const price = document.createElement('span');
          price.className = 'search__meta';
          price.textContent = p.price;
          a.append(img, name, price);
          return a;
        })));
      }
      if (!cats.length && !prods.length) {
        const empty = document.createElement('p');
        empty.className = 'search__empty';
        empty.textContent = 'Med predlogi ni zadetkov. Pritisnite Enter za iskanje po celotni trgovini.';
        panel.append(empty);
      }

      const all = document.createElement('button');
      all.type = 'submit';
      all.className = 'search__all';
      all.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-search"/></svg>';
      all.append(`Vsi rezultati za »${raw}«`);
      panel.append(all);

      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      setActive(-1);
    };

    let t;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 90); });
    input.addEventListener('focus', () => { if (input.value.trim().length >= 2) render(); });
    input.addEventListener('keydown', (e) => {
      if (panel.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(active + 1, options.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, -1)); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); options[active].click(); }
      else if (e.key === 'Escape') { close(); }
    });
    document.addEventListener('pointerdown', (e) => { if (!form.contains(e.target)) close(); });
    form.addEventListener('focusout', (e) => { if (!form.contains(e.relatedTarget)) close(); });
  }

  /* ------------------------------------------------------------------
     Hero slider (native scroll-snap + autoplay with progress dots)
     ------------------------------------------------------------------ */
  function initSlider() {
    const root = $('[data-slider]');
    if (!root) return;
    const track = $('[data-slider-track]', root);
    const slides = $$('.slide', track);
    const dotsWrap = $('[data-slider-dots]', root);
    const DELAY = 6500;
    const n = slides.length;
    let index = 0;
    let timer = null;
    let hover = false;
    let focus = false;

    root.style.setProperty('--slide-delay', `${DELAY}ms`);

    const dots = slides.map((slide, i) => {
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'slide');
      slide.setAttribute('aria-label', `${i + 1} od ${n}`);
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'slider__dot';
      dot.setAttribute('aria-label', `Pojdi na ${i + 1}. predstavitev`);
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.append(dot);
      return dot;
    });

    const paused = () => hover || focus || reducedMotion.matches || document.hidden;

    const schedule = () => {
      clearTimeout(timer);
      root.classList.toggle('is-paused', paused());
      if (!paused()) timer = setTimeout(() => goTo(index + 1), DELAY);
    };

    const render = () => {
      dots.forEach((d, i) => {
        d.setAttribute('aria-current', String(i === index));
        d.classList.remove('is-progress');
      });
      void dotsWrap.offsetWidth;
      dots[index].classList.add('is-progress');
      slides.forEach((s, i) => {
        const hidden = i !== index;
        s.setAttribute('aria-hidden', String(hidden));
        $('a', s).tabIndex = hidden ? -1 : 0;
      });
    };

    function goTo(i) {
      index = (i + n) % n;
      track.scrollTo({ left: slides[index].offsetLeft, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      render();
      schedule();
    }

    let scrollT;
    track.addEventListener('scroll', () => {
      clearTimeout(scrollT);
      scrollT = setTimeout(() => {
        const i = Math.round(track.scrollLeft / track.clientWidth);
        if (i !== index && i >= 0 && i < n) { index = i; render(); schedule(); }
      }, 80);
    }, { passive: true });

    $('[data-slider-prev]', root).addEventListener('click', () => goTo(index - 1));
    $('[data-slider-next]', root).addEventListener('click', () => goTo(index + 1));
    root.addEventListener('mouseenter', () => { hover = true; schedule(); });
    root.addEventListener('mouseleave', () => { hover = false; render(); schedule(); });
    root.addEventListener('focusin', () => { focus = true; schedule(); });
    root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) { focus = false; render(); schedule(); } });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); $('a', slides[index]).focus({ preventScroll: true }); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); $('a', slides[index]).focus({ preventScroll: true }); }
    });
    document.addEventListener('visibilitychange', () => { render(); schedule(); });
    window.addEventListener('resize', () => { track.scrollTo({ left: slides[index].offsetLeft }); });

    window.addEventListener('load', () => {
      slides.slice(1).forEach((s) => { const img = $('img', s); if (img) img.loading = 'eager'; });
    }, { once: true });

    render();
    schedule();
  }

  /* ------------------------------------------------------------------
     Best-seller filter chips
     ------------------------------------------------------------------ */
  function initFilters() {
    const bar = $('[data-filters]');
    const grid = $('[data-products]');
    if (!bar || !grid) return;
    bar.hidden = false;
    const chips = $$('.chip', bar);
    const items = $$('.product', grid);

    bar.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const f = chip.dataset.filter;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      grid.classList.toggle('is-all', f === 'all');
      items.forEach((it) => {
        const show = f === 'all' || it.dataset.cats.split(' ').includes(f);
        it.hidden = !show;
        it.classList.remove('is-entering');
        if (show) { void it.offsetWidth; it.classList.add('is-entering'); }
      });
    });
  }

  /* ------------------------------------------------------------------
     Cart, mini-cart and wishlist (front-end demo, persisted in localStorage).
     Exposed as window.Medikem so the shop pages share the same cart.
     ------------------------------------------------------------------ */
  function initCommerce() {
    const cart = storage.get('mk-cart', {});
    Object.keys(cart).forEach((k) => { if (!cart[k] || typeof cart[k].qty !== 'number') delete cart[k]; });
    const wish = new Set(storage.get('mk-wish', []).map(String));

    const countEl = $('[data-cart-count]');
    const totalEl = $('[data-cart-total]');
    const wishEl = $('[data-wish-count]');
    const cartLink = $('[data-cart-link]');
    const toast = $('[data-toast]');
    const miniRoot = $('[data-minicart]');
    const mini = miniRoot ? createPanel(miniRoot) : null;
    let toastT;

    const totals = () => {
      const t = Object.values(cart).reduce((a, i) => ({ qty: a.qty + i.qty, sum: a.sum + i.qty * i.price }), { qty: 0, sum: 0 });
      const missing = Math.max(0, FREE_SHIPPING_FROM - t.sum);
      const shipping = t.qty && missing > 0 ? SHIPPING_SI : 0;
      return { ...t, missing, shipping, total: t.sum + shipping };
    };

    // One cart line with quantity buttons; used by the mini cart and the cart page
    const itemRow = (key, it) => {
      const li = document.createElement('li');
      li.className = 'minicart__item';
      li.innerHTML = `
        <a class="minicart__img" tabindex="-1" aria-hidden="true"><img alt="" width="72" height="72"></a>
        <div class="minicart__body">
          <a class="minicart__name"></a>
          <p class="minicart__variant"></p>
          <div class="minicart__row">
            <div class="qty qty--sm">
              <button type="button" data-qty="-1" aria-label="Zmanjšaj količino"><svg class="icon"><use href="#i-minus"/></svg></button>
              <span aria-live="polite"></span>
              <button type="button" data-qty="1" aria-label="Povečaj količino"><svg class="icon"><use href="#i-plus"/></svg></button>
            </div>
            <strong class="minicart__price"></strong>
          </div>
        </div>
        <button class="minicart__remove" type="button" aria-label="Odstrani iz košarice"><svg class="icon"><use href="#i-close"/></svg></button>`;
      $$('a', li).forEach((a) => { a.href = it.href || '#'; });
      if (it.img) $('img', li).src = it.img;
      $('.minicart__name', li).textContent = it.name;
      const variant = $('.minicart__variant', li);
      variant.textContent = it.variant || '';
      variant.hidden = !it.variant;
      $('.qty span', li).textContent = it.qty;
      $('.minicart__price', li).textContent = eur.format(it.price * it.qty);
      $$('[data-qty]', li).forEach((b) => b.addEventListener('click', () => setQty(key, it.qty + Number(b.dataset.qty))));
      $('.minicart__remove', li).addEventListener('click', () => setQty(key, 0));
      return li;
    };
    const shipText = (missing) => (missing > 0
      ? `Še <strong>${eur.format(missing)}</strong> do brezplačne dostave`
      : '<strong>Dostava po Sloveniji je brezplačna</strong>');

    const renderMini = () => {
      if (!miniRoot) return;
      const { qty, sum, missing, shipping, total } = totals();
      const entries = Object.entries(cart);
      $('[data-minicart-count]', miniRoot).textContent = qty;
      $('[data-minicart-empty]', miniRoot).hidden = entries.length > 0;
      $('[data-minicart-foot]', miniRoot).hidden = entries.length === 0;
      $('[data-minicart-ship]', miniRoot).hidden = entries.length === 0;
      $('[data-minicart-items]', miniRoot).replaceChildren(...entries.map(([key, it]) => itemRow(key, it)));

      $('[data-ship-text]', miniRoot).innerHTML = shipText(missing);
      $('[data-ship-bar]', miniRoot).style.setProperty('--p', Math.min(1, sum / FREE_SHIPPING_FROM));
      $('[data-minicart-subtotal]', miniRoot).textContent = eur.format(sum);
      $('[data-minicart-shipping]', miniRoot).textContent = shipping ? eur.format(shipping) : 'Brezplačno';
      $('[data-minicart-total]', miniRoot).textContent = eur.format(total);
    };

    const render = () => {
      const { qty, sum } = totals();
      countEl.textContent = qty;
      totalEl.textContent = eur.format(sum);
      renderMini();
      window.dispatchEvent(new Event('mk-cart-changed'));
    };

    function setQty(key, q) {
      if (!cart[key]) return;
      if (q <= 0) delete cart[key];
      else cart[key].qty = Math.min(q, 99);
      storage.set('mk-cart', cart);
      render();
    }

    const hideToast = () => { toast.hidden = true; toast.classList.remove('is-leaving'); };
    const showToast = (item) => {
      clearTimeout(toastT);
      $('[data-toast-name]', toast).textContent = item.variant ? `${item.name} · ${item.variant}` : item.name;
      $('.toast__img', toast).src = item.img || '';
      toast.removeEventListener('animationend', hideToast);
      toast.classList.remove('is-leaving');
      toast.hidden = false;
      toastT = setTimeout(() => {
        toast.addEventListener('animationend', hideToast, { once: true });
        toast.classList.add('is-leaving');
      }, 3600);
    };

    const add = (item, qty = 1) => {
      const key = item.key || String(item.id);
      if (cart[key]) cart[key].qty = Math.min(cart[key].qty + qty, 99);
      else cart[key] = { id: String(item.id), name: item.name, variant: item.variant || '', price: item.price, img: item.img, href: item.href, qty };
      storage.set('mk-cart', cart);
      render();
      cartLink.classList.remove('is-bumped');
      void cartLink.offsetWidth;
      cartLink.classList.add('is-bumped');
      showToast(item);
    };

    const flashAdded = (btn) => {
      if (btn.dataset.flashing) return;
      btn.dataset.flashing = '1';
      const html = btn.innerHTML;
      btn.classList.add('is-added');
      btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg><span>Dodano</span>';
      setTimeout(() => {
        btn.classList.remove('is-added');
        btn.innerHTML = html;
        delete btn.dataset.flashing;
      }, 1600);
    };

    const wishIdOf = (btn) => btn.dataset.wish || (btn.closest('[data-id]') || {}).dataset?.id;
    const syncWish = (root = document) => {
      $$('.wish', root).forEach((btn) => {
        const on = wish.has(String(wishIdOf(btn)));
        btn.setAttribute('aria-pressed', String(on));
        btn.setAttribute('aria-label', on ? 'Odstrani iz priljubljenih' : 'Dodaj med priljubljene');
      });
      wishEl.textContent = wish.size;
      wishEl.hidden = wish.size === 0;
    };

    document.addEventListener('click', (e) => {
      const addBtn = e.target.closest('[data-add-to-cart]');
      if (addBtn) {
        e.preventDefault();
        const card = addBtn.closest('.product-card');
        add({
          id: card.dataset.id, name: card.dataset.name, price: parseFloat(card.dataset.price),
          img: $('img', card).getAttribute('src'), href: $('.product-card__title a', card).href
        });
        flashAdded(addBtn);
        return;
      }

      const heart = e.target.closest('.wish');
      if (heart) {
        const id = String(wishIdOf(heart));
        const on = !wish.has(id);
        on ? wish.add(id) : wish.delete(id);
        storage.set('mk-wish', [...wish]);
        syncWish();
        window.dispatchEvent(new Event('mk-wish-changed'));
        heart.classList.remove('is-popping');
        void heart.offsetWidth;
        if (on) heart.classList.add('is-popping');
        return;
      }

      if (mini && (e.target.closest('[data-cart-link]') || e.target.closest('[data-minicart-open]'))) {
        e.preventDefault();
        hideToast();
        mini.open(e.target.closest('[data-cart-link], [data-minicart-open]'));
      }
    });

    window.addEventListener('storage', (e) => {
      if (e.key === 'mk-wish') {
        wish.clear();
        storage.get('mk-wish', []).forEach((id) => wish.add(String(id)));
        syncWish();
        window.dispatchEvent(new Event('mk-wish-changed'));
      }
      if (e.key !== 'mk-cart') return;
      Object.keys(cart).forEach((k) => delete cart[k]);
      Object.assign(cart, storage.get('mk-cart', {}));
      render();
    });

    const clear = () => {
      Object.keys(cart).forEach((k) => delete cart[k]);
      storage.set('mk-cart', cart);
      render();
    };

    window.Medikem = {
      eur, fold, priceRange, storage, createPanel, reducedMotion,
      cart: {
        add, clear, totals, itemRow, shipText,
        entries: () => Object.entries(cart),
        open: () => mini && mini.open(cartLink)
      },
      wish: { has: (id) => wish.has(String(id)), sync: syncWish, items: () => Array.from(wish) },
      flashAdded
    };

    render();
    syncWish();
  }

  /* ------------------------------------------------------------------
     Brand marquee – duplicate the list for a seamless loop
     ------------------------------------------------------------------ */
  function initMarquee() {
    const root = $('[data-marquee]');
    if (!root || reducedMotion.matches) return;
    const track = $('.marquee__track', root);
    const originals = Array.from(track.children);
    originals.forEach((li) => {
      const clone = li.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      $$('a', clone).forEach((a) => { a.tabIndex = -1; });
      track.append(clone);
    });
    const setSpeed = () => {
      const px = track.scrollWidth / 2;
      root.style.setProperty('--marquee-duration', `${Math.round(px / 45)}s`);
    };
    setSpeed();
    window.addEventListener('resize', setSpeed);
    root.classList.add('is-running');
  }

  /* ------------------------------------------------------------------
     Opening hours – live "odprto / zaprto" status in Europe/Ljubljana time
     ------------------------------------------------------------------ */
  function initStoreHours() {
    const stores = $$('[data-store]');
    if (!stores.length) return;

    const dayNames = ['v nedeljo', 'v ponedeljek', 'v torek', 'v sredo', 'v četrtek', 'v petek', 'v soboto'];
    const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
    const fmt = (hhmm) => { const [h, m] = hhmm.split(':'); return `${Number(h)}.${m}`; };

    const now = () => {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Ljubljana', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date());
      const get = (t) => parts.find((p) => p.type === t).value;
      return { day: weekdayIndex[get('weekday')], min: Number(get('hour')) * 60 + Number(get('minute')) };
    };

    const statusFor = (hours) => {
      const { day, min } = now();
      const today = hours[day];
      if (today && min >= toMin(today[0]) && min < toMin(today[1])) {
        return { open: true, text: `Odprto do ${fmt(today[1])}` };
      }
      if (today && min < toMin(today[0])) {
        return { open: false, text: `Zaprto · odpre ob ${fmt(today[0])}` };
      }
      for (let k = 1; k <= 7; k++) {
        const d = (day + k) % 7;
        if (hours[d]) {
          const when = k === 1 ? 'jutri' : dayNames[d];
          return { open: false, text: `Zaprto · odpre ${when} ob ${fmt(hours[d][0])}` };
        }
      }
      return { open: false, text: 'Zaprto' };
    };

    const update = () => {
      const { day } = now();
      stores.forEach((store) => {
        const key = store.dataset.store;
        const hours = JSON.parse(store.dataset.hours);
        const s = statusFor(hours);
        $$(`[data-status-for="${key}"]`).forEach((pill) => {
          const inHero = pill.closest('.promo');
          const label = store.querySelector('.store__name').textContent.split(' ')[0];
          $('.status__text', pill).textContent = inHero ? `${label}: ${s.text.charAt(0).toLowerCase()}${s.text.slice(1)}` : s.text;
          pill.classList.toggle('is-open', s.open);
          pill.hidden = false;
        });
        $$('.hours__row', store).forEach((row) => {
          row.classList.toggle('is-today', row.dataset.days.split(' ').map(Number).includes(day));
        });
      });
      const group = $('[data-status-group]');
      if (group) group.hidden = false;
    };

    update();
    setInterval(update, 60 * 1000);
  }

  /* ------------------------------------------------------------------
     Newsletter (validation + confirmation message; no backend here)
     ------------------------------------------------------------------ */
  function initNewsletter() {
    const form = $('[data-newsletter]');
    if (!form) return;
    const msg = $('[data-newsletter-msg]', form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = form.elements.email;
      const consent = form.elements.consent;
      msg.className = 'newsletter__msg';
      form.classList.remove('is-invalid');
      if (!email.validity.valid) {
        form.classList.add('is-invalid');
        msg.classList.add('is-error');
        msg.textContent = 'Vpišite veljaven e-poštni naslov.';
        email.focus();
        return;
      }
      if (!consent.checked) {
        msg.classList.add('is-error');
        msg.textContent = 'Za prijavo potrebujemo vaše soglasje.';
        consent.focus();
        return;
      }
      msg.classList.add('is-success');
      msg.textContent = 'Hvala! Preverite svojo mapo »Prejeto« ali mapo z vsiljeno pošto, da potrdite svojo naročnino.';
      form.reset();
    });
  }

  /* ------------------------------------------------------------------
     Cookie notice
     ------------------------------------------------------------------ */
  function initCookies() {
    const box = $('[data-cookies]');
    if (!box || storage.get('mk-cookies', null)) return;
    const settings = $('[data-cookie-settings]', box);
    const toggleBtn = $('[data-cookie-toggle]', box);
    const accept = $('[data-cookie-accept]', box);
    const analytics = $('[data-cookie-analytics]', box);

    setTimeout(() => { box.hidden = false; }, 700);

    toggleBtn.addEventListener('click', () => {
      const open = settings.hidden;
      settings.hidden = !open;
      toggleBtn.setAttribute('aria-expanded', String(open));
      toggleBtn.textContent = open ? 'Shrani nastavitve' : 'Nastavitve';
      if (!open) save(analytics.checked);
    });
    accept.addEventListener('click', () => save(true));

    function save(allowAnalytics) {
      storage.set('mk-cookies', { necessary: true, analytics: allowAnalytics, at: Date.now() });
      box.hidden = true;
    }
  }

  /* ------------------------------------------------------------------
     Cart page (kosarica.html) and checkout (blagajna.html)
     ------------------------------------------------------------------ */
  function sumHTML({ sum, shipping, total }) {
    return `
      <dl class="minicart__sum">
        <div><dt>Vmesni seštevek</dt><dd>${eur.format(sum)}</dd></div>
        <div><dt>Dostava po Sloveniji</dt><dd>${shipping ? eur.format(shipping) : 'Brezplačno'}</dd></div>
        <div class="is-total"><dt>Skupaj</dt><dd>${eur.format(total)}</dd></div>
      </dl>`;
  }
  const emptyCartHTML = `
    <div class="cart-page__empty">
      <p><strong>Vaša košarica je prazna.</strong></p>
      <a class="btn btn--primary" href="izdelki.html?kategorija=opornice">Oglejte si opornice</a>
    </div>`;

  function initCartPage() {
    const root = $('[data-cart-page]');
    if (!root || !window.Medikem) return;
    const { cart } = window.Medikem;
    const render = () => {
      const entries = cart.entries();
      if (!entries.length) { root.innerHTML = emptyCartHTML; return; }
      const t = cart.totals();
      root.innerHTML = `
        <div class="cart-page">
          <ul class="minicart__items cart-page__items"></ul>
          <aside class="cart-page__sum" aria-label="Povzetek naročila">
            <p class="cart-page__ship">${cart.shipText(t.missing)}</p>
            ${sumHTML(t)}
            <a class="btn btn--primary btn--block btn--lg" href="blagajna.html">Na blagajno</a>
            <a class="btn btn--outline btn--block" href="izdelki.html?s=">Nadaljuj z nakupovanjem</a>
          </aside>
        </div>`;
      $('.cart-page__items', root).replaceChildren(...entries.map(([key, it]) => cart.itemRow(key, it)));
    };
    render();
    window.addEventListener('mk-cart-changed', render);
  }

  function initCheckout() {
    const form = $('[data-checkout]');
    if (!form || !window.Medikem) return;
    const { cart } = window.Medikem;
    const summary = $('[data-checkout-summary]');
    const msg = $('[data-checkout-msg]', form);
    let done = false;

    const render = () => {
      if (done) return;
      const entries = cart.entries();
      form.hidden = !entries.length;
      if (!entries.length) { summary.innerHTML = emptyCartHTML; return; }
      const lines = entries.map(([, it]) => `
        <li><span>${it.qty} × ${esc(it.name)}${it.variant ? ` <small>${esc(it.variant)}</small>` : ''}</span><strong>${eur.format(it.qty * it.price)}</strong></li>`).join('');
      summary.innerHTML = `<h2 class="checkout__title">Vaše naročilo</h2><ul class="checkout__lines">${lines}</ul>${sumHTML(cart.totals())}`;
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      msg.className = 'checkout__msg';
      const invalid = $$('input, select, textarea', form).find((el) => !el.checkValidity());
      if (invalid) {
        msg.textContent = invalid.type === 'email' && invalid.value ? 'Vpišite veljaven e-poštni naslov.'
          : invalid.type === 'checkbox' ? 'Za oddajo naročila se morate strinjati s splošnimi pogoji.'
            : 'Izpolnite vsa obvezna polja.';
        msg.classList.add('is-error');
        invalid.focus();
        return;
      }
      if (!cart.entries().length) return;
      done = true;
      cart.clear();
      form.hidden = true;
      summary.innerHTML = `
        <div class="cart-page__empty" role="status">
          <p><strong>Hvala za vaše naročilo!</strong></p>
          <p>Potrditev boste prejeli na ${esc(form.elements.email.value)}.</p>
          <a class="btn btn--primary" href="index.html">Nazaj na domačo stran</a>
        </div>`;
      summary.focus();
    });
    render();
    window.addEventListener('mk-cart-changed', render);
  }

  function initYear() {
    const y = $('[data-year]');
    if (y) y.textContent = new Date().getFullYear();
  }

  initHeader();
  initMegaMenu();
  initDrawer();
  initSearch();
  initSlider();
  initFilters();
  initCommerce();
  initCartPage();
  initCheckout();
  initMarquee();
  initStoreHours();
  initNewsletter();
  initCookies();
  initYear();
})();
