import { extractMxl } from './archive.js';
import { importMusicXML } from './musicxml.js';
export { importMusicXML };

const fail = message => { throw new Error(message); };
const MAX_NOTES = 20000;
const validNotes = notes => {
  if (!notes.length) fail('No se encontraron notas de piano en el archivo.');
  if (notes.length > MAX_NOTES) fail('La partitura es demasiado grande. Exporta un fragmento de hasta 20.000 notas.');
  if (notes.some(n => !Number.isInteger(n.pitch) || !Number.isFinite(n.beat) || n.beat < 0 || n.beat > 100000 || !Number.isFinite(n.duration) || n.duration <= 0 || n.duration > 10000 || n.pitch < 0 || n.pitch > 127)) fail('El archivo contiene notas, tiempos o duraciones no compatibles.');
  return notes.sort((a,b) => a.beat - b.beat || a.pitch - b.pitch);
};

export function importMidi(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const ensure = length => { if (pos + length > bytes.length) fail('Archivo MIDI incompleto.'); };
  const byte = () => { ensure(1); return bytes[pos++]; };
  const u16 = () => { ensure(2); const n = view.getUint16(pos); pos += 2; return n; };
  const u32 = () => { ensure(4); const n = view.getUint32(pos); pos += 4; return n; };
  const str = n => { ensure(n); const s = String.fromCharCode(...bytes.subarray(pos,pos+n)); pos+=n; return s; };
  const variable = () => {
    let value = 0;
    for (let i = 0; i < 4; i++) { const b = byte(); value = value * 128 + (b & 127); if (!(b & 128)) return value; }
    fail('Valor de tiempo MIDI no válido.');
  };
  if (str(4) !== 'MThd') fail('El archivo no es un MIDI estándar.');
  const headerLength = u32();
  if (headerLength < 6) fail('Cabecera MIDI no válida.');
  const format = u16(), tracks = u16(), division = u16();
  if (format > 1) fail('Exporta el MIDI como formato 0 o 1; el formato 2 no está soportado.');
  if (division & 0x8000 || division === 0) fail('Exporta el MIDI con tiempo musical PPQ, no SMPTE.');
  ensure(headerLength - 6); pos += headerLength - 6;
  const notes = [], tempos = [], meters = [];
  for (let track = 0; track < tracks; track++) {
    if (str(4) !== 'MTrk') fail('Pista MIDI no válida.');
    const length = u32(), end = pos + length;
    ensure(length);
    let tick = 0, running = 0;
    const active = new Map();
    while (pos < end) {
      tick += variable();
      let status = byte();
      if (status < 0x80) { if (!running) fail('Estado MIDI no válido.'); pos--; status = running; }
      else if (status < 0xf0) running = status;
      if (status === 0xff) {
        const type = byte(), size = variable();
        ensure(size);
        if (type === 0x51 && size === 3) {
          const microseconds = bytes[pos] * 65536 + bytes[pos+1] * 256 + bytes[pos+2];
          if (!microseconds) fail('Tempo MIDI no válido.');
          tempos.push({ tick, bpm: 60000000 / microseconds });
        }
        if (type === 0x58 && size >= 2) meters.push({ tick, beats: bytes[pos] * 4 / 2 ** bytes[pos+1] });
        pos += size;
      } else if (status === 0xf0 || status === 0xf7) { const size = variable(); ensure(size); pos += size; running = 0; }
      else if (status >= 0xf0) fail('El MIDI contiene eventos de sistema no compatibles.');
      else {
        const type = status & 0xf0, channel = status & 15;
        const a = byte(), b = type === 0xc0 || type === 0xd0 ? 0 : byte();
        if (a > 127 || b > 127) fail('Datos MIDI no válidos.');
        const key = channel + ':' + a;
        if (type === 0x90 && b > 0 && channel !== 9) {
          const queue = active.get(key) || [];
          queue.push({ pitch: a, beat: tick / division, velocity: b, track }); active.set(key, queue);
        } else if ((type === 0x80 || type === 0x90 && b === 0) && channel !== 9) {
          const queue = active.get(key);
          const note = queue?.shift();
          if (note) notes.push({ ...note, duration: Math.max(0.05, tick / division - note.beat), hand: note.pitch < 60 ? 'left' : 'right' });
        }
      }
      if (pos > end) fail('Evento MIDI fuera de su pista.');
      if (notes.length > MAX_NOTES) fail('Exporta un fragmento de hasta 20.000 notas.');
    }
    for (const queue of active.values()) for (const n of queue) notes.push({ ...n, duration: Math.max(0.25,tick/division-n.beat), hand: n.pitch < 60 ? 'left' : 'right' });
  }
  const firstMeter = meters.sort((a,b)=>a.tick-b.tick)[0]?.beats || 4;
  if (!(firstMeter > 0 && firstMeter <= 32)) fail('Compás MIDI no compatible.');
  if (meters.some(m => m.beats !== firstMeter)) fail('Esta versión no admite cambios de compás. Exporta un fragmento con un único compás.');
  return { notes: validNotes(notes), bpm: Math.round(tempos.sort((a,b)=>a.tick-b.tick)[0]?.bpm || 80), beatsPerBar: firstMeter,
    warnings: ['Manos asignadas por registro (corte en Do4); puedes cambiar ese punto en la práctica.', ...(tempos.length > 1 ? ['Se practica a tempo fijo; los cambios de tempo del archivo no se reproducen.'] : [])] };
}

export function importScore(buffer, filename = '') {
  const bytes = new Uint8Array(buffer);
  if (bytes.length > 5 * 1024 * 1024) fail('El archivo supera 5 MB. Exporta un fragmento más pequeño.');
  if (/\.midi?$/i.test(filename)) return importMidi(buffer);
  if (/\.mxl$/i.test(filename) || bytes[0] === 0x50 && bytes[1] === 0x4b) return importMusicXML(extractMxl(buffer));
  if (!/\.(xml|musicxml)$/i.test(filename)) fail('Selecciona un archivo .mxl, .musicxml, .xml, .mid o .midi.');
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  return importMusicXML(new TextDecoder(encoding, { fatal: true }).decode(bytes));
}
