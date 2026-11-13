/*
 * BORKILATOR | THE CONTROLLER
 *
 * INTRODUCTION
 * This file tells the story of a session: upload an image, prepare global distortion
 * settings, explicitly borkilate, inspect the result, and preserve useful directions.
 * It coordinates the interface; engine.js performs the pixel math. Nothing here draws
 * with a brush or runs an evolving animation.
 *
 * A useful distinction runs through the book: the controls describe the NEXT
 * operation; state.pixels holds the CURRENT working result; the visible canvas can
 * temporarily show the ORIGINAL for comparison. History stores PNG snapshots, and a
 * recipe stores the starting image plus ordered settings needed to reconstruct a
 * result.
 *
 * READING THIS FILE
 * Search for "CHAPTER " followed by an ID to land on its heading, rather than its
 * table-of-contents entry. IDs stay useful when added comments change line numbers.
 * These are explanatory comments: the executable code still runs.
 *
 * ANNOTATED TABLE OF CONTENTS
 * BORK-APP-01 — Meet the controller. Connect HTML elements to shared session state and
 * control definitions
 * BORK-APP-02 — Build and read the instrument. Create paired sliders and numeric
 * fields, normalize percentages, and prepare settings
 * BORK-APP-03 — Keep the interface honest. Enable actions appropriately and report
 * progress
 * BORK-APP-04 — Send a render into the background. Match worker responses to promises
 * and fall back to the same engine locally
 * BORK-APP-05 — Translate pixels into visible images. Bridge raw RGBA arrays, Canvas,
 * PNG blobs, and decoded bitmaps
 * BORK-APP-06 — Remember a study. Prepare snapshots, draw history, and commit
 * completed work
 * BORK-APP-07 — Welcome an uploaded image. Inspect file signatures, confirm large-
 * image reduction, and start an untouched study
 * BORK-APP-08 — Borkilate deliberately. Process the current image once and append a
 * recoverable pass
 * BORK-APP-09 — Travel and compare. Restore history states and switch the preview
 * without changing the working pixels
 * BORK-APP-10 — Keep work on disk. Download a finished PNG or a self-contained
 * starting-image-and-passes recipe
 * BORK-APP-11 — Reconstruct saved work. Validate imports and stage every replayed pass
 * before adoption
 * BORK-APP-12 — Wire gestures to actions. Register click/change/keyboard handlers and
 * finish startup
 *
 * Suggested route: start with index.html (the book’s front door), read this
 * controller, then jump to engine.js at BORK-ENG-04 for the active color-image
 * pipeline. worker.js explains background execution; style.css explains appearance.
 * Tests are separate verification scripts, not part of browser startup.
 */
