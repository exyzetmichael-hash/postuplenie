(function () {
  const DATA = window.APP_DATA;
  const LIMITS = { maxVuz: 5, maxPerVuz: 5, maxTotal: 25 };
  const SHORTLIST_KEY = 'postuplenie_shortlist_v1';
  const PASSCODE_KEY = 'postuplenie_passcode_v1';

  const FILTER_LABELS = { ai: 'ИИ', ds: 'Data Science', it: 'IT', business: 'Бизнес' };
  const STATUS_LABELS = {
    pass: 'проходишь', edge: 'на грани', fail: 'не проходишь',
    bvi_only: 'бюджет только БВИ', unavailable: 'недоступно', unknown: 'нет данных'
  };

  DATA.programs.forEach((p, i) => { p.id = 'p' + i; });
  const byId = Object.fromEntries(DATA.programs.map(p => [p.id, p]));

  let shortlist = loadShortlist();
  let syncRef = null;

  const state = {
    filters: new Set(),
    city: '',
    hideUnavailable: true,
    hideFar: false,
    search: ''
  };

  function loadShortlist() {
    try {
      const raw = localStorage.getItem(SHORTLIST_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(id => byId[id] || true) : [];
    } catch (e) { return []; }
  }

  function saveShortlist() {
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify(shortlist));
    if (syncRef) window.SYNC.push(syncRef, shortlist).catch(showSyncError);
  }

  function vuzCounts(list) {
    const counts = {};
    list.forEach(id => {
      const p = byId[id];
      if (!p) return;
      counts[p.vuz] = (counts[p.vuz] || 0) + 1;
    });
    return counts;
  }

  function canAdd(p) {
    if (shortlist.includes(p.id)) return { ok: true };
    if (p.unavailable) return { ok: false, reason: 'Эта программа недоступна: ' + (p.unavailableReason || 'ЕГЭ не подходит') };
    const counts = vuzCounts(shortlist);
    const isNewVuz = !counts[p.vuz];
    if (isNewVuz && Object.keys(counts).length >= LIMITS.maxVuz) {
      return { ok: false, reason: `Уже выбрано максимум ${LIMITS.maxVuz} вузов. Убери какой-то вуз из списка, чтобы добавить ${p.vuz}.` };
    }
    if ((counts[p.vuz] || 0) >= LIMITS.maxPerVuz) {
      return { ok: false, reason: `В ${p.vuz} уже выбрано максимум ${LIMITS.maxPerVuz} направлений.` };
    }
    if (shortlist.length >= LIMITS.maxTotal) {
      return { ok: false, reason: `Достигнут общий лимит ${LIMITS.maxTotal} заявлений.` };
    }
    return { ok: true };
  }

  function toggleShortlist(id) {
    const p = byId[id];
    if (shortlist.includes(id)) {
      shortlist = shortlist.filter(x => x !== id);
    } else {
      const check = canAdd(p);
      if (!check.ok) { alert(check.reason); return; }
      shortlist.push(id);
    }
    saveShortlist();
    renderAll();
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach(c => { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }

  function statusPill(evalResult) {
    return el('span', { class: 'pill pill-' + evalResult.status, title: evalResult.detail || '' }, [evalResult.label]);
  }

  function programCard(p) {
    const evalResult = window.CALC.evaluateProgram(p);
    const inList = shortlist.includes(p.id);
    const badges = [];
    (p.filters || []).forEach(f => badges.push(el('span', { class: 'tag' }, [FILTER_LABELS[f] || f])));
    badges.push(el('span', { class: 'tag tag-muted' }, [p.city]));
    if (p.campusFar) badges.push(el('span', { class: 'tag tag-warn' }, ['кампус далеко от центра']));
    if (p.needsObsh) badges.push(el('span', { class: 'tag tag-warn' }, ['нужно обществознание']));
    if (p.urlVerified === false) badges.push(el('span', { class: 'tag tag-muted' }, ['ссылка не проверена']));

    const stats = [];
    if (p.budget != null) stats.push(`бюджет: ${p.budget}` + (p.quota != null ? ` (квота ${p.quota}, конкурс ${p.realEge})` : ''));
    if (p.paid != null) stats.push(`платных мест: ${p.paid}`);
    if (p.priceYear != null) stats.push(`${p.priceYear.toLocaleString('ru-RU')} ₽/год`);
    if (p.stipend) stats.push(`стипендия: ${p.stipend.toLocaleString('ru-RU')} ₽`);

    const card = el('div', { class: 'card' + (p.unavailable ? ' card-unavailable' : '') }, [
      el('div', { class: 'card-head' }, [
        el('div', { class: 'card-title' }, [
          el('strong', {}, [p.vuz]), ' · ' + p.faculty
        ]),
        statusPill(evalResult)
      ]),
      el('div', { class: 'card-name' }, [p.name + ' (' + p.code + ')']),
      el('div', { class: 'card-ege' }, ['ЕГЭ: ' + p.egeSubjects + (p.egeCheckNeeded ? ' — уточнить точный набор' : '')]),
      el('div', { class: 'badges' }, badges),
      el('div', { class: 'stats' }, [stats.join(' · ')]),
      p.source ? el('div', { class: 'source' }, ['Источник: ' + p.source]) : null,
      el('div', { class: 'card-actions' }, [
        el('a', { href: p.url, target: '_blank', rel: 'noopener', class: 'link' }, ['страница программы →']),
        el('label', { class: 'checkbox' }, [
          el('input', {
            type: 'checkbox',
            checked: inList ? 'checked' : null,
            onchange: () => toggleShortlist(p.id)
          }),
          ' в мой список'
        ])
      ])
    ]);
    return card;
  }

  function filteredPrograms() {
    return DATA.programs.filter(p => {
      if (state.hideUnavailable && p.unavailable) return false;
      if (state.hideFar && p.campusFar) return false;
      if (state.city && p.city !== state.city) return false;
      if (state.filters.size > 0 && !(p.filters || []).some(f => state.filters.has(f))) return false;
      if (state.search) {
        const q = state.search.toLowerCase();
        const hay = (p.vuz + ' ' + p.faculty + ' ' + p.name).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderCatalog() {
    const root = document.getElementById('catalog-list');
    root.innerHTML = '';
    const list = filteredPrograms();
    const byVuz = {};
    list.forEach(p => { (byVuz[p.vuz] = byVuz[p.vuz] || []).push(p); });
    if (list.length === 0) {
      root.appendChild(el('p', { class: 'empty' }, ['Ничего не найдено под текущие фильтры.']));
      return;
    }
    Object.entries(byVuz).forEach(([vuz, programs]) => {
      root.appendChild(el('h2', { class: 'vuz-heading' }, [vuz]));
      const grid = el('div', { class: 'grid' }, programs.map(programCard));
      root.appendChild(grid);
    });
  }

  function renderList() {
    const root = document.getElementById('tab-list');
    root.innerHTML = '';
    const items = shortlist.map(id => byId[id]).filter(Boolean);
    const counts = vuzCounts(shortlist);
    const summary = el('div', { class: 'summary' }, [
      `Вузов: ${Object.keys(counts).length}/${LIMITS.maxVuz} · Направлений всего: ${shortlist.length}/${LIMITS.maxTotal}`
    ]);
    root.appendChild(summary);
    if (items.length === 0) {
      root.appendChild(el('p', { class: 'empty' }, ['Список пуст. Отмечай программы во вкладке «Каталог».']));
      return;
    }
    const byVuz = {};
    items.forEach(p => { (byVuz[p.vuz] = byVuz[p.vuz] || []).push(p); });
    Object.entries(byVuz).forEach(([vuz, programs]) => {
      root.appendChild(el('h2', { class: 'vuz-heading' }, [`${vuz} (${programs.length}/${LIMITS.maxPerVuz})`]));
      const rows = programs.map(p => {
        const evalResult = window.CALC.evaluateProgram(p);
        return el('div', { class: 'list-row' }, [
          el('div', {}, [p.name + ' (' + p.code + ')']),
          statusPill(evalResult),
          el('button', { class: 'btn-remove', onclick: () => toggleShortlist(p.id) }, ['убрать'])
        ]);
      });
      root.appendChild(el('div', { class: 'list-group' }, rows));
    });
  }

  function renderCompare() {
    const root = document.getElementById('tab-compare');
    root.innerHTML = '';
    const items = shortlist.map(id => byId[id]).filter(Boolean);
    if (items.length === 0) {
      root.appendChild(el('p', { class: 'empty' }, ['Список пуст — добавь программы во вкладке «Каталог», чтобы сравнить их здесь.']));
      return;
    }
    const rowsDef = [
      ['Вуз / факультет', p => `${p.vuz} / ${p.faculty}`],
      ['Программа', p => `${p.name} (${p.code})`],
      ['Город / кампус', p => `${p.city} · ${p.campus}${p.campusFar ? ' ⚠ далеко' : ''}`],
      ['Бюджет мест', p => p.budget != null ? String(p.budget) : '—'],
      ['Проходной (бюджет)', p => p.prokhBudget != null ? String(p.prokhBudget) + (p.prokhBudgetApprox ? ' (≈)' : '') : '—'],
      ['Твой балл (с бонусом)', p => String(window.CALC.effectiveScore(p.vuz))],
      ['Статус', p => STATUS_LABELS[window.CALC.evaluateProgram(p).status]],
      ['Платных мест', p => p.paid != null ? String(p.paid) : '—'],
      ['Цена/год', p => p.priceYear != null ? p.priceYear.toLocaleString('ru-RU') + ' ₽' : '—'],
      ['Стипендия', p => p.stipend ? p.stipend.toLocaleString('ru-RU') + ' ₽' : '—'],
      ['Ссылка', p => p.url]
    ];
    const table = el('table', { class: 'compare-table' });
    const headRow = el('tr', {}, [el('th', {}, [''])].concat(items.map(p => el('th', {}, [p.vuz]))));
    table.appendChild(el('thead', {}, [headRow]));
    const tbody = el('tbody', {});
    rowsDef.forEach(([label, fn]) => {
      const tr = el('tr', {}, [el('th', {}, [label])].concat(items.map(p => {
        const val = fn(p);
        if (label === 'Ссылка') return el('td', {}, [el('a', { href: val, target: '_blank', rel: 'noopener' }, ['открыть →'])]);
        return el('td', {}, [val]);
      })));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    root.appendChild(el('div', { class: 'table-wrap' }, [table]));
  }

  function renderAll() {
    renderCatalog();
    renderList();
    renderCompare();
    document.getElementById('shortlist-count').textContent = shortlist.length;
  }

  // --- Фильтры UI ---
  function initFilters() {
    document.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.getAttribute('data-filter');
        if (state.filters.has(f)) state.filters.delete(f); else state.filters.add(f);
        btn.classList.toggle('active');
        renderCatalog();
      });
    });
    document.getElementById('city-filter').addEventListener('change', e => {
      state.city = e.target.value;
      renderCatalog();
    });
    document.getElementById('hide-unavailable').addEventListener('change', e => {
      state.hideUnavailable = e.target.checked;
      renderCatalog();
    });
    document.getElementById('hide-far').addEventListener('change', e => {
      state.hideFar = e.target.checked;
      renderCatalog();
    });
    document.getElementById('search').addEventListener('input', e => {
      state.search = e.target.value;
      renderCatalog();
    });
  }

  // --- Табы ---
  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });
  }

  // --- Синхронизация ---
  function showSyncStatus(text, isError) {
    const box = document.getElementById('sync-status');
    box.textContent = text;
    box.className = isError ? 'sync-status error' : 'sync-status';
  }
  function showSyncError(err) { showSyncStatus('Ошибка синхронизации: ' + err.message, true); }

  function initSync() {
    const passInput = document.getElementById('passcode');
    passInput.value = localStorage.getItem(PASSCODE_KEY) || '';
    if (!window.SYNC.isConfigured()) {
      showSyncStatus('Firebase ещё не настроен — список хранится только в этом браузере. Инструкция в README.md.');
    }
    document.getElementById('sync-connect').addEventListener('click', async () => {
      const passcode = passInput.value.trim();
      if (!passcode) { alert('Введи код доступа.'); return; }
      localStorage.setItem(PASSCODE_KEY, passcode);
      try {
        showSyncStatus('Подключаюсь…');
        const { ref } = await window.SYNC.connect(passcode, remoteShortlist => {
          shortlist = remoteShortlist.filter(id => byId[id]);
          saveShortlistLocalOnly();
          renderAll();
          showSyncStatus('Список обновлён с другого устройства.');
        });
        syncRef = ref;
        showSyncStatus('Подключено. Изменения синхронизируются автоматически.');
        window.SYNC.push(syncRef, shortlist).catch(showSyncError);
      } catch (err) {
        showSyncError(err);
      }
    });
    document.getElementById('sync-disconnect').addEventListener('click', () => {
      window.SYNC.disconnect();
      syncRef = null;
      showSyncStatus('Отключено. Список продолжает храниться локально.');
    });
  }

  function saveShortlistLocalOnly() {
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify(shortlist));
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initFilters();
    initSync();
    renderAll();
  });
})();
