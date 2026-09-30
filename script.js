(() => {
  'use strict';

  /* ---------- Config ---------- */
  const API_BASE = 'https://pokeapi.co/api/v2';
  const MAX_ID = 1025;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const STAT_LABELS = {
    hp: 'HP', attack: 'Attack', defense: 'Defense',
    'special-attack': 'Sp. Atk', 'special-defense': 'Sp. Def', speed: 'Speed'
  };
  const STAT_ORDER = Object.keys(STAT_LABELS);

  const TYPE_COLOR = {
    normal: '#b9b9a0', fire: '#ff8a3d', water: '#3d9bff', electric: '#ffd43b', grass: '#4cd964',
    ice: '#7fe3f0', fighting: '#e0524a', poison: '#b45fd6', ground: '#d9b060', flying: '#93a7ff',
    psychic: '#ff6fa8', bug: '#a6c53a', rock: '#b8a56a', ghost: '#7a63c9', dragon: '#6a5cff',
    dark: '#7a6a5e', steel: '#9fb4c4', fairy: '#ff9fdc'
  };

  const TYPE_FX = {
    fire: ['rise', 'dot'], water: ['rise', 'ring'], electric: ['pop', 'bolt'], grass: ['fall', 'leaf'],
    ice: ['fall', 'dot'], fighting: ['pop', 'star'], poison: ['rise', 'ring'], ground: ['fall', 'shard'],
    flying: ['rise', 'wisp'], psychic: ['rise', 'star'], bug: ['rise', 'dot'], rock: ['fall', 'shard'],
    ghost: ['rise', 'wisp'], dragon: ['pop', 'star'], dark: ['rise', 'wisp'], steel: ['pop', 'shard'],
    fairy: ['rise', 'star'], normal: ['pop', 'star']
  };

  /* ---------- Element refs ---------- */
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const els = {
    form: $('search-form'), input: $('search-input'), status: $('status'),
    notice: $('notice'), noticeBall: $('notice-ball'), noticeTitle: $('notice-title'),
    noticeBody: $('notice-body'), noticeActions: $('notice-actions'),
    result: $('result'), loader: $('loader'), loaderText: $('loader-text'),
    stage: $('stage'), rig: $('rig'), layers: $('layers'), fx: $('fx'), stageWord: $('stage-word'),
    dexno: $('dexno'), name: $('pk-name'), genus: $('genus'), types: $('types'), flavor: $('flavor'),
    height: $('f-height'), weight: $('f-weight'), exp: $('f-exp'),
    powerRing: $('power-ring'), powerTotal: $('power-total'), powerTier: $('power-tier'),
    abilities: $('abilities'), abilityDetail: $('ability-detail'),
    stats: $('stats'), matchups: $('matchups'), moves: $('moves'),
    prev: $('prev-btn'), next: $('next-btn'), shiny: $('shiny-btn'), cry: $('cry-btn')
  };

  const state = { pokemon: null, shiny: false, token: 0, stageVisible: false };

  /* ---------- Small helpers ---------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pretty = (s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // Tiny DOM builder. Uses textContent, so API data is never parsed as HTML.
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    kids.flat().forEach((kid) => kid && el.append(kid));
    return el;
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function luminance([r, g, b]) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function lighten(hex, amt = 0.35) {
    const [r, g, b] = hexToRgb(hex).map((v) => Math.round(v + (255 - v) * amt));
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function setStatus(msg) { els.status.textContent = msg; }

  /* ---------- API layer ---------- */
  const cache = new Map();

  // Fetch + check response.ok + parse JSON. Errors carry the HTTP status.
  async function getJSON(url) {
    if (cache.has(url)) return cache.get(url);
    const res = await fetch(url);
    if (!res.ok) {
      const err = new Error(`Request failed with status ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    cache.set(url, json);
    return json;
  }

  function normalizeQuery(raw) {
    return String(raw).trim().toLowerCase().replace(/^#/, '').replace(/[.'’]/g, '').replace(/\s+/g, '-');
  }

  function toModel(data) {
    const stats = STAT_ORDER.map((key) => {
      const found = (data.stats || []).find((s) => s.stat.name === key);
      return { key, label: STAT_LABELS[key], value: found ? found.base_stat : 0 };
    });
    const art = data.sprites?.other?.['official-artwork'];
    return {
      id: data.id,
      name: pretty(data.name),
      types: [...(data.types || [])].sort((a, b) => a.slot - b.slot)
        .map((t) => ({ name: t.type.name, url: t.type.url })),
      height: data.height / 10,   // decimetres -> metres
      weight: data.weight / 10,   // hectograms -> kilograms
      exp: data.base_experience,
      stats,
      total: stats.reduce((sum, s) => sum + s.value, 0),
      abilities: (data.abilities || []).map((a) => ({ name: pretty(a.ability.name), url: a.ability.url, hidden: a.is_hidden })),
      moves: (data.moves || []).slice(0, 10).map((m) => pretty(m.move.name)),
      art: art?.front_default || data.sprites?.front_default || null,
      artShiny: art?.front_shiny || data.sprites?.front_shiny || null,
      cry: data.cries?.latest || data.cries?.legacy || null,
      speciesUrl: data.species?.url || null
    };
  }

  /* ---------- Search flow ---------- */
  async function search(raw, { scroll = true } = {}) {
    const query = normalizeQuery(raw);

    
    if (!query) {
      showError('Type a name first', 'Enter a Pokémon name like pikachu, or a number from 1 to 1025.');
      setStatus('Enter a Pokémon name or number.');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(query)) {
      showError('That name has unusual characters', 'Use letters, numbers and hyphens only. Example: mr-mime.');
      setStatus('Invalid characters in the search.');
      return;
    }

    const token = ++state.token;
    setLoading(true, raw.trim());

    try {
      const data = await getJSON(`${API_BASE}/pokemon/${encodeURIComponent(query)}`);
      if (token !== state.token) return;         
      const p = toModel(data);
      state.pokemon = p;
      state.shiny = false;
      hideNotice();
      render(p);
      setLoading(false);
      setStatus(`Loaded ${p.name} successfully.`);
      els.input.value = p.name.toLowerCase().replace(/ /g, '-');
      if (scroll) els.result.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      loadExtras(p, token);
    } catch (err) {
      if (token !== state.token) return;
      setLoading(false);
      if (err.status === 404) {
        showError(`No Pokémon called “${raw.trim()}”`, 'Check the spelling, or try a number from 1 to 1025.', true);
        setStatus(`No Pokémon found for ${raw.trim()}.`);
      } else {
        showError('Could not reach PokéAPI', 'Check your internet connection and try again.', true);
        setStatus('The request failed.');
      }
    }
  }

  function go(id) { search(String(id), { scroll: false }); }

  /* ---------- Loading / error UI ---------- */
  function setLoading(on, name = '') {
    if (on) {
      setStatus(`Loading ${name}…`);
      if (state.pokemon) {
        // keep the old card visible under a blur while the new data arrives
        els.result.hidden = false;
        els.result.setAttribute('aria-busy', 'true');
        els.loader.hidden = false;
        els.loaderText.textContent = `Loading ${name}…`;
        hideNotice();
      } else {
        showNotice({ title: `Loading ${name}…`, body: 'Fetching data from PokéAPI.', loading: true });
      }
    } else {
      els.result.setAttribute('aria-busy', 'false');
      els.loader.hidden = true;
      if (els.notice.dataset.mode === 'loading') hideNotice();
    }
  }

  function showNotice({ title, body, loading = false, error = false, actions = [] }) {
    els.notice.hidden = false;
    els.notice.dataset.mode = loading ? 'loading' : error ? 'error' : 'info';
    els.notice.classList.toggle('is-error', error);
    els.notice.setAttribute('role', error ? 'alert' : 'status');
    els.noticeBall.hidden = !(loading || error);
    els.noticeTitle.textContent = title;
    els.noticeBody.textContent = body;
    els.noticeActions.replaceChildren(...actions);
    if (!loading) els.notice.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }
  function hideNotice() { els.notice.hidden = true; els.notice.dataset.mode = ''; }

  function showError(title, body, retry = false) {
    els.result.hidden = true;
    state.pokemon = null;
    const actions = retry
      ? [h('button', { class: 'btn btn--small', type: 'button', 'data-q': 'pikachu', text: 'Try Pikachu' }),
         h('button', { class: 'chip', type: 'button', 'data-random': '', text: 'Random Pokémon' })]
      : [];
    showNotice({ title, body, error: true, actions });
  }

  /* ---------- Rendering ---------- */
  function render(p) {
    applyTint(p.types.map((t) => t.name));

    els.dexno.textContent = `#${String(p.id).padStart(3, '0')}`;
    els.name.textContent = p.name;
    els.stageWord.textContent = p.name;
    els.genus.textContent = '';
    els.flavor.textContent = 'Loading Pokédex entry…';
    els.height.textContent = `${p.height.toFixed(1)} m`;
    els.weight.textContent = `${p.weight.toFixed(1)} kg`;
    els.exp.textContent = p.exp != null ? String(p.exp) : 'Unknown';

    els.types.replaceChildren(...p.types.map((t) =>
      h('li', { class: 'type', style: `--c:${TYPE_COLOR[t.name] || '#fff'}`, text: t.name })));

    // Power rating (sum of base stats, max useful range ~720)
    const tier = p.total < 300 ? 'Rookie' : p.total < 450 ? 'Trained' : p.total < 540 ? 'Elite' : p.total < 600 ? 'Champion' : 'Legendary class';
    els.powerTier.textContent = tier;
    animateNumber(els.powerTotal, p.total);
    els.powerRing.style.setProperty('--pct', Math.min(100, (p.total / 720) * 100).toFixed(1));

    // Abilities (click one to read what it does)
    els.abilityDetail.hidden = true;
    els.abilities.replaceChildren(...(p.abilities.length ? p.abilities : [null]).map((a) => {
      if (!a) return h('li', { text: 'No abilities listed' });
      const btn = h('button', { type: 'button', 'aria-pressed': 'false' }, a.name, a.hidden ? h('small', { text: 'hidden' }) : null);
      btn.addEventListener('click', () => showAbility(a, btn));
      return h('li', {}, btn);
    }));

    // Stats
    const fills = [];
    els.stats.replaceChildren(...p.stats.map((s, i) => {
      const fill = h('div', { class: 'bar__fill' });
      fill.style.transitionDelay = `${i * 70}ms`;
      fills.push([fill, s.value]);
      return h('li', {},
        h('span', { class: 'stat__name', text: s.label }),
        h('div', { class: 'bar', 'aria-hidden': 'true' }, fill),
        h('span', { class: 'stat__val', text: String(s.value) }));
    }));
    requestAnimationFrame(() => requestAnimationFrame(() =>
      fills.forEach(([f, v]) => { f.style.width = `${Math.min(100, (v / 255) * 100)}%`; })));

    els.matchups.replaceChildren(h('p', { class: 'muted', text: 'Loading matchups…' }));
    els.moves.replaceChildren(...(p.moves.length ? p.moves : ['No moves listed']).map((m) => h('li', { text: m })));

    els.shiny.disabled = !p.artShiny;
    els.shiny.setAttribute('aria-pressed', 'false');
    els.cry.disabled = !p.cry;

    els.result.hidden = false;
    buildLayers(p);
    flyIn();
    impact(p, { big: true });
  }

  // Extra data: Pokédex text/genus (species) and type matchups (type endpoints)
  async function loadExtras(p, token) {
    const [species, ...typeResults] = await Promise.allSettled([
      p.speciesUrl ? getJSON(p.speciesUrl) : Promise.reject(new Error('no species')),
      ...p.types.map((t) => getJSON(t.url))
    ]);
    if (token !== state.token || state.pokemon !== p) return;

    if (species.status === 'fulfilled') {
      const s = species.value;
      const genus = s.genera?.find((g) => g.language.name === 'en')?.genus;
      const entry = s.flavor_text_entries?.find((f) => f.language.name === 'en')?.flavor_text;
      els.genus.textContent = genus || '';
      els.flavor.textContent = entry ? entry.replace(/[\n\f\r]+/g, ' ') : 'No Pokédex entry available.';
      if (s.is_legendary || s.is_mythical) {
        els.types.append(h('li', { class: 'tag', text: s.is_mythical ? 'Mythical' : 'Legendary' }));
      }
    } else {
      els.flavor.textContent = 'Pokédex entry unavailable right now.';
    }
    renderMatchups(typeResults);
  }

  function renderMatchups(results) {
    const mult = {};
    let ok = 0;
    results.forEach((r) => {
      if (r.status !== 'fulfilled') return;
      ok++;
      const rel = r.value.damage_relations;
      rel.double_damage_from.forEach((t) => { mult[t.name] = (mult[t.name] ?? 1) * 2; });
      rel.half_damage_from.forEach((t) => { mult[t.name] = (mult[t.name] ?? 1) * 0.5; });
      rel.no_damage_from.forEach((t) => { mult[t.name] = 0; });
    });
    if (!ok) { els.matchups.replaceChildren(h('p', { class: 'muted', text: 'Type matchups unavailable right now.' })); return; }

    const group = (label, test, fmt) => {
      const entries = Object.entries(mult).filter(([, m]) => test(m)).sort((a, b) => b[1] - a[1]);
      return h('div', { class: 'matchup' },
        h('span', { class: 'matchup__label', text: label }),
        ...(entries.length
          ? entries.map(([t, m]) => h('span', { class: 'mx', style: `--c:${TYPE_COLOR[t] || '#fff'}` }, t, h('b', { text: fmt(m) })))
          : [h('span', { class: 'muted', text: 'None' })]));
    };
    els.matchups.replaceChildren(
      group('Weak to', (m) => m > 1, (m) => `×${m}`),
      group('Resists', (m) => m > 0 && m < 1, (m) => `×${m}`),
      group('Immune to', (m) => m === 0, () => '')
    );
  }

  async function showAbility(ab, btn) {
    els.abilities.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    const p = state.pokemon;
    els.abilityDetail.hidden = false;
    els.abilityDetail.textContent = 'Loading ability…';
    try {
      const d = await getJSON(ab.url);
      if (state.pokemon !== p) return;
      const en = d.effect_entries?.find((e) => e.language.name === 'en');
      const flavor = d.flavor_text_entries?.find((e) => e.language.name === 'en');
      const text = en?.short_effect || flavor?.flavor_text || 'No description available.';
      els.abilityDetail.replaceChildren(h('strong', { text: `${ab.name}: ` }), document.createTextNode(text.replace(/[\n\f]+/g, ' ')));
    } catch {
      els.abilityDetail.textContent = 'Could not load this ability. Try again.';
    }
  }

  function animateNumber(el, to) {
    if (reduceMotion) { el.textContent = to; return; }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 900);
      el.textContent = Math.round(to * (1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Type tint ---------- */
  function applyTint(types) {
    const c1 = TYPE_COLOR[types[0]] || '#ffd43b';
    const c2 = types[1] ? TYPE_COLOR[types[1]] : lighten(c1, 0.4);
    const avg = hexToRgb(c1).map((v, i) => (v + hexToRgb(c2)[i]) / 2);
    root.style.setProperty('--tint', c1);
    root.style.setProperty('--tint2', c2);
    root.style.setProperty('--on', luminance(avg) > 0.38 ? '#08111f' : '#ffffff');
  }

  /* ---------- 3D layers (extruded stack of the artwork) ---------- */
  function buildLayers(p) {
    const src = state.shiny && p.artShiny ? p.artShiny : p.art;
    els.layers.replaceChildren();
    if (!src) {
      els.layers.append(h('div', { class: 'layers__empty', text: 'No artwork available for this Pokémon.' }));
      return;
    }
    const N = 10, gap = 4;
    for (let i = N - 1; i >= 0; i--) {
      const img = new Image();
      img.src = src;
      img.alt = i === 0 ? p.name : '';
      img.draggable = false;
      img.className = i === 0 ? 'front' : 'back';
      img.style.transform = `translateZ(${(N / 2 - i) * gap}px)`;
      if (i !== 0) img.setAttribute('aria-hidden', 'true');
      img.addEventListener('error', () => {
        els.layers.replaceChildren(h('div', { class: 'layers__empty', text: 'Artwork failed to load.' }));
      }, { once: true });
      els.layers.append(img);
    }
  }

  function restartAnim(el, cls) {
    el.classList.remove('fly-in', 'hit');
    void el.offsetWidth;               // force reflow so the animation restarts
    if (cls) el.classList.add(cls);
    if (cls) el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }
  function flyIn() { if (!reduceMotion) restartAnim(els.layers, 'fly-in'); }

  /* ---------- Impact effects ---------- */
  function spawn(typeName, mode) {
    const eff = TYPE_FX[typeName] || TYPE_FX.normal;
    const [motion, shape] = eff;
    const w = els.fx.clientWidth, hgt = els.fx.clientHeight;
    const cx = w / 2, cy = hgt * 0.46;
    const s = rand(7, 16);
    let x0, y0, x1, y1, dur;

    if (mode === 'burst' || motion === 'pop') {
      const a = rand(0, Math.PI * 2);
      const d = mode === 'burst' ? rand(120, 300) : rand(70, 190);
      x0 = cx + Math.cos(a) * 30; y0 = cy + Math.sin(a) * 30;
      x1 = cx + Math.cos(a) * d;  y1 = cy + Math.sin(a) * d;
      dur = mode === 'burst' ? rand(650, 1100) : rand(900, 1500);
    } else if (motion === 'rise') {
      x0 = rand(w * 0.15, w * 0.85); y0 = hgt * rand(0.65, 0.92);
      x1 = x0 + rand(-50, 50);       y1 = y0 - rand(160, 340);
      dur = rand(2200, 4200);
    } else {
      x0 = rand(w * 0.1, w * 0.9); y0 = -20;
      x1 = x0 + rand(-60, 60);     y1 = hgt * rand(0.6, 0.9);
      dur = rand(2200, 4000);
    }

    const p = h('span', { class: `p p--${shape}` });
    p.style.setProperty('--s', `${s}px`);
    p.style.setProperty('--c', TYPE_COLOR[typeName] || '#fff');
    p.style.setProperty('--x0', `${x0}px`); p.style.setProperty('--y0', `${y0}px`);
    p.style.setProperty('--x1', `${x1}px`); p.style.setProperty('--y1', `${y1}px`);
    p.style.setProperty('--dur', `${dur}ms`);
    p.style.setProperty('--rot', `${rand(-260, 260)}deg`);
    p.addEventListener('animationend', () => p.remove(), { once: true });
    els.fx.append(p);
  }

  function impact(p, { big = false } = {}) {
    if (reduceMotion) return;
    const types = p.types.map((t) => t.name);
    // Flash + shockwave rings
    els.fx.append(h('span', { class: 'flash' }));
    for (let i = 0; i < (big ? 2 : 1); i++) {
      const ring = h('span', { class: 'shock' });
      ring.style.animationDelay = `${i * 140}ms`;
      ring.addEventListener('animationend', () => ring.remove(), { once: true });
      els.fx.append(ring);
    }
    els.fx.querySelectorAll('.flash').forEach((f) => f.addEventListener('animationend', () => f.remove(), { once: true }));
    // Particle burst using each of the Pokémon's types
    const count = big ? 34 : 22;
    for (let i = 0; i < count; i++) spawn(types[i % types.length], 'burst');
    // Screen shake
    els.result.classList.remove('shake');
    void els.result.offsetWidth;
    els.result.classList.add('shake');
    setTimeout(() => els.result.classList.remove('shake'), 480);
  }

  function attack() {
    const p = state.pokemon;
    if (!p) return;
    if (!reduceMotion) restartAnim(els.layers, 'hit');
    impact(p);
    playCry();
  }

  function playCry() {
    const p = state.pokemon;
    if (!p || !p.cry) return;
    const audio = new Audio(p.cry);
    audio.volume = 0.5;
    audio.play().catch(() => { /* autoplay blocked or offline: ignore */ });
  }

  /* ---------- Stage interaction: tilt, drag-to-spin ---------- */
  const tilt = { rx: 0, ry: 0, tx: 0, ty: 0, spin: 0, dragging: false, lastX: 0, moved: 0 };

  els.stage.addEventListener('pointermove', (e) => {
    if (tilt.dragging) {
      tilt.spin += (e.clientX - tilt.lastX) * 0.7;
      tilt.moved += Math.abs(e.clientX - tilt.lastX);
      tilt.lastX = e.clientX;
    } else {
      const r = els.stage.getBoundingClientRect();
      tilt.ty = ((e.clientX - r.left) / r.width * 2 - 1) * 20;   // rotateY target
      tilt.tx = -((e.clientY - r.top) / r.height * 2 - 1) * 14;  // rotateX target
    }
  });
  els.stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    tilt.dragging = true; tilt.lastX = e.clientX; tilt.moved = 0;
    els.stage.classList.add('is-dragging');
    els.stage.setPointerCapture(e.pointerId);
  });
  const endDrag = () => {
    if (!tilt.dragging) return;
    tilt.dragging = false;
    els.stage.classList.remove('is-dragging');
    if (tilt.moved < 6) attack();          
  };
  els.stage.addEventListener('pointerup', endDrag);
  els.stage.addEventListener('pointercancel', () => { tilt.dragging = false; els.stage.classList.remove('is-dragging'); });
  els.stage.addEventListener('pointerleave', () => { if (!tilt.dragging) { tilt.tx = 0; tilt.ty = 0; } });
  els.stage.addEventListener('keydown', (e) => {
    if (e.target !== els.stage) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); attack(); }
    if (e.key === 'ArrowLeft') tilt.spin -= 70;
    if (e.key === 'ArrowRight') tilt.spin += 70;
  });

  new IntersectionObserver(([entry]) => { state.stageVisible = entry.isIntersecting; }).observe(els.stage);

  /* ---------- Backdrop parallax + main animation loop ---------- */
  const mouse = { x: 0, y: 0 }, smooth = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });
  window.addEventListener('scroll', () => {
    root.style.setProperty('--sy', Math.min(window.scrollY, 900));
  }, { passive: true });

  let last = 0, acc = 0;
  function frame(t) {
    const dt = t - last; last = t;

    smooth.x += (mouse.x - smooth.x) * 0.07;
    smooth.y += (mouse.y - smooth.y) * 0.07;
    root.style.setProperty('--px', smooth.x.toFixed(3));
    root.style.setProperty('--py', smooth.y.toFixed(3));

    if (state.pokemon && !els.result.hidden) {
      tilt.rx += (tilt.tx - tilt.rx) * 0.1;
      tilt.ry += (tilt.ty - tilt.ry) * 0.1;
      if (!tilt.dragging) {
        const target = Math.round(tilt.spin / 360) * 360;    
        tilt.spin += (target - tilt.spin) * 0.07;
      }
      els.rig.style.transform = `rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${(tilt.ry + tilt.spin).toFixed(2)}deg)`;

      // Ambient type effects while the card is on screen
      acc += dt;
      if (acc > 230) {
        acc = 0;
        if (state.stageVisible && !document.hidden) {
          const types = state.pokemon.types;
          spawn(pick(types).name, 'ambient');
        }
      }
    }
    requestAnimationFrame(frame);
  }
  if (!reduceMotion) requestAnimationFrame(frame);

  /* ---------- Backdrop scene builders ---------- */
  const builders = {
    stars(el) {
      const n = Number(el.dataset.count) || 50;
      for (let i = 0; i < n; i++) {
        const s = rand(1, 3);
        const star = h('i', { class: 'star' });
        star.style.cssText = `--l:${rand(0, 100)}%;--t:${rand(0, 92)}%;--s:${s}px;--dur:${rand(2, 6)}s;--delay:${rand(0, 5)}s`;
        el.append(star);
      }
    },
    clouds(el, n, size) {
      for (let i = 0; i < n; i++) {
        const dur = rand(90, 170);
        const cloud = h('i', { class: 'cloud' });
        cloud.style.cssText = `--top:${rand(2, 42)}%;--w:${rand(size[0], size[1])};--dur:${dur}s;--delay:-${rand(0, dur)}s`;
        el.append(cloud);
      }
    },
    trees(el) {
      for (let i = 0; i < 34; i++) {
        const tree = h('i', { class: 'tree' });
        tree.style.cssText = `--l:${(i / 34) * 100 + rand(-1.5, 1.5)}%;--b:${rand(27, 35)}%;--h:${rand(6, 14)}`;
        el.append(tree);
      }
    },
    flowers(el) {
      for (let i = 0; i < 30; i++) {
        const f = h('i', { class: 'flower' });
        f.style.cssText = `--l:${rand(-2, 50)}%;--b:${rand(0, 26)}%;--s:${rand(1, 2.2)}`;
        el.append(f);
      }
    }
  };
  document.querySelectorAll('[data-fill]').forEach((el) => {
    const kind = el.dataset.fill;
    if (kind === 'clouds-far') builders.clouds(el, 6, [22, 34]);
    else if (kind === 'clouds-near') builders.clouds(el, 4, [34, 52]);
    else if (builders[kind]) builders[kind](el);
  });

  /* ---------- List / Choose: every Pokémon, A to Z ---------- */
  const list = {
    dialog: $('list-dialog'), btn: $('list-btn'), close: $('list-close'),
    filter: $('list-filter'), letters: $('letters'), body: $('list-body'),
    grid: $('list-grid'), sentinel: $('list-sentinel'), msg: $('list-msg'), count: $('list-count'),
    all: null, filtered: [], shown: 0, letter: 'all', loading: false
  };
  const BATCH = 60;
  const artUrl = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  const spriteUrl = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

  async function loadList() {
    if (list.all || list.loading) return;
    list.loading = true;
    list.count.textContent = 'Loading…';
    list.msg.replaceChildren(h('span', { class: 'ball', 'aria-hidden': 'true' }), h('span', { text: 'Loading every Pokémon from PokéAPI…' }));
    try {
      const [index, ...typeResults] = await Promise.allSettled([
        getJSON(`${API_BASE}/pokemon?limit=100000`),
        ...Object.keys(TYPE_COLOR).map((t) => getJSON(`${API_BASE}/type/${t}`))
      ]);
      if (index.status !== 'fulfilled') throw index.reason;

      const typeMap = new Map();         
      typeResults.forEach((r) => {
        if (r.status !== 'fulfilled') return;
        r.value.pokemon.forEach(({ pokemon, slot }) => {
          const arr = typeMap.get(pokemon.name) || [];
          arr[slot - 1] = r.value.name;
          typeMap.set(pokemon.name, arr);
        });
      });

      list.all = index.value.results
        .map((r) => {
          const id = Number((r.url.match(/\/pokemon\/(\d+)\/?$/) || [])[1]);
          return { name: r.name, id, types: (typeMap.get(r.name) || []).filter(Boolean) };
        })
        .filter((p) => p.id)
        .sort((a, b) => a.name.localeCompare(b.name));   

      buildLetters();
      applyListFilter();
    } catch {
      list.count.textContent = 'Could not load the list';
      list.msg.replaceChildren(
        h('span', { text: 'Could not reach PokéAPI. Check your connection and try again.' }),
        h('button', { class: 'btn btn--small', type: 'button', text: 'Try again', onclick: loadList }));
    } finally {
      list.loading = false;
    }
  }

  function buildLetters() {
    const has = new Set(list.all.map((p) => p.name[0].toUpperCase()));
    const make = (value, label) => h('button', {
      type: 'button', 'data-letter': value, 'aria-pressed': String(value === list.letter),
      ...(value !== 'all' && !has.has(value) ? { disabled: '' } : {}), text: label
    });
    list.letters.replaceChildren(make('all', 'All'), ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => make(l, l)));
  }

  function applyListFilter() {
    if (!list.all) return;
    const q = list.filter.value.trim().toLowerCase().replace(/\s+/g, '-');
    list.filtered = list.all.filter((p) =>
      (list.letter === 'all' || p.name[0].toUpperCase() === list.letter) &&
      (!q || p.name.includes(q) || String(p.id) === q));
    list.grid.replaceChildren();
    list.shown = 0;
    list.body.scrollTop = 0;
    list.count.textContent = `${list.filtered.length} of ${list.all.length} Pokémon, A to Z`;

    if (!list.filtered.length) {
      list.msg.replaceChildren(
        h('span', { text: 'No Pokémon match that filter.' }),
        h('button', { class: 'chip', type: 'button', text: 'Clear filter', onclick: () => {
          list.filter.value = ''; list.letter = 'all'; syncLetters(); applyListFilter();
        } }));
      return;
    }
    list.msg.replaceChildren();
    renderBatch();
  }

  function syncLetters() {
    list.letters.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.letter === list.letter)));
  }

  function renderBatch() {
    const slice = list.filtered.slice(list.shown, list.shown + BATCH);
    if (!slice.length) return;
    list.shown += slice.length;
    const frag = document.createDocumentFragment();
    slice.forEach((p) => frag.append(makeCard(p)));
    list.grid.append(frag);
    more.unobserve(list.sentinel);
    if (list.shown < list.filtered.length) more.observe(list.sentinel);
  }
  const more = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) renderBatch();
  }, { root: list.body, rootMargin: '500px' });

  function makeCard(p) {
    const c1 = TYPE_COLOR[p.types[0]] || '#8a94a8';
    const c2 = TYPE_COLOR[p.types[1]] || c1;
    const img = h('img', { alt: '', loading: 'lazy', decoding: 'async', width: '160', height: '160', src: artUrl(p.id) });
    let tries = 0;
    img.addEventListener('error', () => {
      tries++;
      if (tries === 1) img.src = spriteUrl(p.id);            
      else img.replaceWith(h('span', { text: '?', 'aria-hidden': 'true' }));   
    });
    const btn = h('button', { class: 'pcard', type: 'button', style: `--c1:${c1};--c2:${c2}`, 'aria-label': `${pretty(p.name)}, number ${p.id}` },
      h('div', { class: 'pcard__art' }, img),
      h('div', { class: 'pcard__info' },
        h('span', { class: 'pcard__id', text: `#${String(p.id).padStart(4, '0')}` }),
        h('span', { class: 'pcard__name', text: pretty(p.name) }),
        h('span', { class: 'pcard__types' }, ...p.types.map((t) => h('i', { style: `--c:${TYPE_COLOR[t] || '#fff'}`, text: t })))));
    btn.addEventListener('click', () => { list.dialog.close(); search(String(p.id)); });
    return h('li', {}, btn);
  }

  let filterTimer;
  list.filter.addEventListener('input', () => { clearTimeout(filterTimer); filterTimer = setTimeout(applyListFilter, 120); });
  list.letters.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-letter]');
    if (!b || b.disabled) return;
    list.letter = b.dataset.letter;
    syncLetters();
    applyListFilter();
  });
  list.btn.addEventListener('click', () => { list.dialog.showModal(); loadList(); });
  list.close.addEventListener('click', () => list.dialog.close());
  list.dialog.addEventListener('click', (e) => { if (e.target === list.dialog) list.dialog.close(); });   

  /* ---------- Events ---------- */
  els.form.addEventListener('submit', (e) => { e.preventDefault(); search(els.input.value); });

  document.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]');
    if (q) { search(q.dataset.q); return; }
    if (e.target.closest('[data-random]')) search(String(Math.ceil(Math.random() * MAX_ID)));
  });

  const step = (dir) => {
    if (!state.pokemon) return;
    const next = ((state.pokemon.id - 1 + dir + MAX_ID) % MAX_ID) + 1;
    go(next);
  };
  els.prev.addEventListener('click', () => step(-1));
  els.next.addEventListener('click', () => step(1));

  els.shiny.addEventListener('click', () => {
    const p = state.pokemon;
    if (!p || !p.artShiny) return;
    state.shiny = !state.shiny;
    els.shiny.setAttribute('aria-pressed', String(state.shiny));
    buildLayers(p);
    impact(p);
  });
  els.cry.addEventListener('click', playCry);

  document.querySelectorAll('[data-scene-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.body.dataset.scene = btn.dataset.sceneBtn;
      document.querySelectorAll('[data-scene-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  // Start with Pikachu, like the reference demo (without jumping the page down).
  search('pikachu', { scroll: false });
})();
