(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('artwork'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const engine = window.InkEngine;
  const state = { busy: false, pixels: null, width: 3840, height: 2160, history: [], active: null, originalView: false, actualSize: false, nextId: 1, worker: null, jobs: new Map(), jobId: 0, viewToken: 0, redo: [] };
  const sourceFields = [
    ['coverage', 'Coverage', 57, 'From isolated traces and empty paper to flooded, edge-to-edge coverage.'],
    ['scale', 'Form scale', 62, 'From tiny fragments and dense networks to forms larger than the frame.'],
    ['bleed', 'Bleed', 55, 'From hard-cut boundaries to turbulent spreading and dissolving contours.'],
    ['density', 'Ink load', 68, 'From barely visible traces to saturated, clipped black.'],
    ['texture', 'Paper & pigment', 62, 'From flat, smooth material to coarse grain, torn coverage, and severe pigment breakup.']
  ];
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
  makeSliders($('source-sliders'), 'source', sourceFields);
  makeSliders($('signal-sliders'), 'signal', signalFields);
  makeSliders($('signal-shape-sliders'), 'signal', shapeFields);
  function getFields(prefix, fields) { return Object.fromEntries(fields.map(([key]) => [key, Number($(`${prefix}-${key}`).value) / 100])); }
  function readSeed(id) {
    const value = Number($(id).value);
    if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new Error('Use a whole-number seed between 0 and 4294967295.');
    return value;
  }
  function sourceSettings() { return engine.sourceSettings({ ...getFields('source', sourceFields), structure: $('structure').value, mode: document.querySelector('input[name=mode]:checked').value, seed: readSeed('source-seed') }); }
  function signalSettings() { return engine.signalSettings({ ...getFields('signal', [...signalFields, ...shapeFields]), seed: readSeed('signal-seed') }); }
  function writeFields(prefix, fields, settings) {
    for (const [key] of fields) {
      const value = Math.round(settings[key] * 100);
      $(`${prefix}-${key}`).value = value; $(`${prefix}-${key}-value`).value = value;
      $(`${prefix}-${key}`).style.setProperty('--fill', `${value}%`);
      $(`${prefix}-${key}`).setAttribute('aria-valuetext', `${value} percent`);
    }
  }
  function writeSource(settings) {
    writeFields('source', sourceFields, settings); $('source-seed').value = settings.seed;
    document.querySelector(`input[name=mode][value=${settings.mode}]`).checked = true;
    $('structure').value = settings.structure || 'explore';
    $('lock-seed').checked = true; updateSeedHint();
  }
  function writeSignal(settings) {
    writeFields('signal', [...signalFields, ...shapeFields], settings); $('signal-seed').value = settings.seed;
    document.querySelectorAll('[data-preset]').forEach(el => el.classList.remove('selected'));
  }
  function dimensions() {
    const value = $('resolution').value;
    const [width, height] = value === 'custom' ? [Number($('custom-width').value), Number($('custom-height').value)] : value.split('x').map(Number);
    engine.validateSize(width, height); return { width, height };
  }
  function writeDimensions(width, height) {
    const val = `${width}x${height}`;
    $('resolution').value = [...$('resolution').options].some(o => o.value === val) ? val : 'custom';
    $('custom-width').value = width; $('custom-height').value = height;
    updateSize();
  }
  function updateSize() {
    $('custom-size').hidden = $('resolution').value !== 'custom';
    try {
      const { width, height } = dimensions();
      $('size-summary').textContent = width === 3840 && height === 2160 ? '4K · 16:9' : `${width} × ${height}`;
      if (!state.active) $('image-details').textContent = `${width} × ${height} PX / FULL-RESOLUTION CANVAS`;
    } catch { $('size-summary').textContent = 'Check dimensions'; }
    pending('source');
  }
  function pending(prefix) {
    if (prefix === 'source') $('source-pending').textContent = state.active ? 'Changes take effect on Generate' : 'Ready for a new source';
    else { $('signal-pending').textContent = Number($('signal-mix').value) > 75 ? 'Overdrive · the next pass can clip or invert tones' : 'Settings ready for the next pass'; document.querySelectorAll('[data-preset]').forEach(el => el.classList.remove('selected')); }
  }
  function selectTab(which, focus = false) {
    for (const key of ['source', 'signal']) {
      const selected = which === key;
      $(`${key}-tab`).setAttribute('aria-selected', selected); $(`${key}-tab`).tabIndex = selected ? 0 : -1;
      $(`${key}-panel`).hidden = !selected;
    }
    if (focus) $(`${which}-tab`).focus();
  }
  for (const key of ['source', 'signal']) {
    $(`${key}-tab`).addEventListener('click', () => selectTab(key));
    $(`${key}-tab`).addEventListener('keydown', e => { if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) { e.preventDefault(); selectTab(e.key === 'Home' ? 'source' : e.key === 'End' ? 'signal' : key === 'source' ? 'signal' : 'source', true); } });
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
    return operation === 'generate' ? engine.generate(width, height, settings, report) : engine.distort(input, width, height, settings, report);
  }
  function raster(pixels, width, height) {
    const result = document.createElement('canvas'); result.width = width; result.height = height;
    const c = result.getContext('2d'), image = c.createImageData(width, height);
    for (let p = 0, q = 0; p < pixels.length; p++, q += 4) { const v = pixels[p]; image.data[q] = v; image.data[q + 1] = v; image.data[q + 2] = v; image.data[q + 3] = 255; }
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
    const mode = item.recipe.source.mode === 'wet' ? 'Wet wash' : 'Dry transfer';
    $('study-title').textContent = `${engine.describeSource(item.recipe.source)} · ${mode.toLowerCase()}`;
    $('state-chip').textContent = state.originalView || !item.recipe.passes.length ? 'SOURCE' : `PASS ${String(item.recipe.passes.length).padStart(2, '0')}`;
    $('image-details').textContent = `${item.width} × ${item.height} PX / ${((item.width * item.height) / 1e6).toFixed(1)} MEGAPIXELS`;
    $('image-state').textContent = state.originalView ? 'VIEWING ORIGINAL' : item.recipe.passes.length ? 'CUMULATIVE PASS' : 'UNTOUCHED SOURCE';
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
      const name = document.createElement('span'); name.textContent = item.recipe.passes.length ? `Pass ${String(item.recipe.passes.length).padStart(2, '0')}` : 'Source';
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
  async function commit(pixels, width, height, recipe, parent, original = null) {
    progress(.97, 'Keeping this state');
    const image = raster(pixels, width, height), blob = await toBlob(image);
    const thumbCanvas = document.createElement('canvas'); thumbCanvas.width = 236; thumbCanvas.height = 133;
    const tc = thumbCanvas.getContext('2d'); tc.fillStyle = '#141711'; tc.fillRect(0, 0, 236, 133);
    const scale = Math.min(236 / width, 133 / height); tc.drawImage(image, (236 - width * scale) / 2, (133 - height * scale) / 2, width * scale, height * scale);
    const study = parent ? parent.study : 1 + state.history.reduce((n, h) => Math.max(n, h.study), 0);
    const root = original || parent?.original || { blob, width, height };
    const item = { id: state.nextId++, study, width, height, recipe: structuredClone(recipe), parentId: parent?.id ?? null, blob, thumb: thumbCanvas.toDataURL('image/jpeg', .8), original: root };
    state.history.push(item); state.active = item; state.pixels = pixels; state.width = width; state.height = height; state.originalView = false; state.redo = []; state.viewToken++;
    drawImage(image, width, height); image.width = 1; image.height = 1;
    const trimmed = pruneHistory(); drawHistory(); activeDetails();
    return trimmed;
  }
  function freshSeed() { const values = new Uint32Array(1); crypto.getRandomValues(values); return values[0]; }
  function updateSeedHint() { $('seed-hint').textContent = $('lock-seed').checked ? 'Seed held · adjust settings to refine' : 'Generate explores a fresh seed each time'; }
  async function generate(options = {}) {
    if (state.busy) return;
    let settings, size;
    try {
      settings = sourceSettings(); size = dimensions();
      if (!$('lock-seed').checked && !options.reuseSeed) {
        do { settings.seed = freshSeed(); } while (settings.seed === Number($('source-seed').value));
        $('source-seed').value = settings.seed;
      }
    } catch (error) { message(error.message, true); return; }
    busy(true); progress(0, 'Preparing the paper');
    try {
      const pixels = await render('generate', size.width, size.height, settings);
      const trimmed = await commit(pixels, size.width, size.height, { version: 2, ...size, source: settings, passes: [] }, null);
      $('source-pending').textContent = 'Source generated · settings recorded';
      message(`${engine.describeSource(settings)} · seed ${settings.seed}. ${$('lock-seed').checked ? 'Seed held for refinement.' : 'Generate again to explore another source.'}${trimmed ? ' Older history was trimmed to make room.' : ''}`);
    } catch (error) { message(error.message || 'The image could not be generated. Your previous state is preserved.', true); }
    finally { busy(false); }
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
      const recipe = { ...parent.recipe, version: 2, passes: [...parent.recipe.passes, settings] };
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
      state.pixels = new Uint8ClampedArray(item.width * item.height);
      for (let p = 0; p < state.pixels.length; p++) state.pixels[p] = rgba[p * 4];
      state.active = item; state.width = item.width; state.height = item.height; state.originalView = false; state.viewToken++;
      if (kind === 'undo') state.redo.push(previous.id); else if (kind === 'redo') state.redo.pop(); else state.redo = [];
      writeSource(item.recipe.source); writeDimensions(item.width, item.height);
      if (item.recipe.passes.length) writeSignal(item.recipe.passes.at(-1));
      $('source-pending').textContent = 'Settings restored from this state';
      $('signal-pending').textContent = 'Ready to continue from this state';
      drawHistory(); activeDetails(); message(`Returned to study ${item.study}, ${item.recipe.passes.length ? `pass ${item.recipe.passes.length}` : 'the source'}. The next pass will build from here.`);
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
      message(original ? 'Viewing the untouched source. Apply pass and Export PNG still use your current result.' : 'Viewing the current result.');
    } catch (error) { message(error.message, true); }
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function filename(ext) { const a = state.active; return `afterimage-${a.recipe.source.mode}-${a.recipe.source.seed}-pass-${String(a.recipe.passes.length).padStart(2, '0')}-${a.width}x${a.height}.${ext}`; }
  function exportPNG() {
    if (!state.active || state.busy) return;
    download(state.active.blob, filename('png'));
    message(`Exported the current image at ${state.width} × ${state.height} pixels. No interface or labels are included.`);
  }
  function saveRecipe() {
    if (!state.active || state.busy) return;
    download(new Blob([JSON.stringify({ application: 'afterimage', ...state.active.recipe }, null, 2)], { type: 'application/json' }), filename('json'));
    message('Saved the source and applied passes. Open these settings to recreate this result at the same resolution.');
  }
  function validateRecipe(recipe) {
    if (!recipe || recipe.application !== 'afterimage' || ![1, 2].includes(recipe.version) || !recipe.source || !Array.isArray(recipe.passes) || recipe.passes.length > 64) throw new Error('Choose an Afterimage settings file (version 1 or 2, up to 64 passes).');
    engine.validateSize(recipe.width, recipe.height);
    if (!['wet', 'dry'].includes(recipe.source.mode)) throw new Error('The source material in this settings file is not recognized.');
    for (const [settings, fields] of [[recipe.source, sourceFields], ...recipe.passes.map(s => [s, [...signalFields, ...shapeFields]])]) {
      if (!settings || !Number.isInteger(settings.seed) || settings.seed < 0 || settings.seed > 4294967295) throw new Error('The settings file has an invalid seed.');
      for (const [key] of fields) if (!Number.isFinite(settings[key]) || settings[key] < 0 || settings[key] > 1) throw new Error(`The settings file has an invalid ${key} value.`);
    }
    const fallbackModel = recipe.version === 1 ? 1 : 2;
    const withModel = settings => {
      const model = settings.model ?? fallbackModel;
      if (![1, 2].includes(model)) throw new Error('This settings file uses an unknown rendering model.');
      return { ...settings, model };
    };
    if (recipe.source.structure && recipe.source.structure !== 'explore' && !Object.hasOwn(engine.structures, recipe.source.structure)) throw new Error('This source structure is not recognized.');
    return { version: recipe.version, width: recipe.width, height: recipe.height, source: engine.sourceSettings(withModel(recipe.source)), passes: recipe.passes.map(s => engine.signalSettings(withModel(s))) };
  }
  async function loadRecipe(file) {
    if (!file || state.busy) return;
    let recipe;
    try { if (file.size > 1e6) throw new Error('This settings file is too large. Choose a saved Afterimage JSON file.'); recipe = validateRecipe(JSON.parse(await file.text())); }
    catch (error) { $('load-recipe').value = ''; message(`Could not open settings: ${error.message}`, true); return; }
    busy(true);
    try {
      const total = 1 + recipe.passes.length;
      const report = step => (value, text) => progress((step + value) / total * .95, `${text}${total > 1 ? ` · ${step + 1}/${total}` : ''}`);
      let pixels = await render('generate', recipe.width, recipe.height, recipe.source, null, report(0));
      await commit(pixels, recipe.width, recipe.height, { ...recipe, passes: [] }, null);
      for (let i = 0; i < recipe.passes.length; i++) {
        pixels = await render('distort', recipe.width, recipe.height, recipe.passes[i], pixels, report(i + 1));
        await commit(pixels, recipe.width, recipe.height, { ...recipe, passes: recipe.passes.slice(0, i + 1) }, state.active);
      }
      writeSource(recipe.source); writeDimensions(recipe.width, recipe.height);
      if (recipe.passes.length) writeSignal(recipe.passes.at(-1));
      message(`Recreated a ${recipe.width} × ${recipe.height} study with ${recipe.passes.length} applied passes. Earlier session images remain in History.`);
    } catch (error) { message(`Could not recreate this study: ${error.message}`, true); }
    finally { busy(false); $('load-recipe').value = ''; }
  }
  $('generate').addEventListener('click', generate); $('apply').addEventListener('click', apply);
  $('export').addEventListener('click', exportPNG); $('save-recipe').addEventListener('click', saveRecipe);
  $('load-recipe').addEventListener('change', e => loadRecipe(e.target.files[0]));
  $('resolution').addEventListener('change', updateSize);
  for (const id of ['custom-width', 'custom-height']) $(id).addEventListener('change', updateSize);
  document.querySelectorAll('input[name=mode]').forEach(el => el.addEventListener('change', () => pending('source')));
  $('structure').addEventListener('change', () => pending('source'));
  $('lock-seed').addEventListener('change', updateSeedHint);
  for (const [button, input, prefix] of [['new-seed', 'source-seed', 'source'], ['new-pattern', 'signal-seed', 'signal']]) {
    const holdSource = () => { if (prefix === 'source') { $('lock-seed').checked = true; updateSeedHint(); } };
    $(button).addEventListener('click', () => { $(input).value = freshSeed(); holdSource(); pending(prefix); });
    $(input).addEventListener('input', () => { holdSource(); pending(prefix); });
  }
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
  // A first full-resolution source is rendered on opening; all later renders are explicit.
  setTimeout(() => generate({ reuseSeed: true }), 100);
})();
