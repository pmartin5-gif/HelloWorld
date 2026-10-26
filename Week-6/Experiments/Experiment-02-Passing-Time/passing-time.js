/* Passing Time. A one-way flock encountering an invisible clock-shaped current.
   No destinations, attraction to numerals, color changes, or visible text. */
(() => {
  'use strict';
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  /* Tune these values here, then save and reload the page to see the changes.
     Object.freeze prevents changes while the animation runs; it does not stop
     you from editing the numbers in this file.

     birds: Total bird count (use a positive whole number). More birds make the
       sky denser and require more drawing work; fewer make it more sparse.
     affectedPercentage: Chance, from 0 to 100, that each bird responds to the
       clock's slowing and bend. 50 affects roughly half of incoming birds;
       0 disables the clock effect and 100 applies it to every bird. Each bird
       keeps its random choice for one trip across the scene, then chooses
       again when it re-enters. Actual proportions vary by chance, and affected
       birds can accumulate in the digits because they spend longer there.
     heading: Base flight angle in degrees. Use 0 for right, 90 for down,
       180 for left, or 270 (also -90) for up. Any value is supported and wraps
       around every 360 degrees. Birds re-enter from the matching upstream edges.
     slowing: Maximum fraction of speed lost inside the clock numerals. .85
       means an 85% reduction at full influence, leaving 15% of normal speed.
       Use 0 for no slowing; higher values make birds linger and digits denser.
       Keep this at least 0 and below 1 so birds continue moving forward.
     bend: Extra heading angle in radians inside the numerals. 0 adds no bend;
       try .05 for a slight downward turn or -.05 for a slight upward turn.
       Any angle is supported, including turns that reverse flight. Angles wrap
       around a full circle; birds ease toward the target via the shortest turn.
     response: Time constant in simulation seconds for entering/leaving the
       slowdown effect. Keep positive. Smaller values react more sharply;
       larger values ease in and out more gradually, spreading the effect.
       Reduced-motion mode makes this response take longer in real time.
     minuteTransition: Seconds to blend from the old time's numeral mask to
       the new one. Keep positive; smaller values switch faster, larger values
       give a longer overlap. This uses real time even in reduced-motion mode.
     margin: Offscreen padding in CSS pixels before birds are recycled, also
       used for their entry positions. Keep nonnegative; larger values let
       birds travel farther beyond the edges before reappearing upstream.
     cell: Side length of each local alignment grid cell in CSS pixels. Keep
       positive. Smaller cells align smaller groups and use more grid memory;
       larger cells average headings over broader areas of the flock.
  */
  const settings = Object.freeze({
    birds: 8000,
    affectedPercentage: 65,
    heading: 330,
    slowing: 0.85,
    bend: 8,
    response: .75,
    minuteTransition: 5,
    margin: 26,
    cell: 64
  });
  // Convert the editable heading from degrees to radians for the simulation.
  const baseHeading = settings.heading * Math.PI / 180;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const wrapAngle = angle => angleDelta(0, angle);
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const state = {
    width: 1, height: 1, birds: [], elapsed: 0, key: '',
    mask: null, previousMask: null, transition: settings.minuteTransition,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches
  };
  const inks = ['rgba(38,43,38,.62)', 'rgba(46,51,46,.69)', 'rgba(54,59,54,.76)', 'rgba(62,67,62,.83)'];
  const groups = [[], [], [], []];
  // Aggregate local headings in a reusable spatial grid, avoiding pairwise work.
  const grid = { cols: 0, rows: 0, counts: null, sinHeadings: null, cosHeadings: null };
  let lastFrame;
  let nextClockCheck = 0;

  function clockText(date = new Date()) {
    return `${date.getHours() % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function makeMask(text) {
    const image = document.createElement('canvas');
    // A low-resolution, softly filtered mask is sufficient for steering and
    // much cheaper to sample than reading pixels from the visible canvas.
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
    return { width: image.width, height: image.height, values };
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

  function influenceAt(x, y, blend) {
    const current = readMask(state.mask, x, y);
    if (!state.previousMask) return current;
    return readMask(state.previousMask, x, y) * (1 - blend) + current * blend;
  }

  function updateClock() {
    const text = clockText();
    if (text === state.key) return;
    state.previousMask = state.mask;
    state.mask = makeMask(text);
    state.transition = state.previousMask ? 0 : settings.minuteTransition;
    state.key = text;
    canvas.setAttribute('aria-label', `A passing flock revealing ${text}, local time, through subtle changes in flight.`);
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
    for (const bird of state.birds) { bird.x *= w / oldW; bird.y *= h / oldH; }
    grid.cols = Math.ceil((w + settings.margin * 2) / settings.cell);
    grid.rows = Math.ceil((h + settings.margin * 2) / settings.cell);
    grid.counts = new Uint32Array(grid.cols * grid.rows);
    grid.sinHeadings = new Float32Array(grid.cols * grid.rows);
    grid.cosHeadings = new Float32Array(grid.cols * grid.rows);
    state.mask = null; state.previousMask = null; state.key = '';
    updateClock();
  }

  function spawnBird() {
    const affected = Math.random() * 100 < settings.affectedPercentage;
    let x, y;
    // Start with the steady-flow density: slower regions have longer residence
    // times. This avoids waiting a whole crossing for the clock to emerge.
    do {
      x = rand(0, state.width); y = rand(0, state.height);
    } while (Math.random() > .8 / (1 - settings.slowing * (affected ? influenceAt(x, y, 1) : 0)));
    const bird = {
      x, y, speed: rand(72, 108), size: rand(1.65, 3.05),
      seed: rand(0, TAU), tone: Math.floor(rand(0, 4)),
      affected, heading: wrapAngle(baseHeading), slowdown: affected ? influenceAt(x, y, 1) : 0,
      vx: 0, vy: 0, cell: 0, nextHeading: wrapAngle(baseHeading)
    };
    bird.vx = Math.cos(bird.heading) * bird.speed * (1 - settings.slowing * bird.slowdown);
    bird.vy = Math.sin(bird.heading) * bird.speed * (1 - settings.slowing * bird.slowdown);
    return bird;
  }

  function recycle(bird) {
    const margin = settings.margin;
    // Incoming flux is proportional to each edge's length and the component
    // of flight crossing it. This keeps the whole sky continuously supplied.
    const dx = Math.cos(baseHeading), dy = Math.sin(baseHeading);
    const sideFlux = Math.abs(dx) * (state.height + margin * 2);
    const verticalFlux = Math.abs(dy) * (state.width + margin * 2);
    if (Math.random() < sideFlux / (sideFlux + verticalFlux)) {
      bird.x = dx >= 0 ? -margin : state.width + margin;
      bird.y = rand(-margin, state.height + margin);
    } else {
      bird.x = rand(-margin, state.width + margin);
      bird.y = dy >= 0 ? -margin : state.height + margin;
    }
    bird.slowdown = 0;
    bird.affected = Math.random() * 100 < settings.affectedPercentage;
    bird.heading = wrapAngle(baseHeading);
    bird.nextHeading = bird.heading;
    bird.vx = Math.cos(bird.heading) * bird.speed;
    bird.vy = Math.sin(bird.heading) * bird.speed;
  }

  function step(dt) {
    const { birds, width: w, height: h, elapsed: t } = state;
    state.transition += dt;
    const blend = smooth(state.transition / settings.minuteTransition);
    if (blend === 1) state.previousMask = null;
    const response = 1 - Math.exp(-dt / settings.response);
    const turnResponse = 1 - Math.exp(-dt / .55);
    grid.counts.fill(0); grid.sinHeadings.fill(0); grid.cosHeadings.fill(0);
    for (const bird of birds) {
      const gx = clamp(Math.floor((bird.x + settings.margin) / settings.cell), 0, grid.cols - 1);
      const gy = clamp(Math.floor((bird.y + settings.margin) / settings.cell), 0, grid.rows - 1);
      bird.cell = gy * grid.cols + gx;
      grid.counts[bird.cell]++;
      grid.sinHeadings[bird.cell] += Math.sin(bird.heading);
      grid.cosHeadings[bird.cell] += Math.cos(bird.heading);
    }
    for (const bird of birds) {
      const influence = bird.affected ? influenceAt(bird.x, bird.y, blend) : 0;
      bird.slowdown += (influence - bird.slowdown) * response;
      // Average directions on the circle so headings near -PI and PI align.
      const sinHeading = grid.sinHeadings[bird.cell], cosHeading = grid.cosHeadings[bird.cell];
      const localHeading = Math.hypot(sinHeading, cosHeading) > 1e-6
        ? Math.atan2(sinHeading, cosHeading) : bird.heading;
      // Gentle, shared traveling ripples create loose groups. The invisible
      // lettering adds the configured bend, which may turn birds in any direction.
      const ripple = Math.sin(bird.x / 245 + bird.y / 310 - t * .18) * .045
        + Math.cos(bird.y / 190 + t * .13) * .025
        + Math.sin(t * .6 + bird.seed) * .018;
      const desired = baseHeading + ripple + settings.bend * bird.slowdown;
      bird.nextHeading = wrapAngle(desired + angleDelta(desired, localHeading) * .12);
    }
    for (const bird of birds) {
      bird.heading = wrapAngle(bird.heading + angleDelta(bird.heading, bird.nextHeading) * turnResponse);
      const speed = bird.speed * (1 - settings.slowing * bird.slowdown);
      bird.vx = Math.cos(bird.heading) * speed;
      bird.vy = Math.sin(bird.heading) * speed;
      bird.x += bird.vx * dt; bird.y += bird.vy * dt;
      if (bird.x < -settings.margin || bird.x > w + settings.margin
          || bird.y < -settings.margin || bird.y > h + settings.margin) recycle(bird);
    }
  }

  function render() {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, state.width, state.height);
    for (let tone = 0; tone < 4; tone++) {
      ctx.fillStyle = inks[tone]; ctx.beginPath();
      for (const bird of groups[tone]) {
        const dx = Math.cos(bird.heading) * bird.size, dy = Math.sin(bird.heading) * bird.size;
        ctx.moveTo(bird.x + dx * 2, bird.y + dy * 2);
        ctx.lineTo(bird.x - dx + dy, bird.y - dy - dx);
        ctx.lineTo(bird.x - dx - dy, bird.y - dy + dx);
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
    // The mask transition follows real seconds, even with reduced flight speed.
    const transition = state.transition;
    step(dt * motion);
    state.transition = transition + dt;
    render();
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => { lastFrame = undefined; nextClockCheck = 0; });
  new ResizeObserver(resize).observe(canvas);
  resize();
  for (let i = 0; i < settings.birds; i++) {
    const bird = spawnBird(); state.birds.push(bird); groups[bird.tone].push(bird);
  }
  requestAnimationFrame(frame);
})();
