/* A fresh Canvas implementation: flocking, a moving flow field, and a sampled
   text mask. No libraries, external assets, or server are needed. */
(() => {
  'use strict';
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  const mask = document.createElement('canvas');
  mask.width = 1000; mask.height = 320;
  const maskCtx = mask.getContext('2d', { willReadFrequently: true });
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const random = (a, b) => a + Math.random() * (b - a);
  const state = { width: 1, height: 1, birds: [], turbulence: .85, strength: .85, count: 8000,
    targets: [], timeKey: '', elapsed: 0,
    pointer: { x: -1000, y: -1000, active: false }, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
  let lastFrame;
  const grid = { width: 0, height: 0, counts: new Int32Array(0),
    offsets: new Int32Array(0), cursors: new Int32Array(0), items: new Int32Array(0) };
  const inkGroups = [[], [], [], []];
  const inkColors = Array.from({ length: 4 }, (_, tone) => {
    const shade = 38 + tone * 8;
    return `rgba(${shade},${shade + 5},${shade},${.62 + tone * .07})`;
  });
  const eddies = Array.from({ length: 6 }, (_, i) => ({ x: 0, y: 0, spin: i % 2 ? -1 : 1 }));

  function spawnBird() {
    const angle = random(0, TAU);
    return { x: random(0, state.width), y: random(0, state.height),
      vx: Math.cos(angle) * 50, vy: Math.sin(angle) * 50,
      ax: 0, ay: 0, cellX: 0, cellY: 0, size: random(1.1, 2.3), seed: random(0, TAU), target: null,
      shade: Math.floor(random(38, 68)), opacity: random(.55, .9) };
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const oldW = state.width, oldH = state.height;
    state.width = bounds.width; state.height = bounds.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * dpr); canvas.height = Math.round(bounds.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const bird of state.birds) { bird.x *= state.width / oldW; bird.y *= state.height / oldH; }
    state.timeKey = '';
  }

  function setPopulation() {
    while (state.birds.length < state.count) state.birds.push(spawnBird());
    state.birds.length = state.count;
    for (const group of inkGroups) group.length = 0;
    for (const bird of state.birds) inkGroups[Math.min(3, Math.floor((bird.shade - 38) / 8))].push(bird);
    if (grid.items.length !== state.count) grid.items = new Int32Array(state.count);
    state.timeKey = '';
  }

  // Scan a hidden text canvas with nested loops to turn the current time into
  // occupied cells. Birds receive destinations within this shape, not pixels.
  function assignTargets(timeText) {
    maskCtx.clearRect(0, 0, mask.width, mask.height);
    maskCtx.fillStyle = '#000';
    maskCtx.font = '600 280px Arial, Helvetica, sans-serif';
    maskCtx.textAlign = 'center'; maskCtx.textBaseline = 'middle';
    maskCtx.fillText(timeText, 500, 170);
    const data = maskCtx.getImageData(0, 0, mask.width, mask.height).data;
    const candidates = [];
    let minX = 1000, maxX = 0, minY = 320, maxY = 0;
    for (let y = 0; y < 320; y += 3) {
      for (let x = 0; x < 1000; x += 3) {
        if (data[(y * 1000 + x) * 4 + 3] > 180) {
          candidates.push({ x, y });
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    const scale = Math.min(state.width * .82 / (maxX - minX), state.height * .43 / (maxY - minY));
    // A shuffled sample fills strokes rather than arranging birds into a rigid grid.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const count = Math.floor(state.count * .32);
    state.targets = Array.from({ length: count }, (_, i) => {
      const point = candidates[i % candidates.length];
      return { x: state.width / 2 + (point.x + random(-1, 1) - (minX + maxX) / 2) * scale,
        y: state.height * .48 + (point.y + random(-1, 1) - (minY + maxY) / 2) * scale };
    });
    const remaining = [...state.targets];
    for (let i = 0; i < state.birds.length; i++) {
      const bird = state.birds[i];
      if (i >= count) { bird.target = null; continue; }
      // Greedy nearest assignment limits unnecessary crisscrossing during arrival.
      let closest = 0, best = Infinity;
      for (let j = 0; j < remaining.length; j++) {
        const dx = remaining[j].x - bird.x, dy = remaining[j].y - bird.y;
        const distance = dx * dx + dy * dy;
        if (distance < best) { best = distance; closest = j; }
      }
      bird.target = remaining[closest];
      remaining[closest] = remaining[remaining.length - 1]; remaining.pop();
    }
    canvas.setAttribute('aria-label', `A flock of birds periodically forming ${timeText}, local time.`);
  }

  function getClock() {
    const date = new Date();
    const hour = date.getHours() % 12 || 12;
    return { seconds: date.getSeconds() + date.getMilliseconds() / 1000,
      text: `${hour}:${String(date.getMinutes()).padStart(2, '0')}` };
  }

  // Eight seconds gathering, 2.5 seconds holding, seven seconds releasing.
  function formationAt(seconds) {
    return smooth(0, 8, seconds) * (1 - smooth(10.5, 17.5, seconds));
  }

  function animateBirds(dt, form) {
    const { birds, width: w, height: h, elapsed: t } = state;
    const cell = 44;
    const gridW = Math.ceil(w / cell), gridH = Math.ceil(h / cell);
    const cells = gridW * gridH;
    // Reuse a packed cell index. Counts/prefix sums preserve bird order while
    // avoiding thousands of short-lived arrays and pushes every frame.
    if (grid.width !== gridW || grid.height !== gridH) {
      grid.width = gridW; grid.height = gridH;
      grid.counts = new Int32Array(cells);
      grid.offsets = new Int32Array(cells + 1);
      grid.cursors = new Int32Array(cells);
    }
    const { counts, offsets, cursors, items } = grid;
    counts.fill(0);
    for (const bird of birds) {
      bird.cellX = clamp(Math.floor(bird.x / cell), 0, gridW - 1);
      bird.cellY = clamp(Math.floor(bird.y / cell), 0, gridH - 1);
      counts[bird.cellY * gridW + bird.cellX]++;
    }
    offsets[0] = 0;
    for (let i = 0; i < cells; i++) offsets[i + 1] = offsets[i] + counts[i];
    cursors.set(offsets.subarray(0, cells));
    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i];
      items[cursors[bird.cellY * gridW + bird.cellX]++] = i;
    }
    eddies[0].x = w * (.28 + .12 * Math.sin(t * .071)); eddies[0].y = h * (.45 + .16 * Math.cos(t * .11));
    eddies[1].x = w * (.73 + .09 * Math.cos(t * .083)); eddies[1].y = h * (.5 + .19 * Math.sin(t * .067));
    eddies[2].x = w * (.48 + .15 * Math.sin(t * .053)); eddies[2].y = h * .68;
    eddies[3].x = w * (.17 + .08 * Math.cos(t * .17)); eddies[3].y = h * .73;
    eddies[4].x = w * .81; eddies[4].y = h * (.27 + .12 * Math.sin(t * .14));
    eddies[5].x = w * (.5 + .2 * Math.cos(t * .09)); eddies[5].y = h * .22;
    const sampleTime = t * 17;
    const inverseEddyRadius = 1 / (w * .3);
    const flutter = (1.7 + (1 - state.strength) * 8) * Math.min(w / 900, 1);
    const spring = 4 + state.strength * 3;
    const maxSpeed = 100 + state.turbulence * 40;
    // Compute accelerations before updating positions: every bird sees the same frame.
    for (const b of birds) {
      const gx = b.cellX, gy = b.cellY;
      const sampleSeed = Math.floor(sampleTime + b.seed * 11);
      let sx = 0, sy = 0, vx = 0, vy = 0, cx = 0, cy = 0, neighbors = 0;
      for (let yy = Math.max(0, gy - 1); yy <= Math.min(gridH - 1, gy + 1); yy++) {
        for (let xx = Math.max(0, gx - 1); xx <= Math.min(gridW - 1, gx + 1); xx++) {
          // Sample each cell evenly, rotating the sample as time passes.
          // Crowded numeral strokes must not cause quadratic neighbor work.
          const cellIndex = yy * gridW + xx;
          const count = counts[cellIndex];
          const stride = Math.max(1, Math.ceil(count / 8));
          const offset = sampleSeed % stride;
          const start = offsets[cellIndex];
          for (let sample = offset; sample < count; sample += stride) {
            const index = items[start + sample];
            const other = birds[index];
            if (other === b) continue;
            const dx = b.x - other.x, dy = b.y - other.y, d2 = dx * dx + dy * dy;
            if (d2 < 44 * 44) {
              vx += other.vx; vy += other.vy; cx += other.x; cy += other.y; neighbors++;
              if (d2 < 14 * 14 && d2 > .01) { sx += dx / d2; sy += dy / d2; }
            }
          }
        }
      }
      const angle = Math.sin(b.x / w * 8 + t * .23) * 2 + Math.cos(b.y / h * 7 - t * .19) * 1.7 + Math.sin(t * .7 + b.seed) * .8;
      let ax = Math.cos(angle) * 38 * state.turbulence, ay = Math.sin(angle) * 38 * state.turbulence;
      for (const e of eddies) {
        const dx = b.x - e.x, dy = b.y - e.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const influence = 1 / (1 + distance * inverseEddyRadius);
        ax += (-dy / distance * e.spin * 27 - dx / distance * 8) * influence;
        ay += (dx / distance * e.spin * 27 - dy / distance * 8) * influence;
      }
      ax += (w * .5 - b.x) * .014; ay += (h * .48 - b.y) * .03;
      if (neighbors) {
        ax += (vx / neighbors - b.vx) * .35 + (cx / neighbors - b.x) * .08;
        ay += (vy / neighbors - b.vy) * .35 + (cy / neighbors - b.y) * .08;
      }
      ax += clamp(sx * 45, -65, 65); ay += clamp(sy * 45, -65, 65);
      if (b.x < 35) ax += (35 - b.x) * 1.2;
      if (b.x > w - 35) ax -= (b.x - w + 35) * 1.2;
      if (b.y < 45) ay += (45 - b.y) * 1.2;
      if (b.y > h - 55) ay -= (b.y - h + 55) * 1.2;
      if (b.target && form > 0) {
        const tx = b.target.x + Math.sin(t * 1.8 + b.seed) * flutter;
        const ty = b.target.y + Math.cos(t * 1.5 + b.seed * 2) * flutter;
        ax = ax * (1 - form * .94) + ((tx - b.x) * spring - b.vx * 4.5) * form;
        ay = ay * (1 - form * .94) + ((ty - b.y) * spring - b.vy * 4.5) * form;
      }
      if (state.pointer.active) {
        const dx = b.x - state.pointer.x, dy = b.y - state.pointer.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 90 && d > 0) { const force = (1 - d / 90) * 100; ax += dx / d * force; ay += dy / d * force; }
      }
      b.ax = ax; b.ay = ay;
    }
    for (const b of birds) {
      b.vx += b.ax * dt; b.vy += b.ay * dt;
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed > maxSpeed) { b.vx *= maxSpeed / speed; b.vy *= maxSpeed / speed; }
      const free = b.target ? 1 - form : 1;
      if (speed < 28 * free && speed > .01) { const gain = 1 + dt; b.vx *= gain; b.vy *= gain; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      // Safety net after resize or an unusually large force; ordinary flight turns at edges.
      b.x = clamp(b.x, -15, w + 15); b.y = clamp(b.y, -15, h + 15);
    }
  }

  function render() {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, state.width, state.height);
    // Batch triangle paths into four ink tones instead of changing the Canvas
    // transform and issuing a fill for every single bird.
    for (let tone = 0; tone < 4; tone++) {
      ctx.fillStyle = inkColors[tone];
      ctx.beginPath();
      for (const b of inkGroups[tone]) {
        // Normalize velocity directly; avoid atan2 + sin + cos per triangle.
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        const scale = speed > 0 ? b.size / speed : 0;
        const dx = speed > 0 ? b.vx * scale : b.size;
        const dy = b.vy * scale;
        ctx.moveTo(b.x + dx * 2, b.y + dy * 2);
        ctx.lineTo(b.x - dx + dy, b.y - dy - dx);
        ctx.lineTo(b.x - dx - dy, b.y - dy + dx);
        ctx.closePath();
      }
      ctx.fill();
    }
  }

  function frame(now) {
    const dt = Math.min((now - (lastFrame ?? now)) / 1000, .04);
    lastFrame = now;
    const clock = getClock();
    if (clock.text !== state.timeKey) { assignTargets(clock.text); state.timeKey = clock.text; }
    const motion = state.reduced ? .45 : 1;
    state.elapsed += dt * motion;
    animateBirds(dt * motion, formationAt(clock.seconds));
    render();
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointermove', event => { if (event.pointerType === 'touch') return; const rect = canvas.getBoundingClientRect(); state.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, active: true }; });
  canvas.addEventListener('pointerleave', () => { state.pointer.active = false; });
  document.addEventListener('visibilitychange', () => { lastFrame = undefined; });
  new ResizeObserver(resize).observe(canvas);
  resize(); setPopulation(); requestAnimationFrame(frame);
})();
