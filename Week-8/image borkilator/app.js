(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('artwork'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const engine = window.InkEngine;
  const state = { busy: false, pixels: null, width: 3840, height: 2160, history: [], active: null, originalView: false, actualSize: false, nextId: 1, worker: null, jobs: new Map(), jobId: 0, viewToken: 0, redo: [] };
  const signalFields = [
    ['pull', 'Vertical pull', 25, 'Stretch fragments of columns into long vertical traces.'],
    ['shift', 'Band shift', 0, 'Displace horizontal bands of the image.'],
    ['slip', 'Data slip', 0, 'Offset blocks in the image’s sequence of pixel values.'],
    ['sort', 'Pixel sort', 0, 'Reorder column segments from light to dark.'],
    ['weave', 'Digital weave', 0, 'Introduce interrupted columns of checks and encoded-looking bars.'],
    ['crush', 'Tone crush', 0, 'Reduce tonal steps and push contrast.'],
    ['grain', 'Signal noise', 0, 'From a trace of grain to overwhelming, clipped static.']
  ];
  const shapeFields = [
    ['scale', 'Fragment scale', 35, 'From individual pixels to fragments occupying much of the frame.'],
    ['mix', 'Pass mix', 60, '0: original. 75: full processed result. Above 75: overdrive with tonal clipping and possible inversion.']
  ];
  const presets = {
    dragged: { pull: .67, shift: .06, slip: 0, sort: .36, weave: 0, crush: .08, grain: .08, scale: .24, mix: .70 },
    fractured: { pull: .12, shift: .53, slip: .42, sort: .14, weave: .08, crush: .24, grain: .08, scale: .42, mix: .72 },
    encoded: { pull: .14, shift: .12, slip: .06, sort: 0, weave: .71, crush: .48, grain: 0, scale: .3, mix: .68 },
    clear: { pull: 0, shift: 0, slip: 0, sort: 0, weave: 0, crush: 0, grain: 0, scale: .35, mix: .60 }
  };
  function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
  function makeSliders(container, prefix, fields) {
    for (const [key, label, value, tip] of fields) {
      const div = document.createElement('div'); div.className = 'slider';
      const top = document.createElement('div'); top.className = 'slider-top';
      const text = document.createElement('label'); text.htmlFor = `${prefix}-${key}`; text.title = tip; text.textContent = label;
      const numeric = document.createElement('input'); numeric.type = 'number'; numeric.className = 'value-input'; numeric.min = '0'; numeric.max = '100'; numeric.step = '1'; numeric.value = value; numeric.id = `${prefix}-${key}-value`; numeric.setAttribute('aria-label', `${label} percentage`);
      const range = document.createElement('input'); range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '1'; range.value = value; range.id = `${prefix}-${key}`; range.title = tip;
      const sync = (from, to) => {
        const n = Math.max(0, Math.min(100, Number(from.value) || 0)); from.value = n; to.value = n;
        range.style.setProperty('--fill', `${n}%`);
        range.setAttribute('aria-valuetext', `${n} percent`);
        pending(prefix);
      };
      range.addEventListener('input', () => sync(range, numeric));
      numeric.addEventListener('change', () => sync(numeric, range));
      range.style.setProperty('--fill', `${value}%`); range.setAttribute('aria-valuetext', `${value} percent`);
      top.append(text, numeric); div.append(top, range);
      if (prefix === 'signal' && key === 'mix') { const note = document.createElement('p'); note.className = 'slider-note'; note.textContent = '75 = full signal · 100 = overdrive'; div.append(note); }
      container.append(div);
    }
  }
  makeSliders($('signal-sliders'), 'signal', signalFields);
  makeSliders($('signal-shape-sliders'), 'signal', shapeFields);
  function getFields(prefix, fields) { return Object.fromEntries(fields.map(([key]) => [key, Number($(`${prefix}-${key}`).value) / 100])); }
  function readSeed(id) {
    const value = Number($(id).value);
    if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new Error('Use a whole-number seed between 0 and 4294967295.');
    return value;
  }
  function signalSettings() { return engine.signalSettings({ ...getFields('signal', [...signalFields, ...shapeFields]), seed: readSeed('signal-seed') }); }
  function writeFields(prefix, fields, settings) {
    for (const [key] of fields) {
      const value = Math.round(settings[key] * 100);
      $(`${prefix}-${key}`).value = value; $(`${prefix}-${key}-value`).value = value;
      $(`${prefix}-${key}`).style.setProperty('--fill', `${value}%`);
      $(`${prefix}-${key}`).setAttribute('aria-valuetext', `${value} percent`);
    }
  }
  function writeSignal(settings) {
    writeFields('signal', [...signalFields, ...shapeFields], settings); $('signal-seed').value = settings.seed;
    document.querySelectorAll('[data-preset]').forEach(el => el.classList.remove('selected'));
  }
  function pending() {
    $('signal-pending').textContent = Number($('signal-mix').value) > 75 ? 'Overdrive · the next pass can clip or invert tones' : 'Settings ready for the next pass';
    document.querySelectorAll('[data-preset]').forEach(el => el.classList.remove('selected'));
  }
  function updateButtons() {
    const unavailable = state.busy || !state.active;
    for (const id of ['apply', 'export', 'save-recipe', 'view-current', 'view-original', 'zoom']) $(id).disabled = unavailable;
    $('undo').disabled = unavailable || state.active.parentId === null || !state.history.some(h => h.id === state.active.parentId);
    $('redo').disabled = unavailable || !state.redo.length;
    $('view-current').classList.toggle('active', !state.originalView); $('view-original').classList.toggle('active', state.originalView);
    $('view-current').setAttribute('aria-pressed', !state.originalView); $('view-original').setAttribute('aria-pressed', state.originalView);
  }
  function busy(value) {
    state.busy = value;
    document.querySelectorAll('button, input, select').forEach(el => { el.disabled = value; });
    $('render-overlay').hidden = !value;
    $('viewport').setAttribute('aria-busy', value);
    if (value) { $('render-progress').value = 0; $('render-percent').textContent = '0%'; }
    updateButtons();
  }
  function progress(value, text) { $('render-progress').value = value; $('render-percent').textContent = `${Math.round(value * 100)}%`; $('render-label').textContent = text; }
  function initWorker() {
    if (location.protocol === 'file:') return;
    try {
      const worker = new Worker('worker.js');
      worker.onmessage = ({ data }) => {
        const job = state.jobs.get(data.id); if (!job) return;
        if ('progress' in data) job.progress(data.progress, data.message);
        else { state.jobs.delete(data.id); data.error ? job.reject(new Error(data.error)) : job.resolve(new Uint8ClampedArray(data.result)); }
      };
      worker.onerror = () => {
        worker.terminate(); state.worker = null;
        for (const job of state.jobs.values()) job.reject(Object.assign(new Error('Background rendering unavailable.'), { fallback: true }));
        state.jobs.clear();
      };
      state.worker = worker;
    } catch { state.worker = null; }
  }
  async function render(operation, width, height, settings, input, report = progress) {
    if (state.worker) {
      try {
        return await new Promise((resolve, reject) => {
          const id = ++state.jobId, pixels = input ? input.slice().buffer : undefined;
          state.jobs.set(id, { resolve, reject, progress: report });
          state.worker.postMessage({ id, operation, width, height, settings, pixels }, pixels ? [pixels] : []);
        });
      } catch (error) { if (!error.fallback) throw error; }
    }
    return engine.distortRGBA(input, width, height, settings, report);
  }
  function raster(pixels, width, height) {
    const result = document.createElement('canvas'); result.width = width; result.height = height;
    const c = result.getContext('2d'), image = c.createImageData(width, height);
    image.data.set(pixels);
    c.putImageData(image, 0, 0); return result;
  }
  const toBlob = c => new Promise((resolve, reject) => c.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode the image. Try a smaller output size.')), 'image/png'));
  async function bitmap(blob) {
    if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
    return new Promise((resolve, reject) => { const image = new Image(), url = URL.createObjectURL(blob); image.onload = () => { URL.revokeObjectURL(url); resolve(image); }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the saved image.')); }; image.src = url; });
  }
  function drawImage(image, width, height) {
    canvas.width = width; canvas.height = height; ctx.drawImage(image, 0, 0);
    canvas.hidden = false; $('empty').hidden = true;
  }
  function activeDetails() {
    const item = state.active; if (!item) return;
    $('study-title').textContent = item.recipe.filename;
    $('state-chip').textContent = state.originalView || !item.recipe.passes.length ? 'IMAGE' : `PASS ${String(item.recipe.passes.length).padStart(2, '0')}`;
    $('image-details').textContent = `${item.width} × ${item.height} PX / ${((item.width * item.height) / 1e6).toFixed(1)} MEGAPIXELS`;
    $('image-state').textContent = state.originalView ? 'VIEWING ORIGINAL' : item.recipe.passes.length ? 'CUMULATIVE PASS' : 'UNTOUCHED UPLOAD';
    updateButtons();
  }
  function historyBytes() { const blobs = new Set(); for (const item of state.history) { blobs.add(item.blob); blobs.add(item.original.blob); } return [...blobs].reduce((n, b) => n + b.size, 0); }
  function pruneHistory() {
    let trimmed = false;
    while ((state.history.length > 24 || historyBytes() > 192 * 1024 * 1024) && state.history.length > 2) {
      const index = state.history.findIndex(item => item.id !== state.active.id);
      state.history.splice(index, 1); trimmed = true;
    }
    state.redo = state.redo.filter(id => state.history.some(h => h.id === id));
    return trimmed;
  }
  function drawHistory() {
    const list = $('history-list'); list.replaceChildren();
    $('history-count').textContent = String(state.history.length).padStart(2, '0');
    for (const item of state.history) {
      const button = document.createElement('button'); button.className = 'history-item'; button.setAttribute('aria-current', item.id === state.active?.id ? 'true' : 'false'); button.disabled = state.busy;
      button.title = `Study ${item.study}, ${item.recipe.passes.length ? `pass ${item.recipe.passes.length}` : 'original'} · ${item.width} × ${item.height}`;
      const img = document.createElement('img'); img.src = item.thumb; img.alt = ''; img.width = 118; img.height = 66;
      const label = document.createElement('span'); label.className = 'history-label';
      const name = document.createElement('span'); name.textContent = item.recipe.passes.length ? `Pass ${String(item.recipe.passes.length).padStart(2, '0')}` : 'Upload';
      const number = document.createElement('span'); number.textContent = `${String(item.study).padStart(2, '0')} / ${String(item.id).padStart(2, '0')}`;
      label.append(name, number); button.append(img, label);
      button.addEventListener('click', () => restore(item)); list.append(button);
    }
    const active = list.querySelector('[aria-current=true]');
    if (active) {
      const left = active.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
      if (left < list.scrollLeft) list.scrollLeft = left;
      else if (left + active.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = left + active.offsetWidth - list.clientWidth;
    }
  }
  async function prepare(pixels, width, height, recipe, parent, original = null) {
    progress(.97, 'Keeping this state');
    const image = raster(pixels, width, height), blob = await toBlob(image);
    const thumb = document.createElement('canvas'); thumb.width = 236; thumb.height = 133;
    const tc = thumb.getContext('2d'); tc.fillStyle = '#aaa'; tc.fillRect(0, 0, 236, 133);
    const scale = Math.min(236 / width, 133 / height);
    tc.drawImage(image, (236 - width * scale) / 2, (133 - height * scale) / 2, width * scale, height * scale);
    const thumbnail = thumb.toDataURL('image/jpeg', .8); image.width = 1; image.height = 1;
    return { id: state.nextId++, study: parent ? parent.study : 1 + state.history.reduce((n, h) => Math.max(n, h.study), 0), width, height, recipe: structuredClone(recipe), parentId: parent?.id ?? null, blob, thumb: thumbnail, original: original || parent?.original || { blob, width, height } };
  }
  function adopt(items, pixels) {
    const item = items.at(-1);
    // All decoding, processing and encoding completes before this visible commit.
    const image = raster(pixels, item.width, item.height);
    drawImage(image, item.width, item.height); image.width = 1; image.height = 1;
    state.history.push(...items); state.active = item; state.pixels = pixels;
    state.width = item.width; state.height = item.height; state.originalView = false; state.redo = []; state.viewToken++;
    const trimmed = pruneHistory(); drawHistory(); activeDetails(); return trimmed;
  }
  async function commit(pixels, width, height, recipe, parent) {
    return adopt([await prepare(pixels, width, height, recipe, parent)], pixels);
  }
  function freshSeed() { const values = new Uint32Array(1); crypto.getRandomValues(values); return values[0]; }
  const UPLOAD_LIMIT = 100 * 1024 * 1024, SAVE_LIMIT = 128 * 1024 * 1024;
  async function inspectImage(blob) {
    if (blob.size > UPLOAD_LIMIT) throw new Error('Choose an image up to 100 MiB.');
    const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer);
    const text = (start, count) => String.fromCharCode(...bytes.subarray(start, start + count));
    let kind = '';
    if (bytes.length >= 24 && text(0, 8) === '\x89PNG\r\n\x1a\n') {
      kind = 'png';
      for (let i = 8; i + 12 <= bytes.length;) {
        const n = view.getUint32(i); if (n > bytes.length - i - 12) throw new Error('This PNG file is incomplete.');
        if (text(i + 4, 4) === 'acTL') throw new Error('Animated images are not supported. Choose a still PNG, JPEG, or WebP.');
        i += 12 + n;
      }
    } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) kind = 'jpeg';
    else if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
      kind = 'webp';
      for (let i = 12; i + 8 <= bytes.length;) {
        const n = view.getUint32(i + 4, true), tag = text(i, 4);
        if (n > bytes.length - i - 8) throw new Error('This WebP file is incomplete.');
        if (tag === 'ANIM' || tag === 'ANMF' || (tag === 'VP8X' && (bytes[i + 8] & 2))) throw new Error('Animated images are not supported. Choose a still image.');
        i += 8 + n + (n % 2);
      }
    }
    if (!kind) throw new Error('Choose a still PNG, JPEG, or WebP image.');
    return kind;
  }
  function askResize(width, height, w, h) {
    const dialog = $('resize-dialog');
    $('resize-description').textContent = `This image is ${width} × ${height}. Import a proportional ${w} × ${h} copy? Your file on disk stays unchanged.`;
    return new Promise(resolve => {
      dialog.returnValue = 'cancel';
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'resize'), { once: true });
      // Modal controls must remain available while the rest of the app is busy.
      dialog.querySelectorAll('button').forEach(b => { b.disabled = false; }); dialog.showModal();
    });
  }
  async function decodeImage(blob, allowResize = false) {
    const image = await bitmap(blob);
    try {
      let width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
      if (!width || !height) throw new Error('This image has no readable dimensions.');
      const factor = Math.min(1, 8192 / width, 8192 / height, Math.sqrt(16777216 / (width * height)));
      if (factor < 1) {
        const w = Math.max(1, Math.floor(width * factor)), h = Math.max(1, Math.floor(height * factor));
        if (!allowResize) throw new Error('The saved image exceeds processing limits.');
        if (!await askResize(width, height, w, h)) return null;
        width = w; height = h;
      }
      engine.validateUploadSize(width, height);
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      const context = c.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, width, height);
      const pixels = new Uint8ClampedArray(context.getImageData(0, 0, width, height).data);
      c.width = 1; c.height = 1; return { width, height, pixels };
    } finally { image.close?.(); }
  }
  async function upload(file) {
    if (!file || state.busy) return;
    busy(true); progress(0, 'Reading your image');
    try {
      await inspectImage(file);
      const decoded = await decodeImage(file, true); if (!decoded) { message('Upload cancelled. Your current study is preserved.'); return; }
      const { pixels, width, height } = decoded;
      const trimmed = await commit(pixels, width, height, { version: 3, width, height, filename: file.name || 'image', passes: [] }, null);
      message(`Imported ${file.name} at ${width} × ${height}. Signal settings are prepared; press borkilate to use them.${trimmed ? ' Older history was trimmed.' : ''}`);
    } catch (error) { message(`Could not upload image: ${error.message || 'The image could not be decoded.'} Your current study is preserved.`, true); }
    finally { busy(false); $('upload-image').value = ''; }
  }
  async function apply() {
    if (state.busy || !state.active) return;
    let settings; try { settings = signalSettings(); } catch (error) { message(error.message, true); return; }
    if (!settings.mix || !signalFields.some(([key]) => settings[key] > 0)) { message('Increase a distortion and Pass mix before applying a pass.'); return; }
    const parent = state.active;
    if (parent.recipe.passes.length >= 64) { message('This study has reached 64 passes. Export this result or return to an earlier state.', true); return; }
    busy(true); progress(0, 'Reading the current image');
    try {
      const pixels = await render('distort', state.width, state.height, settings, state.pixels);
      if (pixels.every((v, i) => v === state.pixels[i])) { message('This pass leaves the image unchanged.'); return; }
      const recipe = { ...parent.recipe, version: 3, passes: [...parent.recipe.passes, settings] };
      const trimmed = await commit(pixels, state.width, state.height, recipe, parent);
      $('signal-pending').textContent = 'Pass applied · ready to repeat';
      message(`Pass ${recipe.passes.length} complete. Inspect it, adjust the settings, or apply the same pass again.${trimmed ? ' Older history was trimmed to make room.' : ''}`);
    } catch (error) { message(error.message || 'This pass could not be rendered. Your previous state is preserved.', true); }
    finally { busy(false); }
  }
  async function restore(item, kind = 'select') {
    if (state.busy || item === state.active) return;
    const previous = state.active;
    busy(true); progress(.35, 'Returning to this state');
    try {
      const image = await bitmap(item.blob);
      drawImage(image, item.width, item.height); image.close?.();
      const rgba = ctx.getImageData(0, 0, item.width, item.height).data;
      state.pixels = new Uint8ClampedArray(rgba);
      state.active = item; state.width = item.width; state.height = item.height; state.originalView = false; state.viewToken++;
      if (kind === 'undo') state.redo.push(previous.id); else if (kind === 'redo') state.redo.pop(); else state.redo = [];
      if (item.recipe.passes.length) writeSignal(item.recipe.passes.at(-1));
      $('signal-pending').textContent = 'Ready to continue from this state';
      drawHistory(); activeDetails(); message(`Returned to study ${item.study}, ${item.recipe.passes.length ? `pass ${item.recipe.passes.length}` : 'the upload'}. The next pass will build from here.`);
    } catch (error) { message(error.message, true); }
    finally { busy(false); }
  }
  async function compare(original) {
    if (!state.active || state.busy || state.originalView === original) return;
    const token = ++state.viewToken;
    try {
      const image = await bitmap(original ? state.active.original.blob : state.active.blob);
      if (token !== state.viewToken) { image.close?.(); return; }
      drawImage(image, state.width, state.height); image.close?.();
      state.originalView = original; activeDetails();
      message(original ? 'Viewing the untouched upload. borkilate and Export PNG still use your current result.' : 'Viewing the current result.');
    } catch (error) { message(error.message, true); }
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function filename(ext) {
    const a = state.active, stem = a.recipe.filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'image';
    return `borkilator-${stem}-pass-${String(a.recipe.passes.length).padStart(2, '0')}-${a.width}x${a.height}.${ext}`;
  }
  function exportPNG() {
    if (!state.active || state.busy) return;
    download(state.active.blob, filename('png'));
    message(`Exported the current image at ${state.width} × ${state.height} pixels. No interface or labels are included.`);
  }
  const dataURL = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read image data.')); reader.readAsDataURL(blob); });
  async function saveRecipe() {
    if (!state.active || state.busy) return;
    busy(true); progress(0, 'Saving image and passes');
    try {
      const recipe = { application: 'afterimage', ...state.active.recipe, image: await dataURL(state.active.original.blob) };
      const blob = new Blob([JSON.stringify(recipe)], { type: 'application/json' });
      if (blob.size > SAVE_LIMIT) throw new Error('This save exceeds 128 MiB. Export PNG to preserve the current result.');
      download(blob, filename('json')); message('Saved the starting image and applied passes. This file reopens without the original upload.');
    } catch (error) { message(error.message, true); }
    finally { busy(false); }
  }
  function validateRecipe(recipe) {
    if (recipe?.application === 'afterimage' && [1, 2].includes(recipe.version)) throw new Error('Procedural saves belong to the archived version. Open them in archive/2026-11-07_15-47-32/index.html.');
    if (!recipe || recipe.application !== 'afterimage' || recipe.version !== 3 || !Array.isArray(recipe.passes) || recipe.passes.length > 64) throw new Error('Choose an upload-based borkilator settings file (version 3, up to 64 passes).');
    engine.validateUploadSize(recipe.width, recipe.height);
    if (typeof recipe.filename !== 'string' || recipe.filename.length > 1024 || typeof recipe.image !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(recipe.image)) throw new Error('This settings file has invalid starting-image data.');
    for (const settings of recipe.passes) {
      if (!settings || settings.model !== 2 || !Number.isInteger(settings.seed) || settings.seed < 0 || settings.seed > 4294967295) throw new Error('This settings file has an invalid pattern seed or rendering model.');
      for (const [key] of [...signalFields, ...shapeFields]) if (!Number.isFinite(settings[key]) || settings[key] < 0 || settings[key] > 1) throw new Error(`Invalid ${key} setting.`);
    }
    return recipe;
  }
  async function loadRecipe(file) {
    if (!file || state.busy) return;
    busy(true); progress(0, 'Opening saved work');
    try {
      if (file.size > SAVE_LIMIT) throw new Error('Choose a saved file up to 128 MiB.');
      const saved = validateRecipe(JSON.parse(await file.text()));
      const raw = atob(saved.image.split(',')[1]);
      const blob = new Blob([Uint8Array.from(raw, ch => ch.charCodeAt(0))], { type: 'image/png' });
      if (await inspectImage(blob) !== 'png') throw new Error('The embedded image must be PNG.');
      const decoded = await decodeImage(blob);
      if (decoded.width !== saved.width || decoded.height !== saved.height) throw new Error('Saved dimensions do not match the embedded image.');
      const { image, application, ...recipe } = saved;
      let pixels = decoded.pixels, parent = await prepare(pixels, saved.width, saved.height, { ...recipe, passes: [] }, null);
      const staged = [parent];
      for (let i = 0; i < saved.passes.length; i++) {
        pixels = await render('distort', saved.width, saved.height, saved.passes[i], pixels, (v, text) => progress((i + v) / Math.max(1, saved.passes.length), text));
        parent = await prepare(pixels, saved.width, saved.height, { ...recipe, passes: saved.passes.slice(0, i + 1) }, parent);
        staged.push(parent);
        while (staged.length > 2 && (staged.length > 24 || staged.reduce((n, s) => n + s.blob.size, parent.original.blob.size) > 192 * 1024 * 1024)) staged.shift();
      }
      adopt(staged, pixels);
      if (saved.passes.length) writeSignal(saved.passes.at(-1));
      message(`Reopened ${saved.filename} with ${saved.passes.length} applied passes. Earlier session studies remain in History.`);
    } catch (error) { message(`Could not open settings: ${error.message} Your current study is preserved.`, true); }
    finally { busy(false); $('load-recipe').value = ''; }
  }
  $('upload-image').addEventListener('change', e => upload(e.target.files[0]));
  $('apply').addEventListener('click', apply);
  $('export').addEventListener('click', exportPNG); $('save-recipe').addEventListener('click', saveRecipe);
  $('load-recipe').addEventListener('change', e => loadRecipe(e.target.files[0]));
  $('new-pattern').addEventListener('click', () => { $('signal-seed').value = freshSeed(); pending(); });
  $('signal-seed').addEventListener('input', pending);
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    writeSignal({ ...presets[button.dataset.preset], seed: Number($('signal-seed').value) });
    pending('signal'); button.classList.add('selected');
  }));
  $('undo').addEventListener('click', () => { const item = state.history.find(h => h.id === state.active?.parentId); if (item) restore(item, 'undo'); });
  $('redo').addEventListener('click', () => { const item = state.history.find(h => h.id === state.redo.at(-1)); if (item) restore(item, 'redo'); });
  $('view-current').addEventListener('click', () => compare(false)); $('view-original').addEventListener('click', () => compare(true));
  $('zoom').addEventListener('click', () => { state.actualSize = !state.actualSize; $('viewport').classList.toggle('actual-size', state.actualSize); $('zoom').innerHTML = state.actualSize ? '100% <span aria-hidden="true">↙</span>' : 'Fit <span aria-hidden="true">↗</span>'; $('zoom').setAttribute('aria-pressed', state.actualSize); });
  document.addEventListener('keydown', event => {
    if (state.busy || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); $(event.shiftKey ? 'redo' : 'undo').click(); }
  });
  initWorker(); updateButtons();

})();
