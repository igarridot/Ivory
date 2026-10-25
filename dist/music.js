export const NOTE_NAMES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
export const noteName = (pitch, octave = true) => NOTE_NAMES[pitch % 12] + (octave ? Math.floor(pitch / 12) - 1 : '');
export const isBlack = pitch => [1, 3, 6, 8, 10].includes(pitch % 12);

export function decodeMidi(data) {
  if (!data || data.length < 2) return null;
  const type = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  if (type === 0x90 && data.length >= 3 && data[2] > 0) return { type: 'on', pitch: data[1], velocity: data[2], channel };
  if (type === 0x80 || (type === 0x90 && data[2] === 0)) return { type: 'off', pitch: data[1], channel };
  if (type === 0xb0 && data.length >= 3 && data[1] === 64) return { type: 'pedal', value: data[2], channel };
  return null;
}

export function groupNotes(notes) {
  const groups = [];
  for (const note of [...notes].sort((a, b) => a.beat - b.beat || a.pitch - b.pitch)) {
    const last = groups.at(-1);
    if (last && Math.abs(last.beat - note.beat) < 0.001) last.notes.push(note);
    else groups.push({ beat: note.beat, notes: [note] });
  }
  return groups;
}

// Matching is independent of rendering, transport, browser and audio playback.
export class Practice {
  constructor(notes, mode = 'wait', windowBeats = 0.35) {
    this.notes = notes.map((n, i) => ({ ...n, id: i, hit: false, missed: false }));
    this.groups = groupNotes(this.notes);
    this.mode = mode;
    this.window = windowBeats;
    this.index = 0;
    this.correct = 0;
    this.wrong = 0;
    this.timing = [];
    this.held = new Set();
    this.sustained = new Set();
    this.pedal = false;
  }
  get current() { return this.groups[this.index]; }
  get done() { return this.mode === 'wait' ? this.index >= this.groups.length : this.notes.every(n => n.hit || n.missed); }
  get accuracy() { return this.correct + this.wrong ? Math.round(this.correct / (this.correct + this.wrong) * 100) : 0; }
  get coverage() { return this.notes.length ? Math.round(this.correct / this.notes.length * 100) : 0; }
  on(pitch, beat) {
    if (this.held.has(pitch) || this.done) return { result: 'ignored' };
    this.held.add(pitch);
    this.sustained.delete(pitch);
    let candidate;
    if (this.mode === 'wait') candidate = this.current?.notes.find(n => n.pitch === pitch && !n.hit);
    else {
      this.advance(beat);
      candidate = this.notes.filter(n => !n.hit && !n.missed && n.pitch === pitch && Math.abs(n.beat - beat) <= this.window)
        .sort((a, b) => Math.abs(a.beat - beat) - Math.abs(b.beat - beat))[0];
    }
    if (!candidate) { this.wrong++; return { result: 'wrong' }; }
    candidate.hit = true;
    this.correct++;
    if (this.mode === 'rhythm') this.timing.push(beat - candidate.beat);
    if (this.mode === 'wait' && this.current.notes.every(n => n.hit)) this.index++;
    return { result: 'correct', note: candidate, done: this.done };
  }
  off(pitch) {
    this.held.delete(pitch);
    if (this.pedal) this.sustained.add(pitch);
    else this.sustained.delete(pitch);
  }
  setPedal(value) {
    this.pedal = value >= 64;
    if (!this.pedal) this.sustained.clear();
  }
  clearHeld() { this.held.clear(); this.sustained.clear(); this.pedal = false; }
  advance(beat) {
    if (this.mode !== 'rhythm') return;
    for (const n of this.notes) if (!n.hit && !n.missed && n.beat < beat - this.window) n.missed = true;
  }
}

export function filteredNotes(song, hand, fromMeasure, toMeasure) {
  const start = song.barStarts?.[fromMeasure - 1] ?? (fromMeasure - 1) * (song.beatsPerBar || 4);
  const end = song.barStarts?.[toMeasure] ?? (song.barStarts ? song.endBeat ?? Math.max(...song.notes.map(n=>n.beat+n.duration)) : toMeasure * (song.beatsPerBar || 4));
  const notes = song.notes.filter(n => n.beat >= start && n.beat < end && (hand === 'both' || n.hand === hand));
  return notes.map(n => ({ ...n, beat: n.beat - start }));
}

// Two written voices can share one physical key at the same instant.
export function pianoNotes(notes, fitRange = false) {
  const result=[];
  for(const original of [...notes].sort((a,b)=>a.beat-b.beat||a.pitch-b.pitch)) {
    const note={...original};
    if(fitRange){while(note.pitch<21)note.pitch+=12;while(note.pitch>108)note.pitch-=12;}
    let duplicate;
    for(let i=result.length-1;i>=0 && Math.abs(result[i].beat-note.beat)<.001;i--){if(result[i].pitch===note.pitch){duplicate=result[i];break;}}
    if(duplicate)duplicate.duration=Math.max(duplicate.duration,note.duration);
    else result.push(note);
  }
  return result;
}
