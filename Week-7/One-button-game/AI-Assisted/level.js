/* Shared timing rules: a note is centered in the target at its song timestamp. */
const LEVEL_RULES = Object.freeze({ speed: 60, targetCenter: 100, barWidth: 3, hitWindow: 0.125, countdown: 3 });

class SongRound {
  constructor(chart, onResult = () => {}) {
    this.notes = chart.notes.map(time => ({ time, result: 'pending' }));
    this.duration = chart.duration;
    this.onResult = onResult;
    this.time = -LEVEL_RULES.countdown;
    this.hits = 0;
    this.misses = 0;
  }
  x(note) {
    return LEVEL_RULES.targetCenter - LEVEL_RULES.barWidth / 2 + (note.time - this.time) * LEVEL_RULES.speed;
  }
  resolve(note, success) {
    if (note.result !== 'pending') return;
    note.result = success ? 'hit' : 'miss';
    if (success) this.hits++;
    else this.misses++;
    this.onResult(note, success);
  }
  update(time) {
    this.time = time;
    for (const note of this.notes) {
      if (time - note.time > LEVEL_RULES.hitWindow + 1e-9) this.resolve(note, false);
    }
  }
  press(time) {
    this.update(time); // Judge at input time, even between rendered frames.
    if (time < 0 || this.finished) return;
    const pending = this.notes.filter(note => note.result === 'pending');
    const overlapping = pending.filter(note => Math.abs(note.time - time) <= LEVEL_RULES.hitWindow + 1e-9);
    // Overlapping windows are allowed. One press resolves only the nearest note;
    // if distances tie, the earlier timestamp wins. Others stay available.
    const note = overlapping.sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time) || a.time - b.time)[0] || pending[0];
    if (note) this.resolve(note, overlapping.length > 0);
  }
  get finished() {
    return this.time >= this.duration && this.notes.every(note => note.result !== 'pending');
  }
}

function validateChart(chart) {
  if (!chart || typeof chart.audio !== 'string' || !Number.isFinite(chart.duration) || chart.duration <= 0 ||
      !Array.isArray(chart.notes) || !chart.notes.length || chart.notes.some((time, i) =>
        !Number.isFinite(time) || time < 0 || time > chart.duration || (i > 0 && time <= chart.notes[i - 1]))) {
    throw new Error('Invalid song chart');
  }
  return chart;
}

class SongPlayer {
  constructor(context, songId = 'medium') {
    this.songId = songId;
    this.context = context;
    this.source = null;
    this.chart = null;
    this.buffer = null;
    this.loading = null;
  }
  async load() {
    // Refresh the shared chart each round; keep the decoded recording in memory.
    if (!this.loading) {
      this.loading = (async () => {
        const catalogResponse = await fetch('Songs/catalog.json', { cache: 'no-store' });
        if (!catalogResponse.ok) throw new Error('Song catalog could not load');
        const catalog = await catalogResponse.json();
        const song = catalog.find(item => item.id === this.songId);
        if (!song) throw new Error('Song is not available');
        const response = await fetch(song.chart, { cache: 'no-store' });
        if (!response.ok) throw new Error('Chart could not load');
        const data = await response.json();
        if (Array.isArray(data.notes) && data.notes.length === 0) {
          const error = new Error('Map this song in the editor and save at least one note before playing.');
          error.code = 'UNMAPPED';
          throw error;
        }
        const chart = validateChart(data);
        let buffer = this.buffer;
        if (!buffer || !this.chart || this.chart.audio !== chart.audio) {
          const audio = await fetch(chart.audio);
          if (!audio.ok) throw new Error('Audio could not load');
          buffer = await this.context.decodeAudioData(await audio.arrayBuffer());
        }
        if (Math.abs(buffer.duration - chart.duration) > 0.15) throw new Error('Audio does not match chart');
        this.chart = chart;
        this.buffer = buffer;
      })().finally(() => { this.loading = null; });
    }
    await this.loading;
  }

  start() {
    this.stop();
    this.startedAt = this.context.currentTime + LEVEL_RULES.countdown;
    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.context.destination);
    this.source.start(this.startedAt);
  }
  get time() { return this.context.currentTime - this.startedAt; }
  stop() {
    if (this.source) {
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
  }
}

if (typeof module !== 'undefined') module.exports = { SongRound, SongPlayer, validateChart, LEVEL_RULES };
