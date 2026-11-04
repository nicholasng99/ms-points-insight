(function () {
  const core = globalThis.PointsInsightCore;
  const STORAGE_PREFIX = 'street:';
  const SCAN_DELAY_MS = 200;
  const LOAD_MORE_TIMEOUT_MS = 10000;
  const LOAD_MORE_PAUSE_MS = 400;

  const streetPrices = new Map();
  const editing = new Set();
  let focusKey = null;
  let scanTimer = null;
  let drawerOpen = false;
  let drawerSignature = '';
  let loadingAll = false;
  let cancelLoad = false;

  function h(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(props)) {
      if (name === 'on') {
        for (const [event, handler] of Object.entries(value)) el.addEventListener(event, handler);
      } else {
        el[name] = value;
      }
    }
    el.append(...children);
    return el;
  }

  // Storage calls throw once the extension is reloaded while this page stays open.
  async function loadStreetPrices() {
    try {
      const stored = await chrome.storage.local.get(null);
      for (const [name, entry] of Object.entries(stored)) {
        if (name.startsWith(STORAGE_PREFIX)) streetPrices.set(name.slice(STORAGE_PREFIX.length), entry);
      }
    } catch (error) {
      console.warn('Points Insight could not load saved prices', error);
    }
  }

  async function saveStreetPrice(key, price) {
    const storageKey = STORAGE_PREFIX + key;
    try {
      if (price === null) {
        streetPrices.delete(key);
        await chrome.storage.local.remove(storageKey);
      } else {
        const entry = { price, updatedAt: Date.now() };
        streetPrices.set(key, entry);
        await chrome.storage.local.set({ [storageKey]: entry });
      }
    } catch (error) {
      console.warn('Points Insight could not save the price', error);
    }
  }

  function buildItem(name, listed, points) {
    if (!name || !listed || !points) return null;
    const key = core.productKey(name);
    const saved = streetPrices.get(key) || null;
    return { name, key, listed, points, saved, ...core.evaluate({ name, listed, points, street: saved && saved.price }) };
  }

  function readCard(card) {
    const nameEl = card.querySelector('.smartbuy-reward__prod-name');
    const priceEl = card.querySelector('.smartbuy-reward__prod-price');
    const pointsEl = card.querySelector('.smartbuy-reward__point-value');
    if (!nameEl || !priceEl || !pointsEl) return null;
    return buildItem(nameEl.textContent.trim(), core.parseAmount(priceEl.textContent), core.parseAmount(pointsEl.textContent));
  }

  function readDetail() {
    const worthEl = document.querySelector('.product-details-display__details .details-worth');
    const titleEl = document.querySelector('.details-title');
    if (!worthEl || !titleEl) return null;
    const pointsEl = [...worthEl.parentElement.querySelectorAll('span')].find((span) =>
      /^[\d,]+$/.test(span.textContent.trim())
    );
    if (!pointsEl) return null;
    const item = buildItem(titleEl.textContent.trim(), core.parseAmount(worthEl.textContent), core.parseAmount(pointsEl.textContent));
    return item && { item, anchor: worthEl };
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function buildEditor(item) {
    const input = h('input', {
      className: 'pi-input',
      type: 'text',
      inputMode: 'decimal',
      placeholder: 'Street S$',
      value: item.saved ? String(item.saved.price) : '',
      ariaLabel: `Street price for ${item.name}`,
    });
    const errorLine = h('div', { className: 'pi-error', role: 'alert' });
    const close = () => {
      editing.delete(item.key);
      input.blur();
      scan();
    };
    const save = () => {
      const parsed = core.parseStreetInput(input.value);
      if (!parsed.ok) {
        errorLine.textContent = 'Enter an amount like 509';
        input.focus();
        return;
      }
      saveStreetPrice(item.key, parsed.price);
      close();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
    const form = h('form', { className: 'pi-editor', on: { submit: (event) => { event.preventDefault(); save(); } } }, [
      input,
      h('button', { className: 'pi-button pi-button--primary', type: 'submit', textContent: 'Save' }),
      h('button', { className: 'pi-button', type: 'button', textContent: 'Cancel', on: { click: close } }),
    ]);
    if (focusKey === item.key) {
      focusKey = null;
      requestAnimationFrame(() => input.focus());
    }
    return [form, errorLine];
  }

  function basisLine(item) {
    if (item.basis === 'face') return 'Face value';
    if (item.basis === 'street') {
      return `Street ${core.formatPrice(item.price)}, ${formatDate(item.saved.updatedAt)}. List value ${item.listValue.toFixed(1)}`;
    }
    return 'Using list price';
  }

  function buildPanel(item, tier, modifier) {
    const parts = [
      h('div', { className: 'pi-headline' }, [
        h('span', { className: `pi-value pi-value--${tier}`, textContent: item.value.toFixed(1) }),
        h('span', { className: 'pi-unit', textContent: 'S$ per 1k pts' }),
      ]),
      h('div', { className: 'pi-basis', textContent: basisLine(item) }),
    ];
    if (item.basis !== 'face') {
      if (editing.has(item.key)) {
        parts.push(...buildEditor(item));
      } else {
        const links = core.searchLinks(item.name).map((link) =>
          h('a', { className: 'pi-link', href: link.url, target: '_blank', rel: 'noopener noreferrer', textContent: link.label })
        );
        const edit = h('button', {
          className: 'pi-button',
          type: 'button',
          textContent: item.saved ? 'Edit price' : 'Set price',
          on: {
            click: () => {
              editing.add(item.key);
              focusKey = item.key;
              scan();
            },
          },
        });
        parts.push(h('div', { className: 'pi-actions' }, [...links, edit]));
      }
    }
    // The store opens the product on any click inside a card, so panel clicks must not reach it.
    return h('div', { className: `pi-panel ${modifier}`, on: { click: (event) => event.stopPropagation() } }, parts);
  }

  // Rebuilds only on change, so the observer settles and typing is never interrupted.
  function renderPanel(existing, item, tier, modifier, attach) {
    const signature = JSON.stringify([item.key, item.listed, item.points, item.saved, tier, editing.has(item.key)]);
    if (existing && existing.dataset.piSignature === signature) return;
    if (existing && existing.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const panel = buildPanel(item, tier, modifier);
    panel.dataset.piSignature = signature;
    if (existing) existing.replaceWith(panel);
    else attach(panel);
  }

  function scan() {
    clearTimeout(scanTimer);
    scanTimer = null;

    const entries = [];
    for (const card of document.querySelectorAll('.smartbuy-card')) {
      const item = readCard(card);
      if (item) entries.push({ card, item });
      else card.querySelector(':scope > .pi-panel')?.remove();
    }

    const tierFor = core.tierCutoffs(entries.map((entry) => entry.item.value));
    for (const { card, item } of entries) {
      const existing = card.querySelector(':scope > .pi-panel');
      renderPanel(existing, item, tierFor(item.value), 'pi-panel--card', (panel) => card.append(panel));
    }

    const detail = readDetail();
    const detailPanel = document.querySelector('.pi-panel--detail');
    if (detail) {
      renderPanel(detailPanel, detail.item, 'mid', 'pi-panel--detail', (panel) => detail.anchor.after(panel));
    } else {
      detailPanel?.remove();
    }

    renderDrawer(entries, tierFor);
  }

  function scheduleScan() {
    if (scanTimer === null) scanTimer = setTimeout(scan, SCAN_DELAY_MS);
  }

  function uniqueRanked(entries) {
    const seen = new Set();
    return entries
      .filter(({ item }) => !seen.has(item.key) && seen.add(item.key))
      .sort((a, b) => b.item.value - a.item.value);
  }

  function jumpToCard(key) {
    const target = [...document.querySelectorAll('.smartbuy-card')].find((card) => {
      const item = readCard(card);
      return item && item.key === key;
    });
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add('pi-flash');
    setTimeout(() => target.classList.remove('pi-flash'), 1600);
  }

  function basisLabel(item) {
    return { face: 'Face', street: 'Street', list: 'List' }[item.basis];
  }

  function buildRow({ item }, index, tierFor) {
    return h('tr', {}, [
      h('td', { className: 'pi-rank', textContent: String(index + 1) }),
      h('td', {}, [
        h('button', {
          className: 'pi-row-name',
          type: 'button',
          textContent: item.name,
          title: 'Show this item on the page',
          on: { click: () => jumpToCard(item.key) },
        }),
      ]),
      h('td', {}, [h('span', { className: `pi-value pi-value--${tierFor(item.value)}`, textContent: item.value.toFixed(1) })]),
      h('td', { className: 'pi-num', textContent: item.points.toLocaleString('en-SG') }),
      h('td', { className: 'pi-num' }, [
        h('div', { textContent: core.formatPrice(item.price) }),
        h('div', { className: 'pi-muted', textContent: basisLabel(item) }),
      ]),
    ]);
  }

  function renderDrawer(entries, tierFor) {
    const launcher = document.querySelector('.pi-launcher');
    if (launcher) launcher.hidden = entries.length === 0 && !drawerOpen;
    const drawer = document.querySelector('.pi-drawer');
    if (!drawer) return;
    drawer.hidden = !drawerOpen;
    if (!drawerOpen) return;

    const ranked = uniqueRanked(entries);
    const hasMore = Boolean(document.querySelector('.listing__load-more a'));
    const signature = JSON.stringify([
      ranked.map(({ item }) => [item.key, item.value, item.basis, tierFor(item.value)]),
      hasMore,
      loadingAll,
    ]);
    if (signature === drawerSignature) return;
    drawerSignature = signature;

    const summary = hasMore
      ? `${ranked.length} items ranked. More are available to load.`
      : `${ranked.length} items ranked.`;
    drawer.querySelector('.pi-summary').textContent = summary;

    const loadButton = drawer.querySelector('.pi-load-all');
    loadButton.hidden = !hasMore && !loadingAll;
    loadButton.textContent = loadingAll ? 'Stop loading' : 'Load all items';

    const body = drawer.querySelector('tbody');
    body.replaceChildren(...ranked.map((entry, index) => buildRow(entry, index, tierFor)));
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitForMoreCards(before) {
    const deadline = Date.now() + LOAD_MORE_TIMEOUT_MS;
    while (Date.now() < deadline && !cancelLoad) {
      if (document.querySelectorAll('.smartbuy-card').length > before) return true;
      await sleep(200);
    }
    return false;
  }

  async function loadAll() {
    if (loadingAll) {
      cancelLoad = true;
      return;
    }
    loadingAll = true;
    cancelLoad = false;
    scan();
    while (!cancelLoad) {
      const button = document.querySelector('.listing__load-more a');
      if (!button) break;
      const before = document.querySelectorAll('.smartbuy-card').length;
      button.click();
      if (!(await waitForMoreCards(before))) break;
      await sleep(LOAD_MORE_PAUSE_MS);
    }
    loadingAll = false;
    scan();
  }

  function setDrawerOpen(open) {
    drawerOpen = open;
    drawerSignature = '';
    scan();
  }

  function mountDrawer() {
    const headings = ['#', 'Item', 'S$/1k pts', 'Points', 'Price'].map((text) => h('th', { scope: 'col', textContent: text }));
    const drawer = h('aside', { className: 'pi-drawer', hidden: true, ariaLabel: 'Points Insight ranking' }, [
      h('div', { className: 'pi-drawer-header' }, [
        h('strong', { textContent: 'Best value first' }),
        h('button', {
          className: 'pi-button',
          type: 'button',
          textContent: 'Close',
          on: { click: () => setDrawerOpen(false) },
        }),
      ]),
      h('div', { className: 'pi-drawer-tools' }, [
        h('span', { className: 'pi-summary' }),
        h('button', { className: 'pi-button pi-button--primary pi-load-all', type: 'button', on: { click: loadAll } }),
      ]),
      h('div', { className: 'pi-table-wrap' }, [
        h('table', { className: 'pi-table' }, [h('thead', {}, [h('tr', {}, headings)]), h('tbody')]),
      ]),
    ]);
    const launcher = h('button', {
      className: 'pi-launcher',
      type: 'button',
      hidden: true,
      textContent: 'Rank by value',
      on: { click: () => setDrawerOpen(!drawerOpen) },
    });
    document.body.append(drawer, launcher);
  }

  async function start() {
    await loadStreetPrices();
    mountDrawer();
    scan();
    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      for (const [name, change] of Object.entries(changes)) {
        if (!name.startsWith(STORAGE_PREFIX)) continue;
        const key = name.slice(STORAGE_PREFIX.length);
        if (change.newValue) streetPrices.set(key, change.newValue);
        else streetPrices.delete(key);
      }
      scheduleScan();
    });
  }

  start();
})();
