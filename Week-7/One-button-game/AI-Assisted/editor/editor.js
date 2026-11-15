(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clock = new EditorClock();
  let draft, chart, revision, context, buffer, source, peaks;
  let catalog = [], songId = 'medium';
  const songDrafts = new Map();
  const currentSong = () => catalog.find(song => song.id === songId);
  const chartEndpoint = () => `/api/chart?song=${encodeURIComponent(songId)}`;
  let canSave = false, recording = false, viewStart = 0, saving = false;
  let transportGeneration = 0;
  const clickVoices = new Set();
  const scheduled = new Set();
  const timeline = $('timeline');
  const pen = timeline.getContext('2d');
  const message = (text, error = false) => { $('notice').textContent = text; $('notice').classList.toggle('error', error); };
  const position = () => Math.min(chart.duration, clock.position(context.currentTime));
  const number = id => {
    if ($(id).value.trim() === '') throw new Error('Enter a number.');
    const n = Number($(id).value);
    if (!Number.isFinite(n)) throw new Error('Enter a finite number.');
    return n;
  };
  function action(id, callback) {
    $(id).addEventListener('click', () => Promise.resolve().then(callback).catch(error => message(error.message, true)));
  }
  function cancelClicks() {
    for (const voice of clickVoices) { voice.stop(); voice.disconnect(); }
    clickVoices.clear(); scheduled.clear();
  }
  function pause() {
    transportGeneration++;
    if (clock.playing) clock.offset = position();
    clock.playing = false;
    if (source) { source.onended = null; source.stop(); source.disconnect(); source = null; }
    cancelClicks();
    $('play').textContent = 'Play · P';
  }
  async function play() {
    if (clock.playing) return;
    const token = ++transportGeneration;
    await context.resume();
    if (token !== transportGeneration) return;
    if (clock.loop && (clock.offset < clock.start || clock.offset >= clock.end)) clock.offset = clock.start;
    if (clock.offset >= chart.duration) clock.offset = clock.loop ? clock.start : 0;
    clock.anchor = context.currentTime;
    source = context.createBufferSource(); source.buffer = buffer;
    source.playbackRate.value = clock.rate;
    source.loop = clock.loop; source.loopStart = clock.start; source.loopEnd = clock.end;
    source.connect(context.destination);
    const current = source;
    source.onended = () => {
      if (source !== current) return;
      clock.offset = chart.duration; clock.playing = false;
      source.disconnect(); source = null; cancelClicks(); $('play').textContent = 'Play · P';
    };
    clock.playing = true;
    source.start(clock.anchor, clock.offset);
    schedulePreview();
    $('play').textContent = 'Pause · P';
  }
  async function seek(t) {
    if (!Number.isFinite(t)) return;
    const wasPlaying = clock.playing;
    pause(); clock.offset = Math.max(0, Math.min(chart.duration, t));
    if (wasPlaying) await play();
  }
  function sectionValues() {
    const start = number('loop-start'), end = number('loop-end');
    if (start < 0 || end > chart.duration + 0.000001 || end - start < 0.25) throw new Error('Section must be inside the song and at least 0.25 seconds long.');
    return { start, end };
  }
  async function configureLoop() {
    const { start, end } = sectionValues();
    const wasPlaying = clock.playing;
    pause(); clock.start = start; clock.end = end; clock.loop = $('loop').checked;
    if (clock.loop && (clock.offset < start || clock.offset >= end)) clock.offset = start;
    if (wasPlaying) await play();
  }
  function renderNotes() {
    const oldScroll = $('notes').scrollTop;
    $('notes').replaceChildren();
    draft.notes.forEach((time, i) => {
      const option = document.createElement('option');
      option.value = i;
      const conflict = (i && time <= draft.notes[i-1]) || (i+1 < draft.notes.length && draft.notes[i+1] <= time);
      option.textContent = `${conflict ? '! ' : ''}${String(i+1).padStart(3, '0')}   ${time.toFixed(6)} s`;
      if (conflict) option.style.color = '#ff7888';
      $('notes').append(option);
    });
    $('notes').selectedIndex = draft.selected;
    $('notes').scrollTop = oldScroll;
    $('note-time').value = draft.selected < 0 ? '' : draft.notes[draft.selected].toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    $('dirty').textContent = draft.dirty ? 'Unsaved changes' : 'Chart matches saved version';
    $('count').textContent = `${draft.notes.length} notes`;
    const problems = draft.problems;
    $('issues').textContent = problems.slice(0, 3).join(' ') + (problems.length > 3 ? ` Plus ${problems.length-3} more.` : '');
    $('save').disabled = !canSave || saving || !draft.dirty || problems.length > 0;
    $('save').textContent = `Save ${currentSong().difficulty} chart to game`;
    $('save-reason').textContent = !canSave ? 'Direct saving is unavailable. Run or restart python3 editor_server.py, then open its editor URL. Export any unsaved draft before reloading.' : saving ? 'Saving…' : problems.length ? problems[0] : !draft.dirty ? 'No unsaved changes for this song.' : `Ready to update ${currentSong().difficulty}: ${currentSong().title}.`;
    $('undo').disabled = !draft.undoStack.length;
    $('redo').disabled = !draft.redoStack.length;
    for (const id of ['set-note','delete','earlier','later','audition']) $(id).disabled = draft.selected < 0;
    cancelClicks();
  }
  function edit(operation) {
    operation(); renderNotes();
    message('Draft updated. Preview it, then save to update the game.');
  }
  function tap() {
    if (recording && !clock.playing) throw new Error('Press P or Play to begin, then tap Space with the triangle.');
    const time = position() + (recording ? number('tap-offset') / 1000 : 0);
    edit(() => draft.add(time));
    message(`Added strike at ${time.toFixed(3)} s.`);
  }
  function select(index) {
    draft.selected = index; renderNotes();
  }
  function clickAt(when) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.value = 1800;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.045, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
    oscillator.connect(gain); gain.connect(context.destination);
    clickVoices.add(oscillator);
    oscillator.onended = () => { clickVoices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(when); oscillator.stop(when + 0.05);
  }
  function schedulePreview() {
    if (!clock.playing || recording || !$('preview').checked) return;
    const now = context.currentTime;
    const absolute = clock.offset + (now - clock.anchor) * clock.rate;
    draft.notes.forEach((note, i) => {
      let event = note, cycle = 0;
      if (clock.loop) {
        if (note < clock.start || note >= clock.end) return;
        const length = clock.end - clock.start;
        cycle = Math.max(0, Math.ceil((absolute - note - 1e-8) / length));
        event = note + cycle * length;
      }
      const when = clock.anchor + (event - clock.offset) / clock.rate;
      const key = `${i}:${cycle}`;
      if (when >= now - 0.01 && when <= now + 0.15 && !scheduled.has(key)) {
        scheduled.add(key); clickAt(Math.max(now, when));
      }
    });
  }
  function viewLength() { return $('zoom').value === 'all' ? chart.duration : Number($('zoom').value); }
  function setView(start) { viewStart = Math.max(0, Math.min(chart.duration - viewLength(), start)); }
  function draw() {
    if (!draft) { requestAnimationFrame(draw); return; }
    const time = position(), length = viewLength(), width = timeline.width, height = timeline.height;
    if ($('follow').checked && (time < viewStart || time > viewStart + length * 0.9)) setView(time - length * 0.15);
    $('time').textContent = `${time.toFixed(6)} s`;
    $('seek').value = time;
    $('view-label').textContent = `${viewStart.toFixed(3)} – ${Math.min(chart.duration,viewStart+length).toFixed(3)} s`;
    pen.fillStyle = '#080b18'; pen.fillRect(0,0,width,height);
    const x = t => (t-viewStart)/length*width;
    const tick = length <= 0.5 ? 0.01 : length <= 1 ? 0.05 : length <= 10 ? 0.5 : length <= 20 ? 1 : 5;
    pen.font = '12px monospace';
    for (let t=Math.ceil(viewStart/tick)*tick; t<=viewStart+length; t+=tick) {
      pen.strokeStyle='#253047'; pen.beginPath(); pen.moveTo(x(t),0); pen.lineTo(x(t),height); pen.stroke();
      pen.fillStyle='#9aa7bc'; pen.fillText(t.toFixed(length <= 1 ? 2 : 1),x(t)+4,height-8);
    }
    if (clock.loop) { pen.fillStyle='#ffe36e12'; pen.fillRect(x(clock.start),0,x(clock.end)-x(clock.start),height-25); }
    pen.fillStyle='#425770';
    for (let px=0; px<width; px++) {
      const a=Math.floor((viewStart+px/width*length)/chart.duration*peaks.length);
      const b=Math.ceil((viewStart+(px+1)/width*length)/chart.duration*peaks.length);
      let peak=0; for (let j=a; j<Math.min(peaks.length,b); j++) peak=Math.max(peak,peaks[j]||0);
      pen.fillRect(px,120-peak*75,1,Math.max(1,peak*150));
    }
    draft.notes.forEach((note,i) => {
      if (note<viewStart || note>viewStart+length) return;
      pen.fillStyle=i===draft.selected ? '#ffe36e' : '#70f0a0';
      pen.fillRect(x(note)-1,40,i===draft.selected?3:2,155);
      pen.fillRect(x(note)-5,30,10,10);
    });
    pen.fillStyle='#ff7888'; pen.fillRect(x(time)-1,0,2,height-25);
    schedulePreview(); requestAnimationFrame(draw);
  }
  async function save() {
    if (!canSave) throw new Error('Start python3 editor_server.py to save directly to the game.');
    if (draft.problems.length) throw new Error(draft.problems[0]);
    const snapshot = [...draft.notes]; saving = true; $('song').disabled = true; renderNotes();
    try {
      const response = await fetch(chartEndpoint(), { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({revision, notes:snapshot}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save the chart.');
      revision = result.revision; chart = result.chart;
      draft.saved = JSON.stringify(snapshot);
      message(draft.dirty ? 'Saved that snapshot. Newer edits remain unsaved.' : 'Saved to the game. Start or replay a round to hear the updated chart.');
    } finally { saving = false; $('song').disabled = false; renderNotes(); }
  }
  function exportChart() {
    const data = { ...chart, notes:draft.notes, status:'editor-draft' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));
    const link = document.createElement('a'); link.href=url; link.download=currentSong().chart.split('/').pop(); link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    message('Exported a draft backup. Use Save chart to game to update Triangle Hero.');
  }
  function cacheCurrentDraft() {
    if (draft) songDrafts.set(songId, {draft, chart, revision, canSave, buffer, peaks});
  }
  async function loadSong(id) {
    if (saving) return;
    if (context && draft) pause();
    cacheCurrentDraft();
    songId = id;
    draft = null;
    $('workspace').disabled = true;
    $('song').disabled = true;
    $('song').value = id;
    const song = currentSong();
    message(`Loading ${song.difficulty}: ${song.title}…`);
    try {
      const cached = songDrafts.get(id);
      if (cached) {
        ({draft, chart, revision, canSave, buffer, peaks} = cached);
      } else {
        canSave = false;
        revision = null;
        try {
          const response = await fetch(chartEndpoint(), {cache:'no-store'});
          if (!response.ok) throw new Error('No save service');
          const data = await response.json();
          if (data.chart.audio !== song.audio) throw new Error('Restart the save service for song selection');
          chart = data.chart; revision = data.revision; canSave = true;
        } catch {
          const response = await fetch(new URL('../'+song.chart, location.href), {cache:'no-store'});
          if (!response.ok) throw new Error('Chart could not load. Start python3 editor_server.py and open /editor/.');
          chart = await response.json();
        }
        if (chart.audio !== song.audio) throw new Error('The chart does not match the selected song.');
        if (!context) context = new (window.AudioContext || window.webkitAudioContext)();
        const response = await fetch(new URL('../'+chart.audio,location.href));
        if (!response.ok) throw new Error('Song could not load.');
        buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (Math.abs(buffer.duration-chart.duration)>0.15) throw new Error('Song duration does not match the chart.');
        const channel = buffer.getChannelData(0); peaks = new Float32Array(8192);
        for(let i=0;i<channel.length;i++) { const bin=Math.min(peaks.length-1,Math.floor(i/channel.length*peaks.length)); peaks[bin]=Math.max(peaks[bin],Math.abs(channel[i])); }
        draft = new ChartDraft(chart);
      }
      clock.offset = 0; clock.start = 0; clock.end = chart.duration; clock.loop = false;
      viewStart = 0; recording = false;
      $('record').setAttribute('aria-pressed',false); $('record').textContent = 'Record taps: off';
      $('loop').checked = false; $('loop-start').value = 0;
      $('seek').max = chart.duration; $('loop-end').value = Math.min(10,chart.duration);
      $('workspace').disabled = false;
      $('song-description').textContent = `${song.difficulty}: ${song.title} · ${chart.duration.toFixed(2)} seconds. Drafts are kept separately in this tab; save each song before closing it.`;
      renderNotes();
      message(!canSave ? 'Preview/export mode. Run or restart python3 editor_server.py for direct saving.' : !draft.notes.length ? `Blank chart ready. Turn Record taps on, press P to play, and tap Space on the strikes you want in ${song.difficulty}.` : `Ready: ${song.title}. Your chart and editor tools are loaded.`);
    } catch(error) {
      draft = null;
      message(error.message,true);
    } finally { $('song').disabled = false; }
  }
  async function boot() {
    try {
      const response = await fetch('../Songs/catalog.json', {cache:'no-store'});
      if (!response.ok) throw new Error('Song list could not load. Refresh after restarting the server.');
      catalog = await response.json();
      $('song').replaceChildren();
      for (const song of catalog) {
        const option = document.createElement('option'); option.value = song.id;
        option.textContent = `${song.difficulty} — ${song.title}`; $('song').append(option);
      }
      await loadSong(songId);
    } catch(error) { message(error.message,true); }
  }
  $('song').addEventListener('change', () => loadSong($('song').value));
  action('play', () => clock.playing ? pause() : play());
  action('record', () => { recording=!recording; $('record').setAttribute('aria-pressed',recording); $('record').textContent=`Record taps: ${recording?'on':'off'}`; cancelClicks(); message(recording?'Recording armed. P plays; Space records. Existing notes stay until you clear them.':'Recording off. Enable preview clicks to check the chart.'); });
  action('tap', tap);
  action('section', async () => { await configureLoop(); await seek(clock.start); await play(); });
  action('clear-section', () => {
    const start = viewStart, end = Math.min(chart.duration, start + viewLength());
    edit(() => draft.clear(start, end));
    message(`Cleared visible notes from ${start.toFixed(3)} to ${end.toFixed(3)} s. Undo restores them.`);
  });
  action('set-note', () => edit(() => draft.move(number('note-time'))));
  action('delete', () => edit(() => draft.remove()));
  action('earlier', () => edit(() => draft.move(draft.notes[draft.selected]-0.01)));
  action('later', () => edit(() => draft.move(draft.notes[draft.selected]+0.01)));
  action('shift-all', () => edit(() => draft.shift(number('shift')/1000)));
  action('undo', () => edit(() => draft.undo())); action('redo', () => edit(() => draft.redo()));
  action('save',save); action('export',exportChart);
  action('audition', async () => { const t=draft.notes[draft.selected]; $('loop-start').value=Math.max(0,t-1).toFixed(3); $('loop-end').value=Math.min(chart.duration,t+1).toFixed(3); $('loop').checked=true; await configureLoop(); await seek(clock.start); await play(); });
  action('view-back', () => { $('follow').checked=false; setView(viewStart-viewLength()*0.8); });
  action('view-next', () => { $('follow').checked=false; setView(viewStart+viewLength()*0.8); });
  $('notes').addEventListener('change', () => { select(Number($('notes').value)); setView(draft.notes[draft.selected]-viewLength()/2); $('follow').checked=false; });
  $('seek').addEventListener('input', () => seek(Number($('seek').value)).catch(e=>message(e.message,true)));
  $('speed').addEventListener('change', async () => { const playing=clock.playing; pause(); clock.rate=Number($('speed').value); if(playing) await play().catch(e=>message(e.message,true)); });
  for (const id of ['loop','loop-start','loop-end']) $(id).addEventListener('change', () => configureLoop().catch(e=>message(e.message,true)));
  $('import').addEventListener('change', async () => {
    try {
      const file = $('import').files[0];
      if (!file) return;
      if (file.size > 200000) throw new Error('Chart backup is too large.');
      const imported = JSON.parse(await file.text());
      if (imported.audio !== chart.audio || Math.abs(imported.duration - chart.duration) > 0.001 ||
          !Number.isFinite(imported.duration) || !Array.isArray(imported.notes) || imported.notes.length > 10000 ||
          imported.notes.some(t => !Number.isFinite(t) || t < 0 || t > chart.duration)) {
        throw new Error('Choose a chart backup for this same song.');
      }
      edit(() => draft.commit(imported.notes));
      message('Backup restored into the draft. Review it, then Save chart to game.');
    } catch(error) { message(error.message,true); }
    finally { $('import').value = ''; }
  });
  $('preview').addEventListener('change',cancelClicks);
  $('zoom').addEventListener('change', () => setView(viewStart));
  timeline.addEventListener('click', event => {
    if(!draft) return;
    const rect=timeline.getBoundingClientRect(), t=viewStart+(event.clientX-rect.left)/rect.width*viewLength();
    const tolerance=8/rect.width*viewLength();
    let closest=-1, distance=tolerance;
    draft.notes.forEach((n,i)=>{ if(Math.abs(n-t)<=distance){distance=Math.abs(n-t);closest=i;} });
    if(closest>=0) select(closest); else seek(t).catch(e=>message(e.message,true));
  });
  document.addEventListener('keydown', event => {
    if(!draft || event.target.closest('input,select,textarea,[contenteditable=true]')) return;
    if(event.repeat) { if(event.code==='Space') event.preventDefault(); return; }
    const key=event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey || event.altKey) && key !== 'z') return;
    let work;
    if(event.code==='Space') work=()=> recording ? tap() : clock.playing ? pause() : play();
    else if(key==='p') work=()=>clock.playing?pause():play();
    else if(key==='escape') work=pause;
    else if(key==='arrowleft' || key==='arrowright') work=()=>edit(()=>draft.move(draft.notes[draft.selected]+(key==='arrowleft'?-1:1)*(event.shiftKey?0.001:0.01)));
    else if(key==='delete' || key==='backspace') work=()=>edit(()=>draft.remove());
    else if((event.ctrlKey || event.metaKey) && key==='z') work=()=>edit(()=>event.shiftKey?draft.redo():draft.undo());
    if(work) { event.preventDefault(); Promise.resolve().then(work).catch(e=>message(e.message,true)); }
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden && draft) pause();});
  window.addEventListener('blur',()=>{if(draft) pause();});
  window.addEventListener('beforeunload',event=>{if(draft?.dirty || [...songDrafts.values()].some(state => state.draft.dirty)){event.preventDefault();event.returnValue='';}});
  boot(); requestAnimationFrame(draw);
})();
