/* Falling Ash. Ash builds on invisible clock surfaces and sheds in small slides. */
(() => {
  'use strict';
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  /* Edit these settings, then reload.
     particles: Total flakes, including deposited ash.
     pileDepth: Depth at an exposed edge before the upper layer sloughs off.
     reposeSlope: Stable mound slope (rise/run); .75 is roughly 37 degrees.
     sloughFraction: Upper fraction released from an overloaded edge.
     gravity: Acceleration of shed ash toward its normal falling speed.
     surfaceCell: Spacing of samples along the continuous pile surface.
     margin: Offscreen padding for flake re-entry and horizontal wrapping.
     windWaitMin/Max: Quiet seconds between wind events, in simulation time.
     windDurationMin/Max: Duration of each event, in simulation seconds.
     windStrength: Multiplier for gust and eddy intensity; 0 disables wind events.
     windErosion: Rate at which strong local wind removes exposed pile grains.
     windResidue: Thin settled layer retained during wind erosion, in CSS pixels.
  */
  const settings = Object.freeze({
    particles: 8000,
    pileDepth: 42,
    reposeSlope: .75,
    sloughFraction: .18,
    gravity: 32,
    surfaceCell: 4,
    margin: 26,
    windWaitMin: 14,
    windWaitMax: 28,
    windDurationMin: 6,
    windDurationMax: 10,
    windStrength: .85,
    windErosion: .08,
    windResidue: 3
  });
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const state = {
    width: 1, height: 1, flakes: [], elapsed: 0, key: '', mask: null,
    surfaces: [], columns: [], dirtySurfaces: new Set(), shedCount: 0,
    wind: null, windWait: rand(8, 16), windCount: 0, windDirection: 1,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches
  };
  const inks = ['rgba(255,255,255,.28)', 'rgba(255,255,255,.40)', 'rgba(255,255,255,.53)', 'rgba(255,255,255,.65)'];
  const groups = [[], [], [], []];
  let lastFrame;
  let nextClockCheck = 0;
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
  // Each solid vertical run contributes an upward-facing shelf, including
  // the lower inside edge of a hole in a numeral such as 0, 6, 8, or 9.
  function buildSurfaces() {
    const old = state.surfaces;
    state.dirtySurfaces.clear();
    state.surfaces = [];
    state.columns = Array.from({ length: Math.ceil(state.width / settings.surfaceCell) }, () => []);
    const mask = state.mask;
    const scaleY = state.height / mask.height;
    for (let col = 0; col < state.columns.length; col++) {
      const x = (col + .5) * settings.surfaceCell;
      const mx = Math.min(mask.width - 1, Math.floor(x / state.width * mask.width));
      let shelf = null;
      for (let row = 0; row <= mask.height; row++) {
        const solid = row < mask.height && mask.values[row * mask.width + mx] >= .35;
        if (solid && !shelf) {
          shelf = { col, x, y: row * scaleY, bottom: 0, stack: [], depth: 0,
            cooldown: 0, flowWait: 0, erosion: 0, left: null, right: null, sequence: 0,
            glyph: mask.glyphs.reduce((best, g) => !best || Math.abs(x - (g.left + g.right) / 2)
              < Math.abs(x - (best.left + best.right) / 2) ? g : best, null) };
          state.columns[col].push(shelf);
          state.surfaces.push(shelf);
        } else if (!solid && shelf) {
          shelf.bottom = row * scaleY;
          shelf = null;
        }
      }
    }
    // Connect matching solid runs, not merely shelves within a fixed height
    // difference. Mutual matches keep the floor of a hole separate from its roof.
    // Cache this topology only when the clock or viewport changes.
    const candidates = (surface, direction) => {
      const column = state.columns[surface.col + direction];
      if (!column) return null;
      let best = null;
      for (const other of column) {
        if (Math.min(other.bottom, surface.bottom) <= Math.max(other.y, surface.y)) continue;
        if (!best || Math.abs(other.y - surface.y) < Math.abs(best.y - surface.y)) best = other;
      }
      return best;
    };
    for (const surface of state.surfaces) {
      const right = candidates(surface, 1);
      if (right && candidates(right, -1) === surface) { surface.right = right; right.left = surface; }
    }
    // Reset the entire changed digit, including edges shared by both shapes.
    // Unchanged digits keep their deposits, even if the text shifts sideways.
    for (const surface of old) {
      const glyph = mask.glyphs.find(g => g.slot === surface.glyph.slot);
      const changed = !glyph || glyph.char !== surface.glyph.char;
      const relativeX = (surface.x - surface.glyph.left) / Math.max(1, surface.glyph.right - surface.glyph.left);
      const x = glyph ? glyph.left + relativeX * (glyph.right - glyph.left) : surface.x;
      const col = clamp(Math.floor(x / settings.surfaceCell), 0, state.columns.length - 1);
      const replacement = !changed && state.columns[col].find(s => s.glyph.slot === glyph.slot && Math.abs(s.y - surface.y) < 4);
      for (const flake of surface.stack) {
        if (replacement) deposit(flake, replacement);
        else release(flake, rand(-12, 12), changed);
      }
    }
    // A newly appearing solid must never contain airborne ash.
    for (const flake of state.flakes) {
      if (flake.mode === 'settled' || flake.passThrough) continue;
      if (flake.mode === 'sliding') {
        const oldGlyph = flake.surface.glyph;
        const glyph = mask.glyphs.find(g => g.slot === oldGlyph.slot);
        if (!glyph || glyph.char !== oldGlyph.char) {
          release(flake, flake.vx, true);
          continue;
        }
      }
      flake.mode = 'falling';
      const column = state.columns[clamp(Math.floor(flake.x / settings.surfaceCell), 0, state.columns.length - 1)];
      const support = column.find(s => s.glyph.slot !== flake.ignoreGlyph && flake.y + flake.size > s.y && flake.y - flake.size < s.bottom);
      if (support) deposit(flake, support);
    }
    updatePileGeometry();
  }
  function updateClock() {
    const text = clockText();
    if (text === state.key) return;
    state.mask = makeMask(text);
    buildSurfaces();
    state.key = text;
    canvas.setAttribute('aria-label', `Falling ash collecting on the upper edges of ${text}, local time, and occasionally sliding off.`);
  }
  function deposit(flake, surface) {
    const wasSliding = flake.mode === 'sliding';
    flake.targetX = undefined;
    flake.mode = 'settled';
    flake.passThrough = false;
    flake.ignoreGlyph = null;
    flake.surface = surface;
    // A grain adds cross-sectional area / sample width, rather than an entire
    // grain's height regardless of how much of the strip it actually occupies.
    flake.thickness = Math.max(.16, flake.size * flake.size * 2.4 / settings.surfaceCell);
    // Distribute packing positions within the grain's footprint. Repeated
    // arrivals at a cell boundary must not become a vertical line of grains.
    const incomingX = clamp(flake.x, surface.x - settings.surfaceCell * .48, surface.x + settings.surfaceCell * .48);
    const packedX = surface.x + (((surface.sequence++ * .61803398875) % 1) - .5) * settings.surfaceCell * .96;
    flake.x = wasSliding ? incomingX : clamp(packedX, incomingX - flake.size, incomingX + flake.size);
    if (!wasSliding && !flake.landing) flake.y = pileHeightAt(surface, incomingX) - flake.size;
    flake.landing = false;
    flake.restAngle = flake.rotation + state.elapsed * flake.spin;
    flake.restFlutter = .35 + .65 * Math.abs(Math.sin(state.elapsed * .9 + flake.seed));
    flake.vx = 0; flake.vy = 0;
    surface.stack.push(flake);
    surface.depth += flake.thickness;
    dirtyPile(surface);
  }
  function release(flake, vx, passThrough = false) {
    flake.targetX = undefined;
    flake.passThrough = passThrough;
    flake.mode = 'falling';
    flake.surface = null;
    flake.vx = vx;
    flake.vy = 3;
  }
  function neighbor(surface, direction) {
    return direction < 0 ? surface.left : surface.right;
  }
  function dirtyPile(surface) {
    state.dirtySurfaces.add(surface);
    if (surface.left) state.dirtySurfaces.add(surface.left);
    if (surface.right) state.dirtySurfaces.add(surface.right);
  }
  function pileHeightAt(surface, x, bare = false) {
    const top = surface.y - (bare ? 0 : surface.depth);
    const next = neighbor(surface, x < surface.x ? -1 : 1);
    if (!next) return top;
    const nextTop = next.y - (bare ? 0 : next.depth);
    // Both sides use exactly the same boundary height. The conservative cap
    // keeps the interpolated ash above the supporting solid on either side.
    const edge = Math.min((top + nextTop) * .5, surface.y, next.y);
    const mix = clamp(Math.abs(x - surface.x) * 2 / settings.surfaceCell, 0, 1);
    return top + (edge - top) * mix;
  }
  function pileSlopeAt(surface, x) {
    const direction = x < surface.x ? -1 : 1;
    const next = neighbor(surface, direction);
    if (!next) return 0;
    const top = surface.y - surface.depth;
    const edge = Math.min((top + next.y - next.depth) * .5, surface.y, next.y);
    return (edge - top) * 2 / (direction * settings.surfaceCell);
  }
  function updatePileGeometry(dt = 1 / 60) {
    // Only strips whose mass or neighboring surface changed need repacking.
    // Each settled grain keeps its horizontal packing position and layer order.
    for (const surface of state.dirtySurfaces) {
      if (!surface.stack.length) { state.dirtySurfaces.delete(surface); continue; }
      let filled = 0;
      let moving = false;
      const topY = surface.y - surface.depth;
      const left = surface.left, right = surface.right;
      const leftBase = left ? Math.min(surface.y, left.y) : surface.y;
      const rightBase = right ? Math.min(surface.y, right.y) : surface.y;
      const leftTop = left ? Math.min((topY + left.y - left.depth) * .5, leftBase) : topY;
      const rightTop = right ? Math.min((topY + right.y - right.depth) * .5, rightBase) : topY;
      const invDepth = 1 / surface.depth;
      for (const flake of surface.stack) {
        filled += flake.thickness;
        if (flake.targetX !== undefined) {
          const distanceX = flake.targetX - flake.x;
          flake.x += clamp(distanceX, -flake.creepSpeed * dt, flake.creepSpeed * dt);
          if (Math.abs(distanceX) > flake.creepSpeed * dt + .001) moving = true;
          else flake.targetX = undefined;
        }
        const mix = Math.min(1, Math.abs(flake.x - surface.x) * 2 / settings.surfaceCell);
        const onLeft = flake.x < surface.x;
        const base = surface.y + ((onLeft ? leftBase : rightBase) - surface.y) * mix;
        const top = topY + ((onLeft ? leftTop : rightTop) - topY) * mix;
        // Layers follow the same neighboring profile as landing and runoff.
        const localDepth = Math.max(0, base - top);
        const targetY = base - localDepth * Math.min(1, filled * invDepth) - flake.size;
        const distance = targetY - flake.y;
        // Packing follows a moving pile gradually; changing mass beside a
        // grain must never teleport it onto a crest or down into a trough.
        flake.y += clamp(distance, -24 * dt, 24 * dt);
        if (Math.abs(distance) > 24 * dt + .001) moving = true;
      }
      if (!moving) state.dirtySurfaces.delete(surface);
    }
  }
  function startSlide(surface, direction) {
    const flake = surface.stack.pop();
    surface.depth = Math.max(0, surface.depth - flake.thickness);
    dirtyPile(surface);
    flake.mode = 'sliding';
    flake.targetX = undefined;
    flake.surface = surface;
    flake.slideAge = 0;
    const next = neighbor(surface, direction);
    const drop = next ? Math.max(0, next.y - next.depth - (surface.y - surface.depth)) : flake.size * 2;
    // Small imbalances creep; steeper failures gain more downhill momentum.
    flake.vx = direction * clamp(Math.sqrt(2 * settings.gravity * drop) * .35, next ? 3 : 10, next ? 10 : 18);
    flake.vy = 0;
    return flake;
  }
  function slide(flake, dt) {
    const direction = Math.sign(flake.vx);
    let support = flake.surface;
    const x = flake.x + flake.vx * dt;
    // Retain one continuous trajectory across the accumulation grid.
    while (Math.abs(x - support.x) > settings.surfaceCell / 2) {
      const next = neighbor(support, direction);
      if (!next) break;
      support = next;
    }
    const next = neighbor(support, x >= support.x ? 1 : -1);
    if (!next && Math.abs(x - support.x) > settings.surfaceCell / 2 + flake.size) {
      const vx = flake.vx, vy = Math.max(3, flake.vy);
      const glyph = support.glyph.slot;
      release(flake, vx);
      flake.ignoreGlyph = glyph;
      flake.x = x;
      flake.vy = vy;
      return;
    }
    const floor = pileHeightAt(support, x) - flake.size;
    const slope = pileSlopeAt(support, x);
    const acceleration = settings.gravity * slope / (1 + slope * slope)
      - direction * settings.gravity * .16;
    const vx = clamp(flake.vx + acceleration * dt, -90, 90);
    flake.slideAge += dt;
    // Kinetic friction slows a runout on level ground; it never stops at each
    // column. Settling happens only once momentum has actually dissipated.
    const oldFloor = pileHeightAt(flake.surface, flake.x) - flake.size;
    if (support !== flake.surface && floor < oldFloor - flake.size * 2) {
      // An uphill obstruction stops the slide at its foot; depositing on the
      // new column would teleport this grain onto the neighboring pile crest.
      deposit(flake, flake.surface);
      return;
    }
    if (vx * direction <= 3 && flake.slideAge > .15) {
      deposit(flake, support);
      return;
    }
    flake.surface = support;
    flake.x = x;
    flake.vx = vx;
    flake.vy = Math.min(100, flake.vy + settings.gravity * dt);
    const y = flake.y + flake.vy * dt;
    if (y >= floor) {
      flake.y = Math.max(floor, flake.y - 40 * dt);
      flake.vy = Math.max(0, slope * flake.vx);
    } else {
      flake.y = y;
    }
  }
  function shed(surface) {
    if (surface.depth < settings.pileDepth || surface.cooldown > 0) return 0;
    // Failure starts only at an exposed lip, never at an arbitrary middle bin.
    const left = neighbor(surface, -1), right = neighbor(surface, 1);
    if (left && right) return 0;
    const direction = !left ? -1 : 1;
    const count = Math.max(1, Math.floor(surface.stack.length * settings.sloughFraction));
    for (let i = 0; i < count; i++) {
      startSlide(surface, direction);
    }
    surface.cooldown = .8;
    state.shedCount++;
    return count;
  }
  function relaxPiles(dt) {
    // Alternating traversal avoids biasing every mound to the same side.
    const reverse = Math.floor(state.elapsed * 60) % 2 === 0;
    for (let i = 0; i < state.surfaces.length; i++) {
      const surface = state.surfaces[reverse ? state.surfaces.length - 1 - i : i];
      surface.cooldown = Math.max(0, surface.cooldown - dt);
      surface.flowWait = Math.max(0, surface.flowWait - dt);
      if (!surface.stack.length || surface.flowWait > 0) continue;
      // Once an exposed lip is excessive, let its upper layer fail outward.
      // Redistributing inward first could indefinitely prevent a real slough.
      if (shed(surface) > 0) { surface.flowWait = .06; continue; }
      const top = surface.y - surface.depth;
      const grain = surface.stack[surface.stack.length - 1];
      let downhill = null, greatestDrop = 0;
      for (const direction of [-1, 1]) {
        const next = neighbor(surface, direction);
        if (!next) continue;
        const drop = next.y - next.depth - top;
        // A small hysteresis avoids chatter without silently turning a 37-degree
        // material into one that supports 52-59-degree steps between samples.
        const stableDrop = settings.surfaceCell * settings.reposeSlope + Math.min(.3, grain.thickness * .2);
        if (drop > stableDrop && drop > greatestDrop) { downhill = next; greatestDrop = drop; }
      }
      if (downhill) {
        // Bounded local transport: larger imbalances mobilize a few top grains
        // rather than waiting the same fixed interval for every single grain.
        const count = Math.min(3, surface.stack.length, Math.max(1, Math.floor(greatestDrop / settings.surfaceCell)));
        for (let j = 0; j < count; j++) {
          const excess = downhill.y - downhill.depth - (surface.y - surface.depth);
          if (excess <= settings.surfaceCell * settings.reposeSlope + .3) break;
          const flake = surface.stack[surface.stack.length - 1];
          if (flake.targetX !== undefined) break;
          // Conservative local area transfer forms the mound. Its visible
          // grain traverses the shared surface continuously; it is not fired
          // ballistically from one independent stack to the next.
          surface.stack.pop();
          surface.depth = Math.max(0, surface.depth - flake.thickness);
          flake.surface = downhill;
          flake.targetX = downhill.x + clamp(flake.x - surface.x, -1.8, 1.8);
          flake.creepSpeed = clamp(24 + excess * 3, 24, 72);
          downhill.stack.push(flake);
          downhill.depth += flake.thickness;
          dirtyPile(surface);
          dirtyPile(downhill);
          downhill.flowWait = Math.max(downhill.flowWait, .08);
        }
        surface.flowWait = .025;
      }
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    if (w === state.width && h === state.height && canvas.width > 1) return;
    const oldW = state.width, oldH = state.height;
    state.width = w; state.height = h;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const flake of state.flakes) { flake.x *= w / oldW; flake.y *= h / oldH; }
    state.mask = null; state.key = '';
    updateClock();
  }

  function spawnFlake() {
    // Begin in open air; no flakes are seeded inside the invisible solids.
    let x, y;
    do { x = rand(0, state.width); y = rand(0, state.height); }
    while (readMask(state.mask, x, y) >= .1
      || state.columns[Math.floor(x / settings.surfaceCell)].some(s => y + 2.15 > s.y && y - 2.15 < s.bottom));
    const flake = {
      x, y, speed: rand(24, 54), size: rand(.65, 2.15),
      rotation: rand(0, TAU), spin: rand(-.65, .65),
      // Each flake keeps its own torn, asymmetric outline throughout its fall.
      outline: Array.from({ length: 5 }, (_, i) => {
        const angle = i / 5 * TAU + rand(-.2, .2);
        const radius = rand(.55, 1);
        return [Math.cos(angle) * radius, Math.sin(angle) * radius];
      }),
      seed: rand(0, TAU), tone: Math.floor(rand(0, 4)),
      mode: 'falling', passThrough: false, surface: null, vx: rand(-3, 3), vy: 0
    };
    flake.vy = flake.speed;
    return flake;
  }

  function recycle(flake) {
    const margin = settings.margin;
    // Wind brings fresh ash through the upwind edge as well as from above.
    // Balance incoming flux by edge length and airflow speed, so the lower
    // upwind sky remains supplied during a long gust.
    const wind = state.wind;
    const vx = wind ? (wind.travel || wind.direction) * wind.strength * windFrame(wind).pulse : 0;
    const sideFlux = Math.abs(vx) * state.height;
    const topFlux = flake.speed * state.width;
    const sideEntry = sideFlux > 0 && Math.random() < sideFlux / (sideFlux + topFlux);
    flake.x = sideEntry ? (vx > 0 ? -flake.size * 2 : state.width + flake.size * 2) : rand(0, state.width);
    flake.y = sideEntry ? rand(0, state.height) : -margin;
    flake.passThrough = false;
    flake.ignoreGlyph = null;
    flake.mode = 'falling';
    flake.surface = null;
    flake.vx = sideEntry ? vx : rand(-3, 3);
    flake.vy = flake.speed;
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

  const windSample = { x: 0, y: 0 };
  const noSurfaces = [];

  function windStress(field) {
    // Crosswinds and updrafts strip ash; a downward current presses it down.
    return Math.hypot(field.x, Math.min(0, field.y));
  }

  function blowLoose(flake, field, glyph) {
    const vx = flake.vx * .3 + field.x * .75;
    release(flake, vx);
    flake.vy = Math.min(-10, field.y * .7 - 12);
    // Loft clear of the source digit instead of catching on its lower ledges.
    flake.ignoreGlyph = glyph;
  }

  function erodePiles(dt) {
    for (const surface of state.surfaces) {
      if (!state.wind || !surface.stack.length) { surface.erosion = 0; continue; }
      const top = surface.stack[surface.stack.length - 1];
      const field = windAt(top.x, top.y, windSample);
      const excess = windStress(field) - 22;
      if (excess <= 0) { surface.erosion = 0; continue; }
      surface.erosion += excess * settings.windErosion * dt;
      // Peel only exposed top grains. Each removal reveals the next layer;
      // the rest of the pile retains both its position and supporting mass.
      while (surface.erosion >= 1 && surface.stack.length
          && surface.depth - surface.stack[surface.stack.length - 1].thickness >= settings.windResidue) {
        const flake = surface.stack.pop();
        surface.depth = Math.max(0, surface.depth - flake.thickness);
        dirtyPile(surface);
        blowLoose(flake, field, surface.glyph.slot);
        surface.erosion -= 1;
      }
      surface.erosion = Math.min(surface.erosion, 1);
    }
  }

  function step(dt) {
    const { flakes, width: w, height: h, elapsed: t } = state;
    advanceWind(dt);
    erodePiles(dt);
    const windResponse = 1 - Math.exp(-dt * 1.4);
    const settlingResponse = 1 - Math.exp(-dt * settings.gravity / 36);
    for (const flake of flakes) {
      if (flake.mode === 'settled') continue;
      if (flake.mode === 'sliding') {
        const field = windAt(flake.x, flake.y, windSample);
        if (windStress(field) > 38) blowLoose(flake, field, flake.surface.glyph.slot);
        else { slide(flake, dt); continue; }
      }
      const wind = Math.sin(flake.y / 190 - t * .22) * 5
        + Math.cos(flake.x / 280 + t * .16) * 3
        + Math.sin(t * .7 + flake.seed) * 4;
      const event = windAt(flake.x, flake.y, windSample);
      flake.vx += (wind + event.x - flake.vx) * windResponse;
      // Ash falls relative to the moving air: vertical wind changes its
      // settling velocity, rather than acting as an accumulating vortex force.
      const settlingSpeed = flake.speed + (flake.passThrough ? 0 : event.y);
      flake.vy = clamp(flake.vy + (settlingSpeed - flake.vy)
        * settlingResponse, -80, flake.speed + 60);
      // Sweep in short increments so small flakes cannot tunnel through a shelf.
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(flake.vx), Math.abs(flake.vy)) * dt / 2));
      for (let i = 0; i < steps; i++) {
        const oldBottom = flake.y + flake.size;
        const nextX = flake.x + flake.vx * dt / steps;
        const nextY = flake.y + flake.vy * dt / steps;
        const col = Math.floor(nextX / settings.surfaceCell);
        const column = flake.passThrough ? noSurfaces : (state.columns[col] || noSurfaces);
        const support = column.find(s => s.glyph.slot !== flake.ignoreGlyph && flake.vy >= 0
          && oldBottom <= pileHeightAt(s, flake.x) + .01
          && nextY + flake.size >= pileHeightAt(s, nextX));
        if (support) {
          // Resolve at the swept position, not the previous position in a
          // different sample. A steep profile must not amplify a 1px step into
          // a many-pixel vertical landing adjustment.
          let lo = 0, hi = 1;
          for (let j = 0; j < 5; j++) {
            const mid = (lo + hi) * .5;
            const x = flake.x + (nextX - flake.x) * mid;
            const bottom = oldBottom + (nextY - flake.y) * mid;
            if (bottom >= pileHeightAt(support, x)) hi = mid;
            else lo = mid;
          }
          flake.x += (nextX - flake.x) * hi;
          flake.y = Math.min(support.y - flake.size, flake.y + (nextY - flake.y) * hi);
          flake.landing = true;
          deposit(flake, support);
          break;
        }
        // Updrafts also collide with the underside of the invisible numerals.
        const ceiling = column.find(s => s.glyph.slot !== flake.ignoreGlyph && flake.vy < 0 && flake.y - flake.size >= s.bottom - .01
          && nextY - flake.size <= s.bottom);
        if (ceiling) {
          flake.y = ceiling.bottom + flake.size;
          flake.vy = Math.abs(flake.vy) * .2;
          break;
        }
        // Side contacts cannot teleport a flake to a distant pile crest.
        const pileContact = column.some(s => s.glyph.slot !== flake.ignoreGlyph && nextY + flake.size > pileHeightAt(s, nextX) && nextY - flake.size < s.bottom);
        if (pileContact) {
          const oldColumn = flake.passThrough ? noSurfaces
            : (state.columns[Math.floor(flake.x / settings.surfaceCell)] || noSurfaces);
          const enclosed = oldColumn.some(s => s.glyph.slot !== flake.ignoreGlyph && oldBottom > pileHeightAt(s, flake.x) && flake.y - flake.size < s.y);
          if (enclosed) {
            const bed = oldColumn.find(s => s.glyph.slot !== flake.ignoreGlyph
              && oldBottom > pileHeightAt(s, flake.x) && flake.y + flake.size <= s.y + .01);
            if (bed) {
              // An evolving mound can grow around a grain. Incorporate it at
              // its current position, then settle the layer without a crest snap.
              flake.mode = 'sliding';
              deposit(flake, bed);
              break;
            }
            // A growing mound can surround an airborne grain. Let it drift
            // sideways out of the ash without sinking through the solid below.
            if (!column.some(s => s.glyph.slot !== flake.ignoreGlyph && nextY + flake.size > s.y && nextY - flake.size < s.bottom)) flake.x = nextX;
            const base = oldColumn.find(s => s.glyph.slot !== flake.ignoreGlyph && oldBottom > s.y && flake.y - flake.size < s.bottom);
            if (base) flake.y = Math.min(flake.y, base.y - flake.size);
            flake.vy = Math.min(0, flake.vy);
          } else {
            flake.vx *= -.4;
            flake.y = nextY;
          }
        } else {
          flake.x = nextX;
          flake.y = nextY;
        }
      }
      if (flake.mode !== 'settled') {
        const span = w + settings.margin * 2;
        if (flake.x < -settings.margin) flake.x += span;
        else if (flake.x > w + settings.margin) flake.x -= span;
        if (flake.y < -settings.margin || flake.y > h + settings.margin) recycle(flake);
      }
    }
    relaxPiles(dt);
    updatePileGeometry(dt);
  }

  function render() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, state.width, state.height);
    for (let tone = 0; tone < 4; tone++) {
      ctx.fillStyle = inks[tone]; ctx.beginPath();
      for (const flake of groups[tone]) {
        // Tumble independently of the direction of travel. The changing
        // narrowness suggests a light flake turning edge-on in the air.
        const angle = flake.mode === 'settled' ? flake.restAngle : flake.rotation + state.elapsed * flake.spin;
        const c = Math.cos(angle), s = Math.sin(angle);
        const flutter = flake.mode === 'settled' ? flake.restFlutter
          : .35 + .65 * Math.abs(Math.sin(state.elapsed * .9 + flake.seed));
        for (let i = 0; i < flake.outline.length; i++) {
          const [px, py] = flake.outline[i];
          const x = px * flake.size * flutter, y = py * flake.size;
          const screenX = flake.x + x * c - y * s;
          const screenY = flake.y + x * s + y * c;
          if (i === 0) ctx.moveTo(screenX, screenY);
          else ctx.lineTo(screenX, screenY);
        }
        ctx.closePath();
      }
      ctx.fill();
    }
  }

  function frame(now) {
    const dt = Math.min((now - (lastFrame ?? now)) / 1000, .05);
    lastFrame = now;
    if (now >= nextClockCheck) { updateClock(); nextClockCheck = now + 200; }
    const motion = state.reduced ? .45 : 1;
    state.elapsed += dt * motion;
    step(dt * motion);
    render();
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => { lastFrame = undefined; nextClockCheck = 0; });
  new ResizeObserver(resize).observe(canvas);
  resize();
  for (let i = 0; i < settings.particles; i++) {
    const flake = spawnFlake(); state.flakes.push(flake); groups[flake.tone].push(flake);
  }
  requestAnimationFrame(frame);
})();
