/* Falling Ash. Drifting flakes land in a cellular sand bed on invisible numerals. */
(() => {
  'use strict';
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  // Distances use CSS pixels; rates and durations use simulation seconds.
  const settings = Object.freeze({
    particles: 8000, gridCell: 2, sandHz: 12, physicsHz: 60,
    interiorSupply: .12, gravity: 32, margin: 26,
    windWaitMin: 14, windWaitMax: 28, windDurationMin: 6, windDurationMax: 10,
    windStrength: .85, windErosion: .08, windResidue: 3
  });
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const state = {
    width: 1, height: 1, flakes: [], elapsed: 0, key: '', mask: null,
    cols: 0, rows: 0, sand: null, solid: null, interiorSources: [], interiorEntries: 0,
    sandAccumulator: 0, sandTick: 0, gridMoves: 0, detachments: 0,
    wind: null, windWait: rand(8, 16), windCount: 0, windDirection: 1,
    reduced: media.matches
  };
  const inks = ['rgba(255,255,255,.28)', 'rgba(255,255,255,.40)', 'rgba(255,255,255,.53)', 'rgba(255,255,255,.65)'];
  const groups = [[], [], [], []];
  let lastFrame, accumulator = 0, nextClockCheck = 0;
  const windSample = { x: 0, y: 0 };
  function clockText(date = new Date()) {
    return `${date.getHours() % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  function makeMask(text) {
    const image = document.createElement('canvas');
    // A low-resolution, softly filtered mask defines the solid clock surfaces and
    // is much cheaper to sample than reading pixels from the visible canvas.
    image.width = Math.max(1, Math.ceil(state.width / 3));
    image.height = Math.max(1, Math.ceil(state.height / 3));
    const pen = image.getContext('2d', { willReadFrequently: true });
    const fontSize = Math.min(image.height * .43, image.width * .79 / (text.length * .57));
    pen.font = `600 ${fontSize}px Arial, Helvetica, sans-serif`;
    pen.textAlign = 'center';
    pen.textBaseline = 'alphabetic';
    const metrics = pen.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent || fontSize * .73;
    const descent = metrics.actualBoundingBoxDescent || fontSize * .02;
    pen.fillStyle = '#000';
    pen.filter = 'blur(1.3px)';
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
  function advanceWind(dt) {
    if (state.wind) {
      state.wind.age += dt;
      if (state.wind.age >= state.wind.duration) {
        state.wind = null;
        state.windWait = rand(settings.windWaitMin, settings.windWaitMax);
      }
      return;
    }
    state.windWait -= dt;
    if (state.windWait > 0 || settings.windStrength <= 0) return;
    const kind = Math.random() < .5 ? 'gust' : 'eddy';
    const duration = rand(settings.windDurationMin, settings.windDurationMax);
    // Successive packets usually follow the same larger airflow. Circulation
    // within a packet can turn either way independently of its travel direction.
    if (state.windCount === 0 || Math.random() < .15) state.windDirection = Math.random() < .5 ? -1 : 1;
    const travel = state.windDirection;
    // Broad fronts scale with both viewport dimensions, so a wide display
    // does not reduce the wind to a small circular patch.
    const rx = state.width * rand(.65, .85);
    state.wind = {
      kind, age: 0, duration,
      x: travel > 0 ? -rx : state.width + rx,
      y: rand(.35, .65) * state.height,
      rx, ry: state.height * rand(.95, 1.25),
      strength: rand(38, 105) * settings.windStrength,
      direction: kind === 'gust' ? travel : (Math.random() < .5 ? -1 : 1),
      travel, tilt: rand(-.08, .08),
      driftX: travel * (state.width + rx * 2) / duration,
      driftY: rand(-.04, .04) * state.height / duration,
      meander: rand(.025, .065) * state.height,
      phase: rand(0, TAU), shear: rand(.08, .2)
    };
    state.windCount++;
  }

  function windFrame(wind) {
    const frame = wind.frame || (wind.frame = {});
    if (frame.age === wind.age) return frame;
    const progress = clamp(wind.age / wind.duration, 0, 1);
    const phase = wind.phase || 0, shear = wind.shear || 0;
    const ease = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
    frame.age = wind.age;
    frame.centerX = wind.x + wind.driftX * wind.age;
    frame.centerY = wind.y + wind.driftY * wind.age
      + (wind.meander || 0) * (Math.sin(phase + progress * TAU) - Math.sin(phase));
    frame.invRx = 1 / wind.rx; frame.invRy = 1 / wind.ry;
    frame.shear = shear * Math.sin(phase + progress * 4);
    frame.pulse = ease(progress / .12) * ease((1 - progress) / .12);
    frame.surge = 1 + shear * Math.sin(phase + progress * 9);
    frame.tilt = shear * .4 * Math.sin(phase + progress * 5);
    return frame;
  }

  function windAt(x, y, out = { x: 0, y: 0 }) {
    out.x = 0; out.y = 0;
    const wind = state.wind;
    if (!wind) return out;
    // The scene uses broad mean flow plus modest, correlated disturbances.
    // Frame coefficients are shared by all flakes; no per-flake trig or grid
    // solver is needed to produce a coherent traveling gust.
    const frame = windFrame(wind);
    const dy = (y - frame.centerY) * frame.invRy;
    const dx = (x - frame.centerX) * frame.invRx - frame.shear * dy;
    const r2 = dx * dx + dy * dy;
    if (r2 >= 1) return out;
    const envelope = 1 - r2;
    const force = wind.strength * frame.pulse * envelope * envelope
      * (frame.surge + (wind.shear || 0) * .15 * dy);
    if (wind.kind === 'eddy') {
      out.x = ((wind.travel || 1) - dy * wind.direction * .35) * force;
      out.y = (wind.tilt + dx * wind.direction * .32) * force;
    } else {
      out.x = wind.direction * force;
      out.y = (wind.tilt + frame.tilt + (wind.shear || 0) * .04 * dx) * force;
    }
    return out;
  }

  function cellAt(x, y) {
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return -1;
    return Math.floor(y / settings.gridCell) * state.cols + Math.floor(x / settings.gridCell);
  }
  function free(cell) { return cell >= 0 && cell < state.sand.length && !state.solid[cell] && !state.sand[cell]; }
  function glyphAt(mask, x) {
    return mask.glyphs.reduce((best, g) => !best || Math.abs(x - (g.left + g.right) / 2)
      < Math.abs(x - (best.left + best.right) / 2) ? g : best, null);
  }
  function buildGrid() {
    const size = settings.gridCell;
    state.cols = Math.ceil(state.width / size); state.rows = Math.ceil(state.height / size);
    const count = state.cols * state.rows;
    state.sand = new Int32Array(count); // particle ID + 1; zero means empty
    state.solid = new Uint8Array(count); // glyph slot + 1; zero means air
    state.interiorSources = []; state.sandAccumulator = 0;
    for (let col = 0; col < state.cols; col++) {
      const x = Math.min(state.width - .01, (col + .5) * size);
      const glyph = glyphAt(state.mask, x);
      let previous = 0, roof = -1, roofOwner = 0;
      for (let row = 0; row < state.rows; row++) {
        const cell = row * state.cols + col;
        const solid = readMask(state.mask, x, (row + .5) * size) >= .35 ? glyph.slot + 1 : 0;
        state.solid[cell] = solid;
        if (previous && !solid) { roof = row; roofOwner = previous; }
        if (!previous && solid && roof >= 0) {
          if (solid === roofOwner && row - roof >= 5) state.interiorSources.push((roof + 1) * state.cols + col);
          roof = -1;
        }
        previous = solid;
      }
    }
  }
  function put(flake, cell, owner) {
    if (!free(cell)) return false;
    state.sand[cell] = flake.id + 1; flake.cell = cell;
    flake.mode = 'settled'; flake.owner = owner;
    flake.passThrough = false; flake.ignoreGlyph = null;
    flake.x = (cell % state.cols + .5) * settings.gridCell;
    flake.y = (Math.floor(cell / state.cols) + .5) * settings.gridCell;
    flake.sandX = flake.x; flake.sandY = flake.y;
    flake.restAngle = flake.rotation + state.elapsed * flake.spin;
    flake.restPhase = state.elapsed * .9 + flake.flutterPhase;
    flake.restFlutter = .35 + .65 * Math.abs(Math.sin(flake.restPhase));
    flake.vx = 0; flake.vy = 0; flake.sandVX = 0; flake.sandVY = 0; flake.erosion = 0;
    return true;
  }
  function release(flake, vx = 0, vy = 3, passThrough = false) {
    if (flake.mode === 'settled') {
      // Resume tumbling from the resting pose, with no orientation/width jump.
      flake.rotation = flake.restAngle - state.elapsed * flake.spin;
      flake.flutterPhase = flake.restPhase - state.elapsed * .9;
    }
    if (flake.cell >= 0 && state.sand[flake.cell] === flake.id + 1) state.sand[flake.cell] = 0;
    flake.cell = -1; flake.mode = 'falling'; flake.vx = vx; flake.vy = vy;
    flake.passThrough = passThrough; flake.ignoreGlyph = null; flake.erosion = 0;
    flake.previousX = flake.x; flake.previousY = flake.y;
  }
  function updateClock() {
    const text = clockText();
    if (text === state.key) return;
    const previous = state.mask;
    state.mask = makeMask(text); state.key = text;
    buildGrid();
    for (const flake of state.flakes) {
      if (flake.mode !== 'settled') continue;
      // The old grid was discarded. Never clear a cell in the new grid while
      // releasing an old deposit, even if those numeric cell indices coincide.
      flake.cell = -1;
      const before = previous?.glyphs.find(g => g.slot === flake.owner);
      const after = state.mask.glyphs.find(g => g.slot === flake.owner);
      if (!before || !after || before.char !== after.char) { release(flake, rand(-12, 12), 3, true); continue; }
      const relativeX = (flake.x - before.left) / Math.max(1, before.right - before.left);
      flake.x = after.left + relativeX * (after.right - after.left);
      const cell = cellAt(flake.x, flake.y);
      if (!put(flake, cell, flake.owner)) release(flake, 0, 3);
      flake.previousX = flake.x; flake.previousY = flake.y;
    }
    for (const flake of state.flakes) {
      if (flake.mode !== 'falling' || flake.passThrough) continue;
      const cell = cellAt(flake.x, flake.y);
      if (cell >= 0 && state.solid[cell]) recycle(flake);
    }
    canvas.setAttribute('aria-label', `Falling ash collecting on the outer and interior ledges of ${text}, local time, and settling in small avalanches.`);
  }
  function spawnFlake() {
    let x, y;
    do { x = rand(0, state.width); y = rand(0, state.height); }
    while (state.solid[cellAt(x, y)] || readMask(state.mask, x, y) >= .1);
    const flake = {
      id: state.flakes.length, x, y, previousX: x, previousY: y, sandX: x, sandY: y,
      cell: -1, owner: null, erosion: 0,
      speed: rand(24, 54), size: rand(.65, 2.15), rotation: rand(0, TAU), spin: rand(-.65, .65),
      outline: Array.from({ length: 5 }, (_, i) => {
        const angle = i / 5 * TAU + rand(-.2, .2), radius = rand(.55, 1);
        return [Math.cos(angle) * radius, Math.sin(angle) * radius];
      }), seed: rand(0, TAU), tone: Math.floor(rand(0, 4)),
      mode: 'falling', passThrough: false, ignoreGlyph: null, vx: rand(-3, 3), vy: 0
    };
    flake.flutterPhase = flake.seed;
    flake.sandVX = 0; flake.sandVY = 0;
    // Derive stable visual offsets from the existing seed so appearance does
    // not consume random numbers used by the physics. Keep them through flight,
    // landing, grid moves, and recycling; cell ownership uses unshifted x/y.
    const jitter = value => (value - Math.floor(value) - .5) * settings.gridCell * .6;
    flake.offsetX = jitter(Math.sin(flake.seed * 127.1) * 43758.5453);
    flake.offsetY = jitter(Math.sin(flake.seed * 311.7) * 19642.3491);
    flake.vy = flake.speed;
    return flake;
  }
  function enterInterior(flake) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const cell = state.interiorSources[Math.floor(rand(0, state.interiorSources.length))];
      if (cell === undefined || !free(cell) || !free(cell + state.cols) || !free(cell + 2 * state.cols)) continue;
      flake.x = (cell % state.cols + .5) * settings.gridCell;
      flake.y = (Math.floor(cell / state.cols) + .5) * settings.gridCell;
      release(flake, rand(-3, 3), 3); state.interiorEntries++;
      return true;
    }
    return false;
  }
  function recycle(flake) {
    if (!flake.passThrough && state.interiorSources.length && Math.random() < settings.interiorSupply && enterInterior(flake)) return;
    const wind = state.wind;
    const vx = wind ? (wind.travel || wind.direction) * wind.strength * windFrame(wind).pulse : 0;
    const sideFlux = Math.abs(vx) * state.height, topFlux = flake.speed * state.width;
    const sideEntry = sideFlux > 0 && Math.random() < sideFlux / (sideFlux + topFlux);
    release(flake, sideEntry ? vx : rand(-3, 3), flake.speed);
    flake.x = sideEntry ? (vx > 0 ? -flake.size * 2 : state.width + flake.size * 2) : rand(0, state.width);
    flake.y = sideEntry ? rand(0, state.height) : -settings.margin;
    flake.previousX = flake.x; flake.previousY = flake.y;
  }
  function sandStep() {
    const { cols, rows, flakes, sand } = state;
    const reverse = (++state.sandTick & 1) === 0;
    // In-place claims resolve collisions immediately. Each particle is visited
    // once, so no destination conflicts, overwritten grains, or repeated moves.
    // Only particles are visited: empty cells are never scanned during settling.
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[reverse ? flakes.length - 1 - i : i];
      if (f.mode !== 'settled') continue;
      f.sandX = f.x; f.sandY = f.y;
      const col = f.cell % cols, row = Math.floor(f.cell / cols), below = f.cell + cols;
      // Last tick's interpolated movement has now reached this cell. Release
      // here, before another grid move, preserving both position and velocity.
      if (row + 1 >= rows || (free(below) && (below + cols >= sand.length || free(below + cols)))) {
        release(f, f.sandVX, f.sandVY); state.detachments++; continue;
      }
      let target = -1, direction = 0;
      if (free(below)) target = below;
      else {
        const first = Math.random() < .5 ? -1 : 1;
        for (let side = 0; side < 2; side++) {
          const dir = side === 0 ? first : -first;
          if (col + dir < 0 || col + dir >= cols) continue;
          const diagonal = below + dir;
          // Do not cut through a solid corner of a numeral. Other grains can
          // slide past one another, but an overhanging solid roof stays solid.
          if (free(diagonal) && !state.solid[f.cell + dir]) { target = diagonal; direction = dir; break; }
        }
      }
      if (target < 0) { f.sandVX = 0; f.sandVY = 0; continue; }
      sand[f.cell] = 0; sand[target] = f.id + 1; f.cell = target;
      f.x = (target % cols + .5) * settings.gridCell;
      f.y = (Math.floor(target / cols) + .5) * settings.gridCell;
      state.gridMoves++;
      f.sandVX = direction * settings.gridCell * settings.sandHz;
      f.sandVY = settings.gridCell * settings.sandHz;
    }
  }
  function erodeSand(dt) {
    if (!state.wind) return;
    const { cols, sand, solid } = state;
    for (const f of state.flakes) {
      if (f.mode !== 'settled') continue;
      const above = f.cell - cols, below = f.cell + cols;
      // Only exposed grains erode. A layer directly on the numeral remains.
      let residue = false;
      for (let n = 1; n <= Math.ceil(settings.windResidue / settings.gridCell); n++) {
        if (solid[f.cell + n * cols]) { residue = true; break; }
      }
      if ((above >= 0 && (sand[above] || solid[above])) || below >= solid.length || residue) { f.erosion = 0; continue; }
      const field = windAt(f.x, f.y, windSample);
      f.erosion += Math.max(0, Math.hypot(field.x, Math.min(0, field.y)) - 22) * settings.windErosion * dt;
      if (f.erosion >= 1) {
        const owner = f.owner;
        release(f, field.x * .75, Math.min(-10, field.y * .7 - 12));
        f.ignoreGlyph = owner;
      }
    }
  }
  function blocked(cell, flake) {
    return cell >= 0 && !flake.passThrough && ((state.solid[cell] && state.solid[cell] - 1 !== flake.ignoreGlyph)
      || state.sand[cell]);
  }
  function moveAir(flake, dt, response, settling) {
    const occupied = cellAt(flake.x, flake.y);
    if (!flake.passThrough && occupied >= 0 && state.sand[occupied]) {
      // Several airborne flakes can share a point before either lands. Resolve
      // that compression locally instead of leaving a second flake trapped in
      // a cell that the first flake has just claimed. Adjustment is <= one cell.
      const owner = state.flakes[state.sand[occupied] - 1].owner;
      const col = occupied % state.cols;
      for (const cell of [occupied - state.cols, col > 0 ? occupied - 1 : -1,
        col + 1 < state.cols ? occupied + 1 : -1]) {
        if (free(cell) && put(flake, cell, owner)) return;
      }
      const above = occupied - state.cols;
      if (above >= 0 && !state.solid[above]) flake.y -= settings.gridCell;
      return;
    }
    const t = state.elapsed;
    const wind = Math.sin(flake.y / 190 - t * .22) * 5 + Math.cos(flake.x / 280 + t * .16) * 3 + Math.sin(t * .7 + flake.seed) * 4;
    const event = windAt(flake.x, flake.y, windSample);
    flake.vx += (wind + event.x - flake.vx) * response;
    flake.vy = clamp(flake.vy + (flake.speed + (flake.passThrough ? 0 : event.y) - flake.vy) * settling, -80, flake.speed + 60);
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(flake.vx), Math.abs(flake.vy)) * dt / (settings.gridCell * .45)));
    for (let i = 0; i < steps; i++) {
      const x = flake.x + flake.vx * dt / steps, y = flake.y + flake.vy * dt / steps;
      const target = cellAt(x, y);
      if (!blocked(target, flake)) { flake.x = x; flake.y = y; continue; }
      const current = cellAt(flake.x, flake.y);
      // A downward crossing lands in the immediately preceding empty cell;
      // side contacts merely deflect and never snap to a distant pile crest.
      if (flake.vy >= 0 && current >= 0 && target >= 0 && Math.floor(target / state.cols) > Math.floor(current / state.cols)) {
        const owner = state.solid[target] ? state.solid[target] - 1 : state.flakes[state.sand[target] - 1].owner;
        if (put(flake, current, owner)) break;
      }
      if (flake.vy < 0) flake.vy = Math.abs(flake.vy) * .2;
      flake.vx *= -.35;
      // Let a grain continue vertically along a side wall if that cell is air.
      if (!blocked(cellAt(flake.x, y), flake)) flake.y = y;
      break;
    }
    if (flake.mode === 'settled') return;
    const span = state.width + settings.margin * 2;
    if (flake.x < -settings.margin) { flake.x += span; flake.previousX = flake.x; }
    else if (flake.x > state.width + settings.margin) { flake.x -= span; flake.previousX = flake.x; }
    if (flake.y < -settings.margin || flake.y > state.height + settings.margin) recycle(flake);
  }
  function step(dt) {
    state.elapsed += dt; advanceWind(dt);
    erodeSand(dt);
    const response = 1 - Math.exp(-dt * 1.4), settling = 1 - Math.exp(-dt * settings.gravity / 36);
    for (const f of state.flakes) {
      f.previousX = f.x; f.previousY = f.y;
      if (f.mode === 'falling') moveAir(f, dt, response, settling);
    }
    state.sandAccumulator += dt;
    const interval = 1 / settings.sandHz;
    while (state.sandAccumulator + 1e-10 >= interval) { state.sandAccumulator -= interval; sandStep(); }
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(), w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    if (w === state.width && h === state.height && canvas.width > 1) return;
    const oldW = state.width, oldH = state.height;
    state.width = w; state.height = h;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // A resize starts a fresh airborne scene instead of remapping piles into
    // solid strokes or overlapping cells at a different aspect ratio.
    for (const f of state.flakes) {
      f.cell = -1; f.mode = 'falling'; f.x *= w / oldW; f.y *= h / oldH;
      f.passThrough = false; f.ignoreGlyph = null; f.vx = 0; f.vy = f.speed;
      f.previousX = f.x; f.previousY = f.y;
    }
    state.key = ''; updateClock(); accumulator = 0; lastFrame = undefined;
  }
  function render(alpha = 1) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, state.width, state.height);
    const sandAlpha = clamp((state.sandAccumulator + alpha / settings.physicsHz) * settings.sandHz, 0, 1);
    for (let tone = 0; tone < 4; tone++) {
      ctx.fillStyle = inks[tone]; ctx.beginPath();
      for (const flake of groups[tone]) {
        const resting = flake.mode === 'settled';
        const angle = resting ? flake.restAngle : flake.rotation + state.elapsed * flake.spin;
        const c = Math.cos(angle), s = Math.sin(angle);
        const flutter = resting ? flake.restFlutter : .35 + .65 * Math.abs(Math.sin(state.elapsed * .9 + flake.flutterPhase));
        const px = resting ? flake.sandX : flake.previousX, py = resting ? flake.sandY : flake.previousY;
        const mix = resting ? sandAlpha : alpha;
        const cx = px + (flake.x - px) * mix + flake.offsetX;
        const cy = py + (flake.y - py) * mix + flake.offsetY;
        const size = flake.size;
        for (let i = 0; i < flake.outline.length; i++) {
          const [ox, oy] = flake.outline[i], x = ox * size * flutter, y = oy * size;
          const screenX = cx + x * c - y * s, screenY = cy + x * s + y * c;
          if (i === 0) ctx.moveTo(screenX, screenY); else ctx.lineTo(screenX, screenY);
        }
        ctx.closePath();
      }
      ctx.fill();
    }
  }
  function frame(now) {
    const dt = Math.min(Math.max(0, (now - (lastFrame ?? now)) / 1000), .1);
    lastFrame = now;
    if (now >= nextClockCheck) { updateClock(); nextClockCheck = now + 200; }
    accumulator += dt * (state.reduced ? .45 : 1);
    const interval = 1 / settings.physicsHz;
    while (accumulator + 1e-10 >= interval) { step(interval); accumulator -= interval; }
    render(clamp(accumulator / interval, 0, 1)); requestAnimationFrame(frame);
  }
  media.addEventListener?.('change', event => { state.reduced = event.matches; });
  document.addEventListener('visibilitychange', () => { lastFrame = undefined; accumulator = 0; nextClockCheck = 0; });
  new ResizeObserver(resize).observe(canvas);
  resize();
  for (let i = 0; i < settings.particles; i++) {
    const flake = spawnFlake(); state.flakes.push(flake); groups[flake.tone].push(flake);
  }
  requestAnimationFrame(frame);
})();