(function () {
  'use strict';
  /*
   * CHAPTER BORK-APP-01 | Meet the controller
   *
   * We first gather the references and memory the rest of the controller shares. The
   * enclosing function runs immediately and keeps these names private. "use strict"
   * asks JavaScript to reject some otherwise silent mistakes. Functions declared below
   * are available to earlier code through JavaScript function hoisting.
   */
  const $ = id => document.getElementById(id);
  /*
   * The dollar sign is just our short function name, not a library. $("artwork") finds
   * the HTML element whose id is artwork. The Canvas context supplies drawing and
   * pixel-reading methods. willReadFrequently hints that this app repeatedly brings
   * pixels back into JavaScript.
   */
  const canvas = $('artwork'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const engine = window.InkEngine;
  /*
   * This object is the session’s memory. pixels starts null: 3840 × 2160 is an empty-
   * canvas placeholder, not an instruction to enlarge uploads. width/height become the
   * actual imported dimensions.
   *
   * history is a list of retained snapshots; active points at the selected one.
   * parentId on each snapshot records ancestry, so history can contain branches. redo
   * holds IDs to revisit after Undo. originalView and actualSize describe viewing
   * choices.
   *
   * busy prevents overlapping operations. nextId labels snapshots; jobId labels worker
   * requests; jobs maps requests to waiting promises. viewToken invalidates old
   * asynchronous preview requests when the user makes a newer choice. None of this is
   * automatic disk storage.
   */
  const state = {
    busy: false,
    pixels: null,
    width: 3840,
    height: 2160,
    history: [],
    active: null,
    originalView: false,
    actualSize: false,
    nextId: 1,
    worker: null,
    jobs: new Map(),
    jobId: 0,
    viewToken: 0,
    redo: []
  };
  /*
   * Each array entry is [internal key, visible label, initial percentage, help text].
   * These definitions generate the UI and later tell us which settings to read and
   * validate. Cosmic coverage is a chance of replacing one RGB channel, not a strength
   * applied to all channels.
   */
  const signalFields = [
    [
      'pull',
      'Vertical pull',
      25,
      'Stretch fragments of columns into long vertical traces.'
    ],
    [
      'shift',
      'Band shift',
      0,
      'Displace horizontal bands of the image.'
    ],
    [
      'slip',
      'Data slip',
      0,
      'Offset blocks in the image’s sequence of pixel values.'
    ],
    [
      'sort',
      'Pixel sort',
      0,
      'Reorder column segments from light to dark.'
    ],
    [
      'weave',
      'Digital weave',
      0,
      'Introduce interrupted columns of checks and encoded-looking bars.'
    ],
    [
      'crush',
      'Tone crush',
      0,
      'Reduce tonal steps and push contrast.'
    ],
    [
      'grain',
      'Signal noise',
      0,
      'From a trace of grain to overwhelming, clipped static.'
    ],
    [
      'cosmic',
      'Cosmic particle',
      0,
      'Percentage of pixels targeted. Each hit replaces one random RGB channel; transparency is preserved.'
    ]
  ];
  /*
   * Fragment scale and Pass mix shape the operation rather than introducing a separate
   * effect. The UI uses 0–100; the engine uses 0–1. At mix .75 the processed result is
   * fully used; larger values overdrive the difference.
   */
  const shapeFields = [
    [
      'scale',
      'Fragment scale',
      35,
      'From individual pixels to fragments occupying much of the frame.'
    ],
    [
      'mix',
      'Pass mix',
      60,
      '0: original. 75: full processed result. Above 75: overdrive with tonal clipping and possible inversion.'
    ]
  ];
  /*
   * Presets are named bundles of normalized values. Selecting one only writes
   * controls; it never processes pixels. Clear prepares zero distortion and does not
   * undo the current image. The current Pattern seed is supplied separately when the
   * preset is selected.
   */
  const presets = {
    dragged: {
      cosmic: 0,
      pull: .67,
      shift: .06,
      slip: 0,
      sort: .36,
      weave: 0,
      crush: .08,
      grain: .08,
      scale: .24,
      mix: .70
    },
    fractured: {
      cosmic: 0,
      pull: .12,
      shift: .53,
      slip: .42,
      sort: .14,
      weave: .08,
      crush: .24,
      grain: .08,
      scale: .42,
      mix: .72
    },
    encoded: {
      cosmic: 0,
      pull: .14,
      shift: .12,
      slip: .06,
      sort: 0,
      weave: .71,
      crush: .48,
      grain: 0,
      scale: .3,
      mix: .68
    },
    clear: {
      cosmic: 0,
      pull: 0,
      shift: 0,
      slip: 0,
      sort: 0,
      weave: 0,
      crush: 0,
      grain: 0,
      scale: .35,
      mix: .60
    }
  };
  /*
   * CHAPTER BORK-APP-02 | Build and read the instrument
   *
   * Here the declarative field lists become actual HTML controls. Reading and writing
   * settings is kept separate from applying them: the instrument waits for an explicit
   * borkilate. Watch how a key such as cosmic becomes signal-cosmic in the DOM and
   * cosmic in the settings object.
   */
  function message(text, error = false) {
    $('message').textContent = text;
    $('message').classList.toggle('error', error);
  }
  /*
   * message writes plain text to the live status area and toggles its error styling.
   * makeSliders builds one wrapper, label, number field, and range input per
   * definition. Destructuring [key, label, value, tip] gives readable names to the
   * four array positions.
   */
  function makeSliders(container, prefix, fields) {
    for (const [key, label, value, tip] of fields) {
      const div = document.createElement('div');
      div.className = 'slider';
      const top = document.createElement('div');
      top.className = 'slider-top';
      const text = document.createElement('label');
      text.htmlFor = `${ prefix }-${ key }`;
      text.title = tip;
      text.textContent = label;
      /*
       * The label’s htmlFor points to the range’s id. A separate aria-label names the
       * numeric field for assistive technology. Both inputs represent the same
       * percentage; the pair is a convenience for dragging or entering a precise
       * number.
       */
      const numeric = document.createElement('input');
      numeric.type = 'number';
      numeric.className = 'value-input';
      numeric.min = '0';
      numeric.max = '100';
      numeric.step = '1';
      numeric.value = value;
      numeric.id = `${ prefix }-${ key }-value`;
      numeric.setAttribute('aria-label', `${ label } percentage`);
      const range = document.createElement('input');
      range.type = 'range';
      range.min = '0';
      range.max = '100';
      range.step = '1';
      range.value = value;
      range.id = `${ prefix }-${ key }`;
      range.title = tip;
      /*
       * A small nested function remembers this pair of inputs (a closure). It converts
       * text to a number, substitutes zero for unusable/falsy numeric input, clamps to
       * 0–100, and updates both fields. --fill is a CSS custom property used to paint
       * the track; aria-valuetext supplies a spoken percentage. pending changes only
       * the explanatory UI.
       */
      const sync = (from, to) => {
        const n = Math.max(0, Math.min(100, Number(from.value) || 0));
        from.value = n;
        to.value = n;
        range.style.setProperty('--fill', `${ n }%`);
        range.setAttribute('aria-valuetext', `${ n } percent`);
        pending(prefix);
      };
      /*
       * addEventListener registers work to run later. Dragging emits input events
       * repeatedly; the number field synchronizes on change. The arrow functions
       * capture the matching range and numeric fields for this particular slider.
       */
      range.addEventListener('input', () => sync(range, numeric));
      numeric.addEventListener('change', () => sync(numeric, range));
      range.style.setProperty('--fill', `${ value }%`);
      range.setAttribute('aria-valuetext', `${ value } percent`);
      top.append(text, numeric);
      div.append(top, range);
      if (prefix === 'signal' && key === 'mix') {
        const note = document.createElement('p');
        note.className = 'slider-note';
        note.textContent = '75 = full signal · 100 = overdrive';
        div.append(note);
      }
      container.append(div);
    }
  }
  /*
   * These calls run during startup. The empty containers in index.html acquire all
   * their slider elements here, which is why the HTML does not contain eight
   * handwritten effect inputs.
   */
  makeSliders($('signal-sliders'), 'signal', signalFields);
  makeSliders($('signal-shape-sliders'), 'signal', shapeFields);
  /*
   * map turns each field key into a [key, value] pair; Object.fromEntries turns those
   * pairs into an object. Dividing by 100 converts, for example, UI 25 to engine .25.
   * Backticks construct IDs with embedded values.
   */
  function getFields(prefix, fields) {
    return Object.fromEntries(fields.map(([key]) => [
      key,
      Number($(`${ prefix }-${ key }`).value) / 100
    ]));
  }
  /*
   * A seed is a repeatable pattern identifier, constrained to an unsigned 32-bit
   * integer. It does not measure effect strength. Throwing an Error stops the current
   * action and lets its caller show a useful message.
   */
  function readSeed(id) {
    const value = Number($(id).value);
    if (!Number.isInteger(value) || value < 0 || value > 4294967295)
      throw new Error('Use a whole-number seed between 0 and 4294967295.');
    return value;
  }
  /*
   * The spread syntax (...) merges effect values, shape values, and seed into one
   * object. engine.signalSettings fills defaults and attaches the rendering model.
   * This controller wrapper reads the UI; the same-named engine function normalizes
   * supplied settings.
   */
  function signalSettings() {
    return engine.signalSettings({
      ...getFields('signal', [
        ...signalFields,
        ...shapeFields
      ]),
      seed: readSeed('signal-seed')
    });
  }
  /*
   * Writing reverses reading: normalized fractions become rounded percentages, both
   * input widgets update, and visual/spoken state stays aligned. writeSignal also
   * restores the seed and clears preset highlighting because a restored pass need not
   * exactly match a named preset.
   */
  function writeFields(prefix, fields, settings) {
    for (const [key] of fields) {
      const value = Math.round(settings[key] * 100);
      $(`${ prefix }-${ key }`).value = value;
      $(`${ prefix }-${ key }-value`).value = value;
      $(`${ prefix }-${ key }`).style.setProperty('--fill', `${ value }%`);
      $(`${ prefix }-${ key }`).setAttribute('aria-valuetext', `${ value } percent`);
    }
  }
  function writeSignal(settings) {
    settings = engine.signalSettings(settings);
    writeFields('signal', [
      ...signalFields,
      ...shapeFields
    ], settings);
    $('signal-seed').value = settings.seed;
    document.querySelectorAll('[data-preset]').forEach(el => el.classList.remove('selected'));
  }
  /*
   * Every manual edit means the next pass is prepared. It can also change the
   * overdrive message. There is deliberately no call to render, apply, or commit here.
   */
  function pending() {
    $('signal-pending').textContent = Number($('signal-mix').value) > 75 ? 'Overdrive · the next pass can clip or invert tones' : 'Settings ready for the next pass';
    document.querySelectorAll('[data-preset]').forEach(el => el.classList.remove('selected'));
  }
  /*
   * CHAPTER BORK-APP-03 | Keep the interface honest
   *
   * A button must reflect whether the action is available. Without an active study
   * there is nothing to export, compare, or distort. During asynchronous work we
   * disable actions to prevent two operations from racing to replace the same state.
   * Progress is a UI report, not a separate image-processing loop.
   */
  function updateButtons() {
    /*
     * The || operators short-circuit: if unavailable is true, JavaScript never
     * evaluates state.active.parentId on the Undo line. Undo also requires a retained
     * parent, since memory pruning may remove older snapshots. Redo requires a stored
     * return path.
     */
    const unavailable = state.busy || !state.active;
    for (const id of [
        'apply',
        'export',
        'save-recipe',
        'view-current',
        'view-original',
        'zoom'
      ])
      $(id).disabled = unavailable;
    $('undo').disabled = unavailable || state.active.parentId === null || !state.history.some(h => h.id === state.active.parentId);
    $('redo').disabled = unavailable || !state.redo.length;
    $('view-current').classList.toggle('active', !state.originalView);
    $('view-original').classList.toggle('active', state.originalView);
    $('view-current').setAttribute('aria-pressed', !state.originalView);
    $('view-original').setAttribute('aria-pressed', state.originalView);
  }
  /*
   * busy updates the session flag, disables form controls, shows/hides the overlay,
   * and declares aria-busy. updateButtons then restores more specific availability
   * rules. askResize later deliberately re-enables its own modal buttons while the
   * main UI stays busy.
   */
  function busy(value) {
    state.busy = value;
    document.querySelectorAll('button, input, select').forEach(el => {
      el.disabled = value;
    });
    $('render-overlay').hidden = !value;
    $('viewport').setAttribute('aria-busy', value);
    if (value) {
      $('render-progress').value = 0;
      $('render-percent').textContent = '0%';
    }
    updateButtons();
  }
  function progress(value, text) {
    $('render-progress').value = value;
    $('render-percent').textContent = `${ Math.round(value * 100) }%`;
    $('render-label').textContent = text;
  }
  /*
   * CHAPTER BORK-APP-04 | Send a render into the background
   *
   * Pixel processing can take time. Under HTTP we try a Web Worker, a separate
   * JavaScript context defined in worker.js. A local file uses the same engine on the
   * main thread, whose periodic pauses give the browser opportunities to respond.
   * Promises represent results that arrive later; await pauses this function’s
   * continuation, not the whole browser.
   */
  function initWorker() {
    if (location.protocol === 'file:')
      return;
    try {
      const worker = new Worker('worker.js');
      /*
       * Each worker message carries a request id. The jobs Map retrieves its promise
       * callbacks. Progress leaves the job waiting; a result or reported error removes
       * it and settles the promise. Unknown IDs are ignored.
       */
      worker.onmessage = ({data}) => {
        const job = state.jobs.get(data.id);
        if (!job)
          return;
        if ('progress' in data)
          job.progress(data.progress, data.message);
        else {
          state.jobs.delete(data.id);
          data.error ? job.reject(new Error(data.error)) : job.resolve(new Uint8ClampedArray(data.result));
        }
      };
      /*
       * A worker infrastructure failure terminates that worker, marks outstanding jobs
       * as eligible for fallback, and empties the registry. A normal engine error
       * reported in a message is different: it is surfaced rather than silently
       * retried.
       */
      worker.onerror = () => {
        worker.terminate();
        state.worker = null;
        for (const job of state.jobs.values())
          job.reject(Object.assign(new Error('Background rendering unavailable.'), { fallback: true }));
        state.jobs.clear();
      };
      state.worker = worker;
    } catch {
      state.worker = null;
    }
  }
  /*
   * render hides the choice of execution environment from apply and recipe replay.
   * report defaults to the normal progress UI, but replay can supply a callback that
   * maps one pass’s progress into the whole sequence.
   */
  async function render(operation, width, height, settings, input, report = progress) {
    if (state.worker) {
      try {
        return await new Promise((resolve, reject) => {
          /*
           * Transferable ArrayBuffers move ownership to the worker. We first slice a
           * copy, preserving state.pixels in the main thread for comparison, recovery,
           * and further passes. The posted operation and dimensions are a small
           * message; pixels is the large payload.
           */
          const id = ++state.jobId, pixels = input ? input.slice().buffer : undefined;
          state.jobs.set(id, {
            resolve,
            reject,
            progress: report
          });
          state.worker.postMessage({
            id,
            operation,
            width,
            height,
            settings,
            pixels
          }, pixels ? [pixels] : []);
        });
      } catch (error) {
        if (!error.fallback)
          throw error;
      }
    }
    return engine.distortRGBA(input, width, height, settings, report);
  }
  /*
   * CHAPTER BORK-APP-05 | Translate pixels into visible images
   *
   * Our working image has several representations. A Uint8ClampedArray holds bytes in
   * R,G,B,A order for every pixel. Canvas accepts ImageData for drawing. A Blob holds
   * encoded PNG bytes for history/export. A decoded bitmap is a browser image we can
   * draw back onto Canvas. These helpers bridge the representations without adding
   * interface labels to the artwork.
   */
  function raster(pixels, width, height) {
    const result = document.createElement('canvas');
    result.width = width;
    result.height = height;
    const c = result.getContext('2d'), image = c.createImageData(width, height);
    image.data.set(pixels);
    c.putImageData(image, 0, 0);
    return result;
  }
  /*
   * toBlob wraps Canvas’s callback API in a promise, explicitly requests lossless PNG,
   * and rejects if encoding fails. bitmap does the reverse with createImageBitmap
   * where available, or an Image and temporary object URL. Object URLs are browser
   * references to local bytes, not remote uploads.
   */
  const toBlob = c => new Promise((resolve, reject) => c.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode the image. Try a smaller output size.')), 'image/png'));
  async function bitmap(blob) {
    if (typeof createImageBitmap === 'function')
      return createImageBitmap(blob);
    return new Promise((resolve, reject) => {
      const image = new Image(), url = URL.createObjectURL(blob);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read the saved image.'));
      };
      image.src = url;
    });
  }
  /*
   * Setting canvas dimensions resets its drawing surface, then drawImage paints the
   * decoded image at its native size. CSS handles the scaled preview. This helper
   * changes what is visible; callers separately decide whether working session state
   * changes.
   */
  function drawImage(image, width, height) {
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0);
    canvas.hidden = false;
    $('empty').hidden = true;
  }
  /*
   * CHAPTER BORK-APP-06 | Remember a study
   *
   * A history state is more than a thumbnail: it contains full dimensions, a lossless
   * PNG, the cumulative recipe, an original-image reference, and a parent ID. The
   * important boundary is prepare versus adopt. Preparation can fail while old work is
   * still active; adoption makes completed results visible.
   */
  function activeDetails() {
    const item = state.active;
    if (!item)
      return;
    $('study-title').textContent = item.recipe.filename;
    $('state-chip').textContent = state.originalView || !item.recipe.passes.length ? 'IMAGE' : `PASS ${ String(item.recipe.passes.length).padStart(2, '0') }`;
    $('image-details').textContent = `${ item.width } × ${ item.height } PX / ${ (item.width * item.height / 1e6).toFixed(1) } MEGAPIXELS`;
    $('image-state').textContent = state.originalView ? 'VIEWING ORIGINAL' : item.recipe.passes.length ? 'CUMULATIVE PASS' : 'UNTOUCHED UPLOAD';
    updateButtons();
  }
  /*
   * Snapshots in one study share an original Blob. A Set counts each Blob object once
   * for an approximate compressed-byte budget. This is not total browser RAM: raw RGBA
   * arrays and Canvas surfaces consume additional memory.
   */
  function historyBytes() {
    const blobs = new Set();
    for (const item of state.history) {
      blobs.add(item.blob);
      blobs.add(item.original.blob);
    }
    return [...blobs].reduce((n, b) => n + b.size, 0);
  }
  /*
   * Trim oldest non-active entries until within 24 states and about 192 MiB, or until
   * only two entries remain. Thus these limits are a retention policy rather than an
   * absolute memory ceiling. Remove Redo IDs whose targets were trimmed. The active
   * original stays reachable through its snapshot.
   */
  function pruneHistory() {
    let trimmed = false;
    while ((state.history.length > 24 || historyBytes() > 192 * 1024 * 1024) && state.history.length > 2) {
      const index = state.history.findIndex(item => item.id !== state.active.id);
      state.history.splice(index, 1);
      trimmed = true;
    }
    state.redo = state.redo.filter(id => state.history.some(h => h.id === id));
    return trimmed;
  }
  /*
   * Rebuild the thumbnail strip from retained history. Text is assigned with
   * textContent, so an uploaded filename or label is treated as text. Each button
   * closes over its item and restores that exact state. The last block scrolls the
   * current thumbnail into the visible strip.
   */
  function drawHistory() {
    const list = $('history-list');
    list.replaceChildren();
    $('history-count').textContent = String(state.history.length).padStart(2, '0');
    for (const item of state.history) {
      const button = document.createElement('button');
      button.className = 'history-item';
      button.setAttribute('aria-current', item.id === state.active?.id ? 'true' : 'false');
      button.disabled = state.busy;
      button.title = `Study ${ item.study }, ${ item.recipe.passes.length ? `pass ${ item.recipe.passes.length }` : 'original' } · ${ item.width } × ${ item.height }`;
      const img = document.createElement('img');
      img.src = item.thumb;
      img.alt = '';
      img.width = 118;
      img.height = 66;
      const label = document.createElement('span');
      label.className = 'history-label';
      const name = document.createElement('span');
      name.textContent = item.recipe.passes.length ? `Pass ${ String(item.recipe.passes.length).padStart(2, '0') }` : 'Upload';
      const number = document.createElement('span');
      number.textContent = `${ String(item.study).padStart(2, '0') } / ${ String(item.id).padStart(2, '0') }`;
      label.append(name, number);
      button.append(img, label);
      button.addEventListener('click', () => restore(item));
      list.append(button);
    }
    const active = list.querySelector('[aria-current=true]');
    if (active) {
      const left = active.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
      if (left < list.scrollLeft)
        list.scrollLeft = left;
      else if (left + active.offsetWidth > list.scrollLeft + list.clientWidth)
        list.scrollLeft = left + active.offsetWidth - list.clientWidth;
    }
  }
  /*
   * prepare encodes a full PNG and a smaller JPEG thumbnail. The thumbnail is
   * letterboxed against gray; it is only navigation, never an export source. A
   * snapshot clones the recipe so later edits cannot rewrite its earlier pass list.
   * parent supplies study identity, ancestry, and the shared original.
   */
  async function prepare(pixels, width, height, recipe, parent, original = null) {
    progress(.97, 'Keeping this state');
    const image = raster(pixels, width, height), blob = await toBlob(image);
    const thumb = document.createElement('canvas');
    thumb.width = 236;
    thumb.height = 133;
    const tc = thumb.getContext('2d');
    tc.fillStyle = '#aaa';
    tc.fillRect(0, 0, 236, 133);
    const scale = Math.min(236 / width, 133 / height);
    tc.drawImage(image, (236 - width * scale) / 2, (133 - height * scale) / 2, width * scale, height * scale);
    const thumbnail = thumb.toDataURL('image/jpeg', .8);
    image.width = 1;
    image.height = 1;
    /*
     * The ?? operator uses null only when the parent ID is absent; ?. safely reads a
     * property if its owner exists. An upload has no parent and creates an original
     * reference to its own PNG. A pass inherits that original even when history
     * branches.
     */
    return {
      id: state.nextId++,
      study: parent ? parent.study : 1 + state.history.reduce((n, h) => Math.max(n, h.study), 0),
      width,
      height,
      recipe: structuredClone(recipe),
      parentId: parent?.id ?? null,
      blob,
      thumb: thumbnail,
      original: original || parent?.original || {
        blob,
        width,
        height
      }
    };
  }
  /*
   * adopt takes a prepared sequence (one state for an ordinary pass; several for
   * replay). It draws the last result, installs pixels/dimensions, clears Redo,
   * invalidates stale comparison requests, prunes history, and refreshes labels.
   * prepare may consume IDs even if later work fails; IDs are identifiers, not
   * promises of a gapless count.
   */
  function adopt(items, pixels) {
    const item = items.at(-1);
    // All decoding, processing and encoding completes before this visible commit.
    const image = raster(pixels, item.width, item.height);
    drawImage(image, item.width, item.height);
    image.width = 1;
    image.height = 1;
    state.history.push(...items);
    state.active = item;
    state.pixels = pixels;
    state.width = item.width;
    state.height = item.height;
    state.originalView = false;
    state.redo = [];
    state.viewToken++;
    const trimmed = pruneHistory();
    drawHistory();
    activeDetails();
    return trimmed;
  }
  /*
   * commit is the common single-state path: finish preparation first, then adopt. The
   * temporary canvases are shrunk after use to release their large backing surfaces
   * for browser memory management.
   */
  async function commit(pixels, width, height, recipe, parent) {
    return adopt([await prepare(pixels, width, height, recipe, parent)], pixels);
  }
  /*
   * CHAPTER BORK-APP-07 | Welcome an uploaded image
   *
   * An upload starts with the supplied image untouched, regardless of prepared
   * effects. The browser decodes actual image data; before that we inspect signatures
   * and animation markers. Large images offer an explicit proportional reduction, and
   * cancellation leaves the current study in place. File limits below are binary MiB
   * (1024 × 1024 bytes).
   */
  function freshSeed() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0];
  }
  const UPLOAD_LIMIT = 100 * 1024 * 1024, SAVE_LIMIT = 128 * 1024 * 1024;
  /*
   * freshSeed uses browser-provided random integers for a new pattern choice.
   * inspectImage then checks bytes rather than trusting a filename extension or MIME
   * label. Uint8Array exposes bytes; DataView reads multi-byte chunk lengths in the
   * required byte order. The browser decoder remains responsible for decoding the
   * complete image.
   */
  async function inspectImage(blob) {
    if (blob.size > UPLOAD_LIMIT)
      throw new Error('Choose an image up to 100 MiB.');
    const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer);
    const text = (start, count) => String.fromCharCode(...bytes.subarray(start, start + count));
    let kind = '';
    /*
     * PNG begins with an eight-byte signature. Walk its length/type/data/CRC chunks
     * and reject acTL, the animated-PNG marker. The bounds check rejects a chunk
     * claiming more bytes than remain. This is format screening, not a full PNG
     * validator.
     */
    if (bytes.length >= 24 && text(0, 8) === '\x89PNG\r\n\x1a\n') {
      kind = 'png';
      for (let i = 8; i + 12 <= bytes.length;) {
        const n = view.getUint32(i);
        if (n > bytes.length - i - 12)
          throw new Error('This PNG file is incomplete.');
        if (text(i + 4, 4) === 'acTL')
          throw new Error('Animated images are not supported. Choose a still PNG, JPEG, or WebP.');
        i += 12 + n;
      }
    } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
      kind = 'jpeg';
      /*
       * JPEG is recognized by its leading marker bytes. WebP uses RIFF chunks; lengths
       * are little-endian and odd chunks have a padding byte. Animation tags or the VP8X
       * animation flag are rejected. A still image is required because a recipe has one
       * starting raster.
       */
    else if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
      kind = 'webp';
      for (let i = 12; i + 8 <= bytes.length;) {
        const n = view.getUint32(i + 4, true), tag = text(i, 4);
        if (n > bytes.length - i - 8)
          throw new Error('This WebP file is incomplete.');
        if (tag === 'ANIM' || tag === 'ANMF' || tag === 'VP8X' && bytes[i + 8] & 2)
          throw new Error('Animated images are not supported. Choose a still image.');
        i += 8 + n + n % 2;
      }
    }
    if (!kind)
      throw new Error('Choose a still PNG, JPEG, or WebP image.');
    return kind;
  }
  /*
   * showModal opens the dialog from index.html. Its form uses method="dialog", so
   * button values become returnValue. A once-only close listener resolves true only
   * for Resize; Cancel or dismissal resolves false. The original file on disk is never
   * modified.
   */
  function askResize(width, height, w, h) {
    const dialog = $('resize-dialog');
    $('resize-description').textContent = `This image is ${ width } × ${ height }. Import a proportional ${ w } × ${ h } copy? Your file on disk stays unchanged.`;
    return new Promise(resolve => {
      dialog.returnValue = 'cancel';
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'resize'), { once: true });
      // Modal controls must remain available while the rest of the app is busy.
      dialog.querySelectorAll('button').forEach(b => {
        b.disabled = false;
      });
      dialog.showModal();
    });
  }
  /*
   * Decode first so dimensions come from the image, not a claimed filename. The
   * minimum scale factor enforces both side limits and total pixel count. Including 1
   * prevents upscaling. Saved recipes cannot silently resize because that would change
   * their replay.
   */
  async function decodeImage(blob, allowResize = false) {
    const image = await bitmap(blob);
    try {
      let width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
      if (!width || !height)
        throw new Error('This image has no readable dimensions.');
      /*
       * sqrt(pixelLimit / area) is necessary because multiplying both dimensions by a
       * factor multiplies area by its square. Flooring the proposed dimensions keeps
       * them within limits while approximately retaining aspect ratio.
       */
      const factor = Math.min(1, 8192 / width, 8192 / height, Math.sqrt(16777216 / (width * height)));
      if (factor < 1) {
        const w = Math.max(1, Math.floor(width * factor)), h = Math.max(1, Math.floor(height * factor));
        if (!allowResize)
          throw new Error('The saved image exceeds processing limits.');
        if (!await askResize(width, height, w, h))
          return null;
        width = w;
        height = h;
      }
      engine.validateUploadSize(width, height);
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const context = c.getContext('2d', { willReadFrequently: true });
      /*
       * Canvas draws the decoded image at accepted working dimensions, then
       * getImageData extracts a new RGBA array. finally closes a bitmap even after an
       * error or cancelled resize; ?. accommodates the fallback Image, which has no
       * close method.
       */
      context.drawImage(image, 0, 0, width, height);
      const pixels = new Uint8ClampedArray(context.getImageData(0, 0, width, height).data);
      c.width = 1;
      c.height = 1;
      return {
        width,
        height,
        pixels
      };
    } finally {
      image.close?.();
    }
  }
  /*
   * upload is a transaction around inspection, decoding, and snapshot preparation. The
   * initial recipe is version 3 with an empty passes array. A successful commit starts
   * a new study while retaining earlier history and prepared controls. catch reports
   * failure; finally always unlocks controls and clears the file input so the same
   * file can be chosen again.
   */
  async function upload(file) {
    if (!file || state.busy)
      return;
    busy(true);
    progress(0, 'Reading your image');
    try {
      await inspectImage(file);
      const decoded = await decodeImage(file, true);
      if (!decoded) {
        message('Upload cancelled. Your current study is preserved.');
        return;
      }
      const {pixels, width, height} = decoded;
      const trimmed = await commit(pixels, width, height, {
        version: 3,
        width,
        height,
        filename: file.name || 'image',
        passes: []
      }, null);
      message(`Imported ${ file.name } at ${ width } × ${ height }. Signal settings are prepared; press borkilate to use them.${ trimmed ? ' Older history was trimmed.' : '' }`);
    } catch (error) {
      message(`Could not upload image: ${ error.message || 'The image could not be decoded.' } Your current study is preserved.`, true);
    } finally {
      busy(false);
      $('upload-image').value = '';
    }
  }
  /*
   * CHAPTER BORK-APP-08 | Borkilate deliberately
   *
   * This is the action behind the borkilate button. Settings are read only now. We
   * process state.pixels, not whatever happens to be on the comparison canvas. The
   * result becomes a new child of the active state, so repeating an operation
   * accumulates and returning to an earlier state creates a branch.
   */
  async function apply() {
    if (state.busy || !state.active)
      return;
    let settings;
    try {
      settings = signalSettings();
    } catch (error) {
      message(error.message, true);
      return;
    }
    /*
     * Reject zero mix or no selected effects before spending time. A study has at most
     * 64 recorded passes. Capturing parent before rendering fixes which history state
     * this operation extends.
     */
    if (!settings.mix || !signalFields.some(([key]) => settings[key] > 0)) {
      message('Increase a distortion and Pass mix before applying a pass.');
      return;
    }
    const parent = state.active;
    if (parent.recipe.passes.length >= 64) {
      message('This study has reached 64 passes. Export this result or return to an earlier state.', true);
      return;
    }
    busy(true);
    progress(0, 'Reading the current image');
    try {
      /*
       * Wait for the complete output. If every byte equals the input, report a no-op
       * without adding history. Otherwise append settings to a new pass list, encode a
       * snapshot, and adopt it. Encoding/render failures are caught before a
       * successful commit replaces the prior study.
       */
      const pixels = await render('distort', state.width, state.height, settings, state.pixels);
      if (pixels.every((v, i) => v === state.pixels[i])) {
        message('This pass leaves the image unchanged.');
        return;
      }
      const recipe = {
        ...parent.recipe,
        version: 3,
        passes: [
          ...parent.recipe.passes,
          settings
        ]
      };
      const trimmed = await commit(pixels, state.width, state.height, recipe, parent);
      $('signal-pending').textContent = 'Pass applied · ready to repeat';
      message(`Pass ${ recipe.passes.length } complete. Inspect it, adjust the settings, or apply the same pass again.${ trimmed ? ' Older history was trimmed to make room.' : '' }`);
    } catch (error) {
      message(error.message || 'This pass could not be rendered. Your previous state is preserved.', true);
    } finally {
      busy(false);
    }
  }
  /*
   * CHAPTER BORK-APP-09 | Travel and compare
   *
   * Undo and Redo restore encoded snapshots, not inverse mathematical effects.
   * Selecting history also restores working pixels and ancestry. Original/Current
   * comparison has a smaller responsibility: change only the preview. That distinction
   * makes export and another pass consistent even while Original is visible.
   */
  async function restore(item, kind = 'select') {
    if (state.busy || item === state.active)
      return;
    const previous = state.active;
    busy(true);
    progress(.35, 'Returning to this state');
    try {
      const image = await bitmap(item.blob);
      drawImage(image, item.width, item.height);
      image.close?.();
      const rgba = ctx.getImageData(0, 0, item.width, item.height).data;
      state.pixels = new Uint8ClampedArray(rgba);
      state.active = item;
      state.width = item.width;
      state.height = item.height;
      state.originalView = false;
      state.viewToken++;
      /*
       * Undo stores the state we left on the Redo stack; Redo consumes its last ID.
       * Direct selection clears that temporary path but does not delete later
       * snapshots. Restoring a pass also restores its settings; an untouched upload
       * has no pass settings to restore.
       */
      if (kind === 'undo')
        state.redo.push(previous.id);
      else if (kind === 'redo')
        state.redo.pop();
      else
        state.redo = [];
      if (item.recipe.passes.length)
        writeSignal(item.recipe.passes.at(-1));
      $('signal-pending').textContent = 'Ready to continue from this state';
      drawHistory();
      activeDetails();
      message(`Returned to study ${ item.study }, ${ item.recipe.passes.length ? `pass ${ item.recipe.passes.length }` : 'the upload' }. The next pass will build from here.`);
    } catch (error) {
      message(error.message, true);
    } finally {
      busy(false);
    }
  }
  /*
   * Bitmap decoding is asynchronous. A token gives each comparison request a number;
   * if a newer choice or study change has incremented viewToken, the old decoded image
   * is discarded. state.pixels is never replaced by this function.
   */
  async function compare(original) {
    if (!state.active || state.busy || state.originalView === original)
      return;
    const token = ++state.viewToken;
    try {
      const image = await bitmap(original ? state.active.original.blob : state.active.blob);
      if (token !== state.viewToken) {
        image.close?.();
        return;
      }
      drawImage(image, state.width, state.height);
      image.close?.();
      state.originalView = original;
      activeDetails();
      message(original ? 'Viewing the untouched upload. borkilate and Export PNG still use your current result.' : 'Viewing the current result.');
    } catch (error) {
      message(error.message, true);
    }
  }
  /*
   * CHAPTER BORK-APP-10 | Keep work on disk
   *
   * A PNG preserves the current visible artwork result as pixels; a settings JSON
   * preserves the embedded original and its ordered operations. Both are explicit
   * downloads. Session memory alone is temporary. The original-view toggle does not
   * select what gets saved or exported.
   */
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  /*
   * download creates a temporary anchor and object URL, triggers the browser’s
   * download action, then revokes the URL after a delay. filename removes an
   * extension, replaces awkward filename characters, limits the stem length, and
   * includes pass count and actual dimensions.
   */
  function filename(ext) {
    const a = state.active, stem = a.recipe.filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'image';
    return `borkilator-${ stem }-pass-${ String(a.recipe.passes.length).padStart(2, '0') }-${ a.width }x${ a.height }.${ ext }`;
  }
  /*
   * The current state already has an encoded PNG. Reusing that Blob avoids capturing
   * the preview, checkerboard, labels, or the temporarily displayed original. No
   * resizing is introduced during export.
   */
  function exportPNG() {
    if (!state.active || state.busy)
      return;
    download(state.active.blob, filename('png'));
    message(`Exported the current image at ${ state.width } × ${ state.height } pixels. No interface or labels are included.`);
  }
  /*
   * A FileReader turns PNG bytes into a base64 data URL: image data written as text so
   * it fits inside JSON. saveRecipe embeds the ORIGINAL Blob and applied passes, not a
   * screenshot or pending slider changes. The internal application identifier remains
   * afterimage for file compatibility despite the visible rename.
   */
  const dataURL = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read image data.'));
    reader.readAsDataURL(blob);
  });
  async function saveRecipe() {
    if (!state.active || state.busy)
      return;
    busy(true);
    progress(0, 'Saving image and passes');
    try {
      const recipe = {
        application: 'afterimage',
        ...state.active.recipe,
        image: await dataURL(state.active.original.blob)
      };
      const blob = new Blob([JSON.stringify(recipe)], { type: 'application/json' });
      if (blob.size > SAVE_LIMIT)
        throw new Error('This save exceeds 128 MiB. Export PNG to preserve the current result.');
      download(blob, filename('json'));
      message('Saved the starting image and applied passes. This file reopens without the original upload.');
    } catch (error) {
      message(error.message, true);
    } finally {
      busy(false);
    }
  }
  /*
   * CHAPTER BORK-APP-11 | Reconstruct saved work
   *
   * Opening work is deliberate reconstruction. Validate the file, decode its embedded
   * starting PNG, render each saved pass in order, and stage snapshots. Only after
   * every step succeeds do we adopt the reconstructed study. That prevents an invalid
   * or failed replay from replacing the current study with a partial one.
   */
  function validateRecipe(recipe) {
    if (recipe?.application === 'afterimage' && [
        1,
        2
      ].includes(recipe.version))
      throw new Error('Procedural saves belong to the archived version. Open them in archive/2026-11-07_15-47-32/index.html.');
    if (!recipe || recipe.application !== 'afterimage' || recipe.version !== 3 || !Array.isArray(recipe.passes) || recipe.passes.length > 64)
      throw new Error('Choose an upload-based borkilator settings file (version 3, up to 64 passes).');
    engine.validateUploadSize(recipe.width, recipe.height);
    if (typeof recipe.filename !== 'string' || recipe.filename.length > 1024 || typeof recipe.image !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(recipe.image))
      throw new Error('This settings file has invalid starting-image data.');
    /*
     * Require the known rendering model, integer seeds, and finite normalized fields.
     * Older version-3 recipes omitted cosmic; inserting zero preserves their earlier
     * behavior. Provided malformed cosmic values are rejected by the same field
     * checks. Versions 1/2 belong to the archived procedural app.
     */
    for (const settings of recipe.passes) {
      if (!settings || settings.model !== 2 || !Number.isInteger(settings.seed) || settings.seed < 0 || settings.seed > 4294967295)
        throw new Error('This settings file has an invalid pattern seed or rendering model.');
      if (!Object.hasOwn(settings, 'cosmic'))
        settings.cosmic = 0;
      for (const [key] of [
          ...signalFields,
          ...shapeFields
        ])
        if (!Number.isFinite(settings[key]) || settings[key] < 0 || settings[key] > 1)
          throw new Error(`Invalid ${ key } setting.`);
    }
    return recipe;
  }
  /*
   * The outer saved-file size is checked before text parsing. atob converts embedded
   * base64 to bytes, and normal image screening/decoding is reused. Declared
   * dimensions must exactly match the decoded PNG. Destructuring removes the embedded
   * image/application wrapper from the internal recipe.
   */
  async function loadRecipe(file) {
    if (!file || state.busy)
      return;
    busy(true);
    progress(0, 'Opening saved work');
    try {
      if (file.size > SAVE_LIMIT)
        throw new Error('Choose a saved file up to 128 MiB.');
      const saved = validateRecipe(JSON.parse(await file.text()));
      const raw = atob(saved.image.split(',')[1]);
      const blob = new Blob([Uint8Array.from(raw, ch => ch.charCodeAt(0))], { type: 'image/png' });
      if (await inspectImage(blob) !== 'png')
        throw new Error('The embedded image must be PNG.');
      const decoded = await decodeImage(blob);
      if (decoded.width !== saved.width || decoded.height !== saved.height)
        throw new Error('Saved dimensions do not match the embedded image.');
      const {image, application, ...recipe} = saved;
      let pixels = decoded.pixels, parent = await prepare(pixels, saved.width, saved.height, {
          ...recipe,
          passes: []
        }, null);
      /*
       * Replay begins with a prepared untouched upload. Each saved pass uses the
       * preceding pass’s pixels. Its progress callback maps local progress into the
       * sequence. Stage trimming limits retained PNGs during long replays while each
       * state retains its original; it does not skip computation.
       */
      const staged = [parent];
      for (let i = 0; i < saved.passes.length; i++) {
        pixels = await render('distort', saved.width, saved.height, saved.passes[i], pixels, (v, text) => progress((i + v) / Math.max(1, saved.passes.length), text));
        parent = await prepare(pixels, saved.width, saved.height, {
          ...recipe,
          passes: saved.passes.slice(0, i + 1)
        }, parent);
        staged.push(parent);
        while (staged.length > 2 && (staged.length > 24 || staged.reduce((n, s) => n + s.blob.size, parent.original.blob.size) > 192 * 1024 * 1024))
          staged.shift();
      }
      adopt(staged, pixels);
      if (saved.passes.length)
        writeSignal(saved.passes.at(-1));
      message(`Reopened ${ saved.filename } with ${ saved.passes.length } applied passes. Earlier session studies remain in History.`);
    } catch (error) {
      message(`Could not open settings: ${ error.message } Your current study is preserved.`, true);
    } finally {
      busy(false);
      $('load-recipe').value = '';
    }
  }
  /*
   * CHAPTER BORK-APP-12 | Wire gestures to actions
   *
   * The functions above describe actions; these registrations connect them to real
   * gestures. An event listener is a promise of future work, not an immediate call.
   * The two final startup calls try background processing and set initial button
   * availability. After startup the browser waits for the user.
   */
  $('viewport').addEventListener('click', () => {
    if (!state.busy && !state.active && !$('empty').hidden)
      $('upload-image').click();
  });
  /*
   * A click on the native empty button bubbles up to the viewport, as does a click on
   * its margins. The guard opens the picker only for an empty, idle study. The file
   * input’s change event supplies its first file; cancelling yields no work.
   */
  $('upload-image').addEventListener('change', e => upload(e.target.files[0]));
  $('apply').addEventListener('click', apply);
  $('export').addEventListener('click', exportPNG);
  $('save-recipe').addEventListener('click', saveRecipe);
  $('load-recipe').addEventListener('change', e => loadRecipe(e.target.files[0]));
  /*
   * Choosing a seed or preset only prepares controls. data-preset is HTML data
   * attached to a button; dataset.preset reads its preset key. Presets retain the
   * current numeric seed and then mark their own button selected.
   */
  $('new-pattern').addEventListener('click', () => {
    $('signal-seed').value = freshSeed();
    pending();
  });
  $('signal-seed').addEventListener('input', pending);
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    writeSignal({
      ...presets[button.dataset.preset],
      seed: Number($('signal-seed').value)
    });
    pending('signal');
    button.classList.add('selected');
  }));
  /*
   * Undo follows parentId, not simply the previous thumbnail: branches may sit next to
   * one another. Redo uses the stack’s last retained ID. Optional chaining handles the
   * initial absence of an active item.
   */
  $('undo').addEventListener('click', () => {
    const item = state.history.find(h => h.id === state.active?.parentId);
    if (item)
      restore(item, 'undo');
  });
  $('redo').addEventListener('click', () => {
    const item = state.history.find(h => h.id === state.redo.at(-1));
    if (item)
      restore(item, 'redo');
  });
  $('view-current').addEventListener('click', () => compare(false));
  $('view-original').addEventListener('click', () => compare(true));
  /*
   * Zoom toggles a CSS class and a button label. It changes preview sizing/scrolling
   * without changing pixel dimensions or export resolution. The fixed innerHTML
   * strings here are authored UI markup, not uploaded content.
   */
  $('zoom').addEventListener('click', () => {
    state.actualSize = !state.actualSize;
    $('viewport').classList.toggle('actual-size', state.actualSize);
    $('zoom').innerHTML = state.actualSize ? '100% <span aria-hidden="true">↙</span>' : 'Fit <span aria-hidden="true">↗</span>';
    $('zoom').setAttribute('aria-pressed', state.actualSize);
  });
  /*
   * Ignore shortcuts while busy or editing a form field. Otherwise Cmd/Ctrl Z triggers
   * Undo; Shift selects Redo. preventDefault suppresses the browser’s own action. The
   * final })() closes and immediately invokes the private controller function.
   */
  document.addEventListener('keydown', event => {
    if (state.busy || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))
      return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      $(event.shiftKey ? 'redo' : 'undo').click();
    }
  });
  initWorker();
  updateButtons();
}());
