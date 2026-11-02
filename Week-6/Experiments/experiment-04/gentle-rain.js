/* Gentle Rain. Water reveals an invisible clock through brief, fuller splashes. */
(() => {
  'use strict';
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  // Speeds are CSS pixels/second; lifetimes are simulation seconds.
  const settings = Object.freeze({
    density: .00125, speedMin: 230, speedMax: 390,
    lengthMin: 7, lengthMax: 14, breeze: 12,
    splashGravity: 230, maxSplashes: 1000, maxDrips: 240, margin: 24
  });
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const state = {
    width: 1, height: 1, drops: [], drips: [], cavities: new Map(), splashes: [], edges: [], edgeGrid: new Map(),
    mask: null, key: '', elapsed: 0, hits: 0, reduced: media.matches
  };
  let lastFrame, nextClockCheck = 0;
  function clockText(date = new Date()) {
    return `${date.getHours() % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  function makeMask(text) {
    const image = document.createElement('canvas');
    // A low-resolution, softly filtered mask defines the solid clock surfaces and
    // is much cheaper to sample than reading pixels from the visible canvas.
    image.width = Math.max(1, Math.ceil(state.width / 2));
    image.height = Math.max(1, Math.ceil(state.height / 2));
    const pen = image.getContext('2d', { willReadFrequently: true });
    const fontSize = Math.min(image.height * .43, image.width * .79 / (text.length * .57));
    pen.font = `600 ${fontSize}px Arial, Helvetica, sans-serif`;
    pen.textAlign = 'center';
    pen.textBaseline = 'alphabetic';
    const metrics = pen.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent || fontSize * .73;
    const descent = metrics.actualBoundingBoxDescent || fontSize * .02;
    pen.fillStyle = '#000';
    pen.filter = 'blur(.7px)';
    pen.fillText(text, image.width / 2, image.height / 2 + (ascent - descent) / 2, image.width * .8);
    const pixels = pen.getImageData(0, 0, image.width, image.height).data;
    const values = new Float32Array(image.width * image.height);
    for (let i = 0; i < values.length; i++) values[i] = pixels[i * 4 + 3] / 255;
    // Track each character separately, aligned from the right so hour-length
    // changes do not confuse an unchanged minute digit with a different slot.
    const textWidth = metrics.width;
    const compression = Math.min(1, image.width * .8 / textWidth);
    const left = (image.width - textWidth * compression) / 2;
    const glyphs = Array.from(text, (char, i) => ({
      slot: text.length - 1 - i, char,
      left: (left + pen.measureText(text.slice(0, i)).width * compression) / image.width * state.width,
      right: (left + pen.measureText(text.slice(0, i + 1)).width * compression) / image.width * state.width
    }));
    return { width: image.width, height: image.height, values, glyphs };
  }
  function readMask(mask, x, y) {
    if (!mask || x < 0 || y < 0 || x >= state.width || y >= state.height) return 0;
    const px = x / state.width * (mask.width - 1);
    const py = y / state.height * (mask.height - 1);
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const x1 = Math.min(x0 + 1, mask.width - 1), y1 = Math.min(y0 + 1, mask.height - 1);
    const fx = px - x0, fy = py - y0;
    const top = mask.values[y0 * mask.width + x0] * (1 - fx) + mask.values[y0 * mask.width + x1] * fx;
    const bottom = mask.values[y1 * mask.width + x0] * (1 - fx) + mask.values[y1 * mask.width + x1] * fx;
    return top * (1 - fy) + bottom * fy;
  }
  // Marching squares interpolates the blurred mask into smooth contour segments.
  // A spatial index keeps each impact local, even on a large display.
  function buildEdges() {
    state.edges = []; state.edgeGrid = new Map();
    const m = state.mask, sx = state.width / (m.width - 1), sy = state.height / (m.height - 1);
    for (let y = 0; y < m.height - 1; y++) for (let x = 0; x < m.width - 1; x++) {
      const corners = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
      const values = corners.map(([px, py]) => m.values[py * m.width + px]);
      const crossings = [];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        if ((values[i] >= .35) === (values[j] >= .35)) continue;
        const t = (.35 - values[i]) / (values[j] - values[i]);
        crossings.push({ x: (corners[i][0] + (corners[j][0] - corners[i][0]) * t) * sx,
          y: (corners[i][1] + (corners[j][1] - corners[i][1]) * t) * sy });
      }
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const a = crossings[i], b = crossings[i + 1], ex = (a.x + b.x) / 2, ey = (a.y + b.y) / 2;
        const gx = readMask(m, ex - 3, ey) - readMask(m, ex + 3, ey);
        const gy = readMask(m, ex, ey - 3) - readMask(m, ex, ey + 3);
        const length = Math.hypot(gx, gy) || 1;
        const edge = { x: ex, y: ey, nx: gx / length, ny: gy / length };
        state.edges.push(edge);
        const key = `${Math.floor(ex / 20)},${Math.floor(ey / 20)}`;
        if (!state.edgeGrid.has(key)) state.edgeGrid.set(key, []);
        state.edgeGrid.get(key).push(edge);
      }
    }
  }
  function buildCavities() {
    state.cavities = new Map();
    // Find air below a solid stroke that has another solid surface beneath it.
    // These gaps include both counters of an 8 and the openings in 0, 6, and 9.
    for (let col = 0; col < Math.ceil(state.width / 4); col++) {
      const x = (col + .5) * 4;
      let wasSolid = false, roof = null;
      const gaps = [];
      for (let y = 0; y < state.height; y += 2) {
        const solid = readMask(state.mask, x, y) >= .35;
        if (wasSolid && !solid) roof = y;
        if (!wasSolid && solid && roof !== null) {
          if (y - roof > 10) gaps.push({ x, y: roof + 3, floor: y });
          roof = null;
        }
        wasSolid = solid;
      }
      if (gaps.length) state.cavities.set(col, gaps);
    }
  }
  function feedInterior(x, y) {
    if (state.drips.length >= settings.maxDrips) return;
    const gaps = state.cavities.get(Math.floor(x / 4));
    const gap = gaps?.find(g => g.y > y + 4);
    if (!gap || Math.random() > .65) return;
    // Incoming rain supplies a delayed bead at the inner lip. The face remains
    // invisible: only the detached drip and its landing splash are drawn.
    state.drips.push({ x: gap.x, y: gap.y, startY: gap.y,
      speed: rand(65, 100), delay: rand(.12, .45),
      length: rand(3, 5), alpha: rand(.24, .4), vx: 0, done: false });
  }
  function updateClock() {
    const text = clockText();
    if (text === state.key) return;
    state.mask = makeMask(text); state.key = text;
    buildEdges(); buildCavities();
    state.drips = [];
    // A newly appearing digit must not enclose old falling drops or splashes.
    for (const drop of state.drops) if (readMask(state.mask, drop.x, drop.y) >= .35) recycle(drop);
    state.splashes = state.splashes.filter(s => readMask(state.mask, s.x, s.y) < .35);
    canvas.setAttribute('aria-label', `Gentle rain revealing ${text}, local time, with small, lively splashes.`);
  }
  function spawnDrop() {
    const drop = { x: 0, y: 0, speed: rand(settings.speedMin, settings.speedMax),
      length: rand(settings.lengthMin, settings.lengthMax), alpha: rand(.12, .32), seed: rand(0, Math.PI * 2) };
    do { drop.x = rand(0, state.width); drop.y = rand(0, state.height); }
    while (readMask(state.mask, drop.x, drop.y) > .1);
    return drop;
  }
  function recycle(drop) { drop.x = rand(-settings.margin, state.width + settings.margin); drop.y = -rand(settings.margin, settings.margin + 25); }
  function impact(x, y) {
    state.hits++;
    feedInterior(x, y);
    let nearest, distance = Infinity;
    const col = Math.floor(x / 20), row = Math.floor(y / 20);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const e of state.edgeGrid.get(`${col + dx},${row + dy}`) || []) {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < distance) { nearest = e; distance = d; }
      }
    }
    const nx = nearest?.nx || 0, ny = nearest?.ny ?? -1;
    // A fuller fan of beads lifts away from the surface, then falls and fades.
    for (let i = 0; i < 5 && state.splashes.length < settings.maxSplashes; i++) {
      const tangent = rand(-34, 34), outward = rand(22, 46);
      state.splashes.push({ x: x + nx * 2, y: y + ny * 2,
        vx: nx * outward - ny * tangent, vy: ny * outward + nx * tangent,
        age: 0, life: rand(.24, .44), alpha: rand(.34, .58), size: rand(.7, 1.25) });
    }
  }
  function step(dt) {
    state.elapsed += dt;
    const breeze = settings.breeze + Math.sin(state.elapsed * .19) * 7;
    for (const drop of state.drops) {
      drop.vx = breeze + Math.sin(state.elapsed * .6 + drop.seed) * 2;
      const dx = drop.vx * dt, dy = drop.speed * dt;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2));
      for (let i = 0; i < steps; i++) {
        const x = drop.x + dx / steps, y = drop.y + dy / steps;
        if (readMask(state.mask, x, y) >= .35) {
          impact(drop.x, drop.y); recycle(drop); break;
        }
        drop.x = x; drop.y = y;
      }
      if (drop.y > state.height + settings.margin || drop.x > state.width + settings.margin || drop.x < -settings.margin) recycle(drop);
    }
    for (const drip of state.drips) {
      if (drip.delay > 0) { drip.delay -= dt; continue; }
      drip.speed = Math.min(260, drip.speed + 210 * dt);
      const distance = drip.speed * dt;
      const steps = Math.max(1, Math.ceil(distance / 2));
      for (let i = 0; i < steps; i++) {
        const y = drip.y + distance / steps;
        if (readMask(state.mask, drip.x, y) >= .35) {
          impact(drip.x, drip.y); drip.done = true; break;
        }
        drip.y = y;
      }
      if (drip.y > state.height) drip.done = true;
    }
    state.drips = state.drips.filter(d => !d.done);
    for (const s of state.splashes) {
      s.age += dt; s.vy += settings.splashGravity * dt;
      const x = s.x + s.vx * dt, y = s.y + s.vy * dt;
      if (readMask(state.mask, x, y) >= .35) s.age = s.life;
      else { s.x = x; s.y = y; }
    }
    state.splashes = state.splashes.filter(s => s.age < s.life);
  }
  function render() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, state.width, state.height);
    ctx.lineCap = 'round'; ctx.lineWidth = .8;
    for (const drop of state.drops) {
      ctx.strokeStyle = `rgba(205,222,232,${drop.alpha})`;
      ctx.beginPath(); ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - (drop.vx || settings.breeze) / drop.speed * drop.length, drop.y - drop.length); ctx.stroke();
    }
    for (const drip of state.drips) {
      if (drip.delay > 0) continue;
      ctx.strokeStyle = `rgba(205,222,232,${drip.alpha})`;
      ctx.beginPath(); ctx.moveTo(drip.x, drip.y);
      ctx.lineTo(drip.x, Math.max(drip.startY, drip.y - drip.length)); ctx.stroke();
    }
    for (const s of state.splashes) {
      const fade = (1 - s.age / s.life) ** 1.4;
      ctx.fillStyle = `rgba(216,233,241,${s.alpha * fade})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
    }
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    if (w === state.width && h === state.height && canvas.width > 1) return;
    state.width = w; state.height = h;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.edges = []; state.drops = []; state.drips = []; state.splashes = []; state.key = '';
    updateClock();
    const count = clamp(Math.round(w * h * settings.density), 180, 2200);
    for (let i = 0; i < count; i++) state.drops.push(spawnDrop());
  }
  function frame(now) {
    const dt = Math.min((now - (lastFrame ?? now)) / 1000, .05);
    lastFrame = now;
    if (now >= nextClockCheck) { updateClock(); nextClockCheck = now + 200; }
    step(dt * (state.reduced ? .3 : 1)); render();
    requestAnimationFrame(frame);
  }
  media.addEventListener?.('change', event => { state.reduced = event.matches; });
  document.addEventListener('visibilitychange', () => { lastFrame = undefined; nextClockCheck = 0; });
  new ResizeObserver(resize).observe(canvas);
  resize(); requestAnimationFrame(frame);
})();
