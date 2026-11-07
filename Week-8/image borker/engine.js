/* Original procedural ink and signal studies. No external images or services. */
(function (root) {
  'use strict';
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  function random(seed) {
    let a = Number(seed) >>> 0;
    return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(x, y, seed) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), u), lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), u), v);
  }
  function fbm(x, y, seed) {
    return noise(x, y, seed) * .56 + noise(x * 2.07 + 3.1, y * 2.07, seed + 1) * .27 + noise(x * 4.13, y * 4.13 + 7.7, seed + 2) * .12 + noise(x * 8.33, y * 8.33, seed + 3) * .05;
  }
  function validateSize(w, h) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 64 || h < 64 || w > 8192 || h > 8192 || w * h > 16777216) throw new Error('Choose dimensions from 64 to 8192 pixels, up to 16 megapixels total.');
  }
  function legacySourceSettings(s = {}) {
    const out = { mode: s.mode === 'dry' ? 'dry' : 'wet', seed: Number(s.seed ?? 42819) >>> 0 };
    for (const [key, value] of Object.entries({ coverage: .57, scale: .62, bleed: .55, density: .68, texture: .62 })) out[key] = clamp(Number.isFinite(+s[key]) ? +s[key] : value);
    return out;
  }
  function legacySignalSettings(s = {}) {
    const out = { seed: Number(s.seed ?? 7183) >>> 0 };
    for (const [key, value] of Object.entries({ pull: .25, shift: 0, slip: 0, sort: 0, weave: 0, crush: 0, grain: 0, scale: .35, mix: .8 })) out[key] = clamp(Number.isFinite(+s[key]) ? +s[key] : value);
    return out;
  }
  function sample(field, fw, fh, x, y) {
    x = clamp(x, 0, fw - 1.001); y = clamp(y, 0, fh - 1.001);
    const ix = x | 0, iy = y | 0, tx = x - ix, ty = y - iy, p = iy * fw + ix;
    return lerp(lerp(field[p], field[p + 1], tx), lerp(field[p + fw], field[p + fw + 1], tx), ty);
  }
  async function generateV1(width, height, settings, progress = () => {}) {
    validateSize(width, height);
    const s = legacySourceSettings(settings), rand = random(s.seed), dry = s.mode === 'dry';
    // A continuous, layered pigment field determines broad forms. Native-resolution
    // pigment granulation, broken deposition and paper fibers are added below.
    const fw = Math.min(width, 1024), fh = Math.max(64, Math.round(fw * height / width));
    const mass = new Float32Array(fw * fh), edge = new Float32Array(fw * fh);
    const tooth = new Float32Array(fw * fh), variation = new Float32Array(fw * fh);
    const count = dry ? 4 + Math.round((1 - s.scale) * 5) : 5 + Math.round((1 - s.scale) * 8);
    const angle = (rand() - .5) * 1.35, cos = Math.cos(angle), sin = Math.sin(angle);
    const centerX = .35 + rand() * .3, centerY = .32 + rand() * .35;
    const pools = [];
    for (let i = 0; i < count; i++) {
      const reach = .25 + s.coverage * .54;
      const along = (rand() - .5) * reach * 1.7;
      const across = (rand() - .5) * reach * .75;
      pools.push({ x: centerX + along * cos - across * sin, y: centerY + along * sin + across * cos,
        rx: (.07 + rand() * .17 + s.scale * .19) * (.5 + s.coverage * .8),
        ry: (.10 + rand() * .21 + s.scale * .15) * (.5 + s.coverage * .8),
        tilt: rand() * 3, phase: rand() * 80, weight: .27 + rand() * .83 });
    }
    for (let y = 0; y < fh; y++) {
      const v = y / (fh - 1);
      for (let x = 0; x < fw; x++) {
        const u = x / (fw - 1), p = y * fw + x;
        const n = fbm(u * 7.8, v * 7.8 * height / width, s.seed + 20);
        const n2 = fbm(u * 18.3 + 8, v * 18.3 * height / width, s.seed + 42);
        tooth[p] = n2; variation[p] = n;
        const wx = (n - .5) * (.11 + s.bleed * .13), wy = (n2 - .5) * (.08 + s.bleed * .1);
        let pigment = 0, rim = 0;
        for (const pool of pools) {
          const a = (u + wx - pool.x) / pool.rx, b = (v + wy - pool.y) / pool.ry;
          const co = Math.cos(pool.tilt), si = Math.sin(pool.tilt);
          const dx = a * co - b * si, dy = a * si + b * co;
          const theta = Math.atan2(dy, dx);
          const rough = Math.sin(theta * 3 + pool.phase) * .085 + Math.sin(theta * 7 + pool.phase * .3) * .045;
          const dist = Math.sqrt(dx * dx + dy * dy) + rough;
          const soft = dry ? .003 + s.bleed * .009 : .004 + s.bleed * .037 * (.15 + smooth(.32, .68, n));
          const fill = 1 - smooth(1 - soft, 1 + soft, dist);
          const watery = .68 + .32 * Math.sin(u * 8 + v * 4 + pool.phase);
          pigment += fill * pool.weight * watery;
          rim += Math.exp(-Math.pow((dist - .994) / (.004 + s.bleed * .008), 2)) * pool.weight;
        }
        // Paper remains visible outside the irregular composition; no mirroring.
        const press = dry ? 1 - smooth(.94, 1.04, Math.max(Math.abs((u - .50) / .44), Math.abs((v - .50) / .37)) + (n2 - .5) * .13) : 1;
        mass[p] = pigment * press; edge[p] = rim;
      }
      if (y % 24 === 0) { progress(.04 + .42 * y / fh, 'Gathering pigment'); await pause(); }
    }
    const pixels = new Uint8ClampedArray(width * height);
    const grainSeed = s.seed + 610;
    // Spatter belongs to the composition and is generated without hand placement.
    const drops = [];
    const dr = random(s.seed + 911);
    for (let i = 0; i < (dry ? 14 : 32); i++) {
      const x = clamp(centerX + (dr() - .5) * .94, .02, .98);
      const y = clamp(centerY + (dr() - .5) * .92, .03, .97);
      drops.push({ x, y, r: .001 + Math.pow(dr(), 3) * .009, opacity: .12 + dr() * .48 });
    }
    // Native-resolution deposition. There is no upscaled low-resolution raster.
    for (let y = 0; y < height; y++) {
      const fy = y * (fh - 1) / height, v = y / height;
      const ridge = Math.sin(y * .32 * 2160 / height + Math.sin(y * .019 * 2160 / height) * 4);
      for (let x = 0; x < width; x++) {
        const fx = x * (fw - 1) / width, u = x / width, p = y * width + x;
        const m = sample(mass, fw, fh, fx, fy), e = sample(edge, fw, fh, fx, fy);
        const t = sample(tooth, fw, fh, fx, fy), n = sample(variation, fw, fh, fx, fy);
        const grain = hash(x, y, grainSeed), fiber = hash(x >> 1, y >> 3, grainSeed + 1);
        const fine = hash(x >> 2, y >> 1, grainSeed + 2);
        let ink;
        if (dry) {
          const drag = noise(u * 22 + n * 14, v * 470 + (n - .5) * 45, s.seed + 730);
          const skip = clamp(smooth(.50, .80, t * .20 + grain * .25 + drag * .55) * .8 + smooth(.76, .96, grain) * .45);
          ink = clamp(m * (.7 + s.density * 4)) * (1 - skip * s.texture * 1.55);
          ink *= .94 + .06 * fine;
        } else {
          const deposit = .82 + (t - .5) * s.texture * 1.6 + (grain * .35 + fiber * .35 + fine * .30 - .5) * s.texture * .70;
          ink = 1 - Math.exp(-(m * (.28 + s.density * 1.65) * deposit + e * (.14 + s.density * .70)));
          ink += (grain * .4 + fiber * .6 - .5) * .07 * s.texture * clamp(m * 2);
        }
        const paper = 250 + (grain - .5) * 6 * s.texture + (fiber - .5) * 3 * s.texture + ridge * .5 * s.texture;
        pixels[p] = clamp(paper * (1 - clamp(ink, 0, .97)) + fine * 3 * s.texture, 0, 255);
      }
      if (y % 64 === 0) { progress(.48 + .46 * y / height, 'Revealing paper texture'); await pause(); }
    }
    if (!dry) for (const d of drops) {
      const radius = Math.max(1, d.r * Math.min(width, height)), cx = d.x * width, cy = d.y * height;
      for (let y = Math.max(0, Math.floor(cy - radius * 1.2)); y < Math.min(height, cy + radius * 1.2); y++) for (let x = Math.max(0, Math.floor(cx - radius * 1.2)); x < Math.min(width, cx + radius * 1.2); x++) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        const alpha = (1 - smooth(.82, 1.08, distance)) * d.opacity;
        pixels[y * width + x] *= 1 - alpha * (.45 + smooth(.5, .95, distance) * .55);
      }
    }
    progress(1, 'Source ready');
    return pixels;
  }
  async function distort(input, width, height, settings, progress = () => {}) {
    validateSize(width, height);
    if (input.length !== width * height) throw new Error('Image dimensions do not match its pixel data.');
    const s = signalSettings(settings), wide = s.model !== 1;
    if (!s.mix || !['pull', 'shift', 'slip', 'sort', 'weave', 'crush', 'grain'].some(k => s[k] > 0)) return new Uint8ClampedArray(input);
    let current = new Uint8ClampedArray(input);
    const span = Math.max(wide ? 1 : 2, Math.round(width * (wide ? .00025 + Math.pow(s.scale, 3) * .48 : .001 + s.scale * .021)));
    const wrap = (v, n) => ((v % n) + n) % n;
    if (s.shift || s.slip) {
      const out = new Uint8ClampedArray(current), rows = Math.max(wide ? 1 : 2, Math.round(height * (wide ? .0005 + Math.pow(s.scale, 3) * .60 : .003 + s.scale * .06)));
      for (let y = 0; y < height; y++) {
        const band = Math.floor(y / rows), r = hash(band, 0, s.seed);
        const shift = r < s.shift * (wide ? 1 : .83) ? Math.round((hash(band, 1, s.seed) - .5) * width * (wide ? 3.9 : .65) * s.shift) : 0;
        for (let x = 0; x < width; x++) {
          let q = y * width + wrap(x + shift, width);
          const block = Math.floor(q / (span * 19));
          if (s.slip && hash(block, 7, s.seed) < s.slip * (wide ? 1 : .35)) {
            const r = hash(block, 9, s.seed) - .5;
            q = wrap(q + Math.floor(wide ? r * input.length * (.003 + .997 * s.slip * s.slip) : r * width * (2 + 28 * s.slip)), input.length);
          }
          out[y * width + x] = current[q];
        }
        if (y % 128 === 0) { progress(.04 + .18 * y / height, 'Displacing the signal'); await pause(); }
      }
      current = out;
    }
    if (s.pull) {
      const out = new Uint8ClampedArray(current);
      for (let x = 0; x < width; x++) {
        const group = Math.floor(x / span), selection = hash(group, 11, s.seed);
        if (selection > (wide ? s.pull : .12 + s.pull * .86)) continue;
        const anchor = Math.floor(hash(group, 12, s.seed) * height * .85);
        const length = Math.floor(height * (wide ? .025 + hash(group, 13, s.seed) * 3 : .08 + hash(group, 13, s.seed) * .85) * s.pull);
        const direction = hash(group, 14, s.seed) > .35 ? 1 : -1;
        const compression = wide ? .00002 + Math.pow(1 - s.pull, 6) * .75 : .008 + Math.pow(1 - s.pull, 3) * .35;
        for (let d = 0; d < length; d++) {
          const y = anchor + d * direction;
          if (y < 0 || y >= height) break;
          const sy = clamp(Math.floor(anchor + d * direction * compression), 0, height - 1);
          out[y * width + x] = current[sy * width + x];
        }
        if (x % 128 === 0) { progress(.24 + .17 * x / width, 'Pulling vertical traces'); await pause(); }
      }
      current = out;
    }
    if (s.sort) {
      const out = new Uint8ClampedArray(current), counts = new Uint32Array(256);
      for (let x = 0; x < width; x++) {
        if (hash(Math.floor(x / Math.max(1, span >> 2)), 30, s.seed) > (wide ? s.sort : .1 + s.sort * .85)) continue;
        const start = Math.floor(hash(Math.floor(x / span), 32, s.seed) * height * (wide ? (1 - s.sort) : .32));
        const end = Math.min(height, start + Math.floor(height * (wide ? .003 + s.sort * .997 : .12 + s.sort * .86)));
        counts.fill(0);
        for (let y = start; y < end; y++) counts[current[y * width + x]]++;
        let y = start;
        for (let value = 255; value >= 0; value--) for (let n = counts[value]; n > 0; n--) out[y++ * width + x] = value;
        if (x % 128 === 0) { progress(.43 + .18 * x / width, 'Sorting tonal information'); await pause(); }
      }
      current = out;
    }
    if (s.weave || s.crush || s.grain) {
      const cell = Math.max(wide ? 1 : 2, Math.round(wide ? width * (.00025 + Math.pow(s.scale, 3) * .07) : width / 960 * (1 + s.scale * 4)));
      const levels = Math.max(2, Math.round(256 * Math.pow(1 - s.crush, 4)));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const p = y * width + x;
          let value = current[p];
          if (s.weave) {
            const column = Math.floor(x / (span * 2));
            const chunk = Math.floor(y / (span * 5));
            if (hash(column, 40, s.seed) < s.weave * (wide ? 1 : .72) && hash(column, chunk, s.seed + 41) > (wide ? .19 * (1 - s.weave) : .19)) {
              const bitX = Math.floor(x / cell), bitY = Math.floor(y / cell);
              const motif = hash(column, chunk, s.seed + 42);
              const bit = motif > .56 ? (bitX + bitY) % 2 : (bitY % 4 > 1 ? 1 : bitX % 3 === 0 ? 1 : 0);
              const pattern = bit ? 241 : 13;
              value = lerp(value, pattern, wide ? s.weave : .3 + s.weave * .7);
            }
          }
          if (s.crush) value = Math.round(clamp((value - 128) * (1 + s.crush * (wide ? 15 : .9)) + 128, 0, 255) / 255 * (levels - 1)) / (levels - 1) * 255;
          if (s.grain) value += (hash(x, y, s.seed + 60) - .5) * s.grain * (wide ? 1100 : 110);
          current[p] = value;
        }
        if (y % 96 === 0) { progress(.63 + .25 * y / height, 'Encoding fragments'); await pause(); }
      }
    }
    // At maximum mix, feedback can overshoot. Legacy recipes retain their exact blend.
    const mix = wide ? s.mix <= .75 ? s.mix / .75 : 1 + (s.mix - .75) * 8 : s.mix;
    for (let p = 0; p < current.length; p++) current[p] = lerp(input[p], current[p], mix);
    progress(1, 'Pass ready');
    return current;
  }
  const structures = {
    blooms: 'Pools & blooms', islands: 'Archipelago', currents: 'Currents',
    filaments: 'Filaments', strata: 'Sediment', ribbons: 'Ribbons',
    cells: 'Membranes', impressions: 'Impressions', spatter: 'Spatter'
  };
  function sourceSettings(s = {}) {
    const base = legacySourceSettings(s);
    const model = s.model === 1 ? 1 : 2;
    return { ...base, model, structure: Object.hasOwn(structures, s.structure) ? s.structure : 'explore' };
  }
  function signalSettings(s = {}) {
    const model = s.model === 1 ? 1 : 2, base = legacySignalSettings(s);
    if (model === 2 && s.mix === undefined) base.mix = .60;
    return { ...base, model };
  }
  function sourceProfile(settings) {
    const s = sourceSettings(settings), rand = random(s.seed ^ 0x4a7b23cd), keys = Object.keys(structures);
    const first = keys[Math.floor(rand() * keys.length)];
    const primary = s.structure === 'explore' ? first : s.structure;
    const other = keys.filter(key => key !== primary);
    const secondary = other[Math.floor(rand() * other.length)];
    return { primary, secondary, blend: s.structure === 'explore' ? .08 + rand() * .42 : 0 };
  }
  function describeSource(settings) {
    const s = sourceSettings(settings);
    if (s.model === 1) return 'Original pools';
    const p = sourceProfile(s);
    return structures[p.primary] + (p.blend > .29 ? ` / ${structures[p.secondary]}` : '');
  }
  function makeStructure(kind, settings, salt, aspect) {
    const s = settings, rand = random(s.seed + salt), scale = s.scale;
    const turn = rand() * Math.PI * 2, co = Math.cos(turn), si = Math.sin(turn);
    const ox = rand() * 11, oy = rand() * 11, skew = .2 + rand() * 2.8;
    const freq = .7 + 70 * Math.pow(1 - scale, 2.5);
    const centerX = -.12 + rand() * 1.24, centerY = -.12 + rand() * 1.24;
    const points = [], segments = [];
    const count = kind === 'cells' ? 8 + Math.floor(rand() * 19) : kind === 'islands' ? 14 + Math.floor(rand() * 29) : kind === 'impressions' ? 3 + Math.floor(rand() * 8) : 3 + Math.floor(rand() * 8);
    for (let i = 0; i < count; i++) {
      const clustered = kind === 'blooms';
      points.push({ x: clustered ? centerX + (rand() - .5) * 1.1 : -.18 + rand() * 1.36,
        y: clustered ? centerY + (rand() - .5) * 1.1 : -.18 + rand() * 1.36,
        rx: (.008 + scale * scale * (.15 + rand() * .8)) * (kind === 'islands' ? .4 : 1),
        ry: (.008 + scale * scale * (.15 + rand() * .8)) * (kind === 'islands' ? .4 : 1),
        weight: .35 + rand() * .65, phase: rand() * 9 });
    }
    if (kind === 'ribbons') {
      for (let i = 0; i < 2 + Math.floor(rand() * 5); i++) {
        const controls = Array.from({ length: 4 }, () => ({ x: -.3 + rand() * 1.6, y: -.4 + rand() * 1.8 }));
        const radius = .002 + Math.pow(scale, 3) * (.12 + rand() * .50);
        const curve = t => { const a = 1 - t; return { x: a ** 3 * controls[0].x + 3 * a * a * t * controls[1].x + 3 * a * t * t * controls[2].x + t ** 3 * controls[3].x, y: a ** 3 * controls[0].y + 3 * a * a * t * controls[1].y + 3 * a * t * t * controls[2].y + t ** 3 * controls[3].y }; };
        let previous = curve(0);
        for (let j = 1; j <= 16; j++) {
          const next = curve(j / 16), dx = (next.x - previous.x) * aspect, dy = next.y - previous.y;
          segments.push({ x: previous.x, y: previous.y, dx, dy, length2: Math.max(1e-10, dx * dx + dy * dy), radius }); previous = next;
        }
      }
    }
    return (u, v, n, detail) => {
      const xx = (u - .5) * aspect, yy = v - .5;
      const rx = xx * co - yy * si, ry = xx * si + yy * co;
      const turbulence = .003 + Math.pow(s.bleed, 2) * .62;
      const wu = u + (n - .5) * turbulence, wv = v + (detail - .5) * turbulence;
      let score = 0;
      if (kind === 'blooms' || kind === 'islands' || kind === 'impressions') {
        for (const point of points) {
          const dx = (wu - point.x) / point.rx, dy = (wv - point.y) / point.ry;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) continue;
          const a = dx * co - dy * si, b = dx * si + dy * co;
          const radius = kind === 'impressions' ? Math.max(Math.abs(a), Math.abs(b)) : Math.hypot(a, b);
          const ragged = (detail - .5) * (.04 + s.bleed * 1.8);
          const fill = 1 - smooth(.35, 1.3, radius + ragged);
          score += fill * point.weight;
        }
        return 1 - Math.exp(-score * (kind === 'islands' ? 2.6 : 1.8));
      }
      if (kind === 'ribbons') {
        for (const segment of segments) {
          const dx = (wu - segment.x) * aspect, dy = wv - segment.y;
          const t = clamp((dx * segment.dx + dy * segment.dy) / segment.length2);
          const distance2 = (dx - t * segment.dx) ** 2 + (dy - t * segment.dy) ** 2;
          score = Math.max(score, Math.exp(-distance2 / (segment.radius * segment.radius)) * (.55 + n * .7));
        }
        return clamp(score);
      }
      if (kind === 'cells') {
        let near = Infinity, next = Infinity, cell = 0;
        for (let i = 0; i < points.length; i++) {
          const distance = ((wu - points[i].x) * aspect) ** 2 + (wv - points[i].y) ** 2;
          if (distance < near) { next = near; near = distance; cell = i; } else if (distance < next) next = distance;
        }
        const thickness = .0002 + Math.pow(scale, 3) * .23;
        const membrane = 1 - smooth(0, thickness, next - near);
        return clamp(membrane * (.7 + n * .4) + (points[cell].weight > .8 ? .35 * n : 0));
      }
      const warp = Math.pow(s.bleed, 3) * freq * 2;
      const qx = rx * freq + ox + (detail - .5) * warp, qy = ry * freq + oy + (n - .5) * warp;
      if (kind === 'spatter') {
        const gx = Math.floor(qx), gy = Math.floor(qy);
        for (let by = -1; by <= 1; by++) for (let bx = -1; bx <= 1; bx++) {
          const cx = gx + bx + hash(gx + bx, gy + by, s.seed + salt), cy = gy + by + hash(gx + bx, gy + by, s.seed + salt + 1);
          const radius = .03 + hash(gx + bx, gy + by, s.seed + salt + 2) ** 3 * .66;
          const distance = Math.hypot(qx - cx + (detail - .5) * s.bleed * .5, qy - cy);
          score = Math.max(score, (1 - smooth(radius * .25, radius * 1.3, distance)) * (.5 + n * .5));
        }
        return score;
      }
      if (kind === 'strata') {
        const contour = ry * freq * 1.5 + (n - .5) * (2 + s.bleed * 11) + Math.sin(rx * freq * .4) * 1.8;
        const band = .5 + .5 * Math.sin(contour * Math.PI);
        return clamp(band * (.60 + detail * .45) - .12 * smooth(.48, .70, n));
      }
      if (kind === 'filaments') {
        const ridge = 1 - Math.abs(fbm(qx + (detail - .5) * 4, qy + (n - .5) * 4, s.seed + salt + 4) - .5) * 2;
        return Math.pow(clamp(ridge), 5 + (1 - scale) * 12) * (.45 + n * .8);
      }
      // Currents: elongated, domain-warped fields rather than a cluster of pools.
      const flow = fbm(qx * skew + (detail - .5) * 7, qy / skew + (n - .5) * 7, s.seed + salt + 8);
      return clamp((flow - .22) * 1.8 + (detail - .5) * .3);
    };
  }
  async function generateV2(width, height, settings, progress) {
    const s = sourceSettings(settings), dry = s.mode === 'dry', profile = sourceProfile(s), aspect = width / height;
    const primary = makeStructure(profile.primary, s, 173, aspect);
    const secondary = profile.blend ? makeStructure(profile.secondary, s, 1973, aspect) : null;
    const fw = Math.min(width, 1024), fh = Math.max(64, Math.round(fw * height / width));
    const mass = new Float32Array(fw * fh), edge = new Float32Array(fw * fh), tooth = new Float32Array(fw * fh);
    const threshold = .95 - s.coverage * .84 - smooth(.85, 1, s.coverage) * .3;
    const soft = .002 + Math.pow(s.bleed, 3) * .42;
    const freq = 1 + 44 * Math.pow(1 - s.scale, 2.2);
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const u = x / (fw - 1), v = y / (fh - 1), p = y * fw + x;
        const n = fbm(u * freq * aspect + 4.3, v * freq, s.seed + 720);
        const detail = fbm(u * freq * 3.4 * aspect, v * freq * 3.4 + 7, s.seed + 740);
        let raw = primary(u, v, n, detail);
        if (secondary) {
          const other = secondary(u, v, n, detail);
          // Union/interference changes topology; random seeds explore combinations.
          raw = raw * (1 - profile.blend * .45) + other * profile.blend * (1.1 + detail * .6);
        }
        const fill = smooth(threshold - soft, threshold + soft, raw);
        mass[p] = fill * (.25 + clamp((raw - threshold) * 2) * .75);
        edge[p] = Math.exp(-Math.pow((raw - threshold) / (.003 + s.bleed * .045), 2)) * fill;
        tooth[p] = detail;
      }
      if (y % 24 === 0) { progress(.03 + .44 * y / fh, `Forming ${structures[profile.primary].toLowerCase()}`); await pause(); }
    }
    const pixels = new Uint8ClampedArray(width * height);
    const gain = .006 + Math.pow(s.density, 1.5) * 1.1 + Math.pow(s.density, 6) * 18;
    const texture = Math.pow(s.texture, 1.4);
    for (let y = 0; y < height; y++) {
      const fy = y * (fh - 1) / height, v = y / height;
      for (let x = 0; x < width; x++) {
        const fx = x * (fw - 1) / width, u = x / width, p = y * width + x;
        const m = sample(mass, fw, fh, fx, fy), e = sample(edge, fw, fh, fx, fy), t = sample(tooth, fw, fh, fx, fy);
        const grain = hash(x, y, s.seed + 610), fiber = hash(x >> 1, y >> 3, s.seed + 611), fine = hash(x >> 2, y >> 1, s.seed + 612);
        let ink;
        if (dry) {
          const drag = noise(u * (3 + s.scale * 90) + t * s.bleed * 30, v * (15 + (1 - s.scale) * 2000) + t * 34, s.seed + 730);
          const breakup = smooth(.35, .87, t * .2 + grain * .32 + drag * .48);
          ink = clamp(m * gain * 2.5) * (1 - clamp(breakup * texture * 4.5 + smooth(.65, .98, grain) * texture * 1.1));
        } else {
          const deposit = Math.max(.02, 1 + (t - .5) * texture * 5 + (grain * .4 + fiber * .6 - .5) * texture * 2.1);
          ink = 1 - Math.exp(-(m * gain * deposit + e * gain * (.03 + .35 * s.bleed)));
          ink += (grain * .4 + fiber * .6 - .5) * texture * .36 * clamp(m * 3);
        }
        const paper = 252 + (grain - .5) * texture * 36 + (fiber - .5) * texture * 25;
        pixels[p] = clamp(paper * (1 - clamp(ink)) + (fine - .5) * texture * 8, 0, 255);
      }
      if (y % 64 === 0) { progress(.49 + .46 * y / height, 'Depositing ink & paper'); await pause(); }
    }
    progress(1, 'Source ready'); return pixels;
  }
  async function generate(width, height, settings, progress = () => {}) {
    validateSize(width, height);
    return settings?.model === 1 ? generateV1(width, height, settings, progress) : generateV2(width, height, settings, progress);
  }
  const api = { generate, distort, random, validateSize, sourceSettings, signalSettings, structures, sourceProfile, describeSource };
  root.InkEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
