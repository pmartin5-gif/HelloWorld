/* Pure chart editing operations; seconds in song time, never playback time. */
class ChartDraft {
  constructor(chart) {
    this.duration = chart.duration;
    this.notes = [...chart.notes];
    this.saved = JSON.stringify(this.notes);
    this.undoStack = [];
    this.redoStack = [];
    this.selected = -1;
  }
  get dirty() { return JSON.stringify(this.notes) !== this.saved; }
  get problems() {
    if (!this.notes.length) return ['Add at least one note before saving.'];
    const issues = [];
    this.notes.forEach((t, i) => {
      if (!Number.isFinite(t) || t < 0 || t > this.duration) issues.push(`Note ${i + 1} is outside the song.`);
      if (i && t <= this.notes[i - 1]) issues.push(`Notes ${i} and ${i + 1} must have distinct, increasing timestamps.`);
    });
    return issues;
  }
  commit(notes, selected = -1) {
    notes = [...notes].map(t => Math.round(t * 1000000) / 1000000).sort((a,b) => a-b);
    if (JSON.stringify(notes) === JSON.stringify(this.notes)) return false;
    this.undoStack.push({ notes: this.notes, selected: this.selected });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.notes = notes;
    this.selected = selected < 0 ? -1 : notes.indexOf(Math.round(selected * 1000000) / 1000000);
    return true;
  }
  add(t) {
    if (!Number.isFinite(t) || t < 0 || t > this.duration) throw new Error('Note must be inside the song.');
    const timestamp = Math.round(t * 1000000) / 1000000;
    if (this.notes.includes(timestamp)) throw new Error('A note already exists at that exact timestamp.');
    this.commit([...this.notes, t], t);
  }
  move(t) {
    if (this.selected < 0) throw new Error('Select a note first.');
    if (!Number.isFinite(t) || t < 0 || t > this.duration) throw new Error('Note must be inside the song.');
    const notes = [...this.notes]; notes[this.selected] = t;
    this.commit(notes, t);
  }
  remove() { if (this.selected >= 0) this.commit(this.notes.filter((_,i) => i !== this.selected)); }
  shift(seconds) {
    const notes = this.notes.map(t => t + seconds);
    if (!Number.isFinite(seconds) || notes.some(t => t < 0 || t > this.duration)) throw new Error('That shift would move notes outside the song.');
    this.commit(notes);
  }
  // Both edges are visible on the timeline, including the final song timestamp.
  clear(start, end) { this.commit(this.notes.filter(t => t < start || t > end)); }
  undo() { this.restore(this.undoStack, this.redoStack); }
  redo() { this.restore(this.redoStack, this.undoStack); }
  restore(from, to) {
    if (!from.length) return;
    to.push({ notes: this.notes, selected: this.selected });
    Object.assign(this, from.pop());
  }
}

class EditorClock {
  constructor() { this.offset = 0; this.rate = 1; this.playing = false; this.loop = false; this.start = 0; this.end = 0; }
  position(now) {
    let t = this.offset + (this.playing ? (now - this.anchor) * this.rate : 0);
    if (this.loop && t >= this.end) t = this.start + (t - this.end) % (this.end - this.start);
    return t;
  }
}
if (typeof module !== 'undefined') module.exports = { ChartDraft, EditorClock };
