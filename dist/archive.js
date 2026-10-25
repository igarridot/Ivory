import { unzipSync } from './vendor/fflate.js';

const MAX_XML = 30 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
const invalid = text => { throw new Error(text); };
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};

// Inspect the central directory before allocating decompressed entry buffers.
export function zipEntries(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (view.getUint32(p, true) === 0x06054b50 && p + 22 + view.getUint16(p + 20, true) === bytes.length) { end = p; break; }
  }
  if (end < 0) invalid('El MXL no es un ZIP válido o está incompleto.');
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) invalid('No se admiten archivos ZIP divididos en varios volúmenes.');
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  let p = view.getUint32(end + 16, true);
  const centralEnd = p + centralSize;
  if (count > 512 || centralEnd > end) invalid('El contenedor MXL tiene demasiados archivos o una estructura no válida.');
  const entries = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > centralEnd || view.getUint32(p, true) !== 0x02014b50) invalid('El directorio del MXL está dañado.');
    const flags = view.getUint16(p + 8, true), method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true), size = view.getUint32(p + 24, true);
    const nameSize = view.getUint16(p + 28, true), extra = view.getUint16(p + 30, true), comment = view.getUint16(p + 32, true);
    const next = p + 46 + nameSize + extra + comment;
    if (next > centralEnd) invalid('El directorio del MXL está incompleto.');
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameSize));
    if (name.startsWith('/') || name.includes('\\') || name.includes('\0') || name.split('/').includes('..')) invalid('El MXL contiene una ruta no permitida.');
    if (entries.some(e => e.name === name)) invalid('El MXL contiene nombres de archivo duplicados.');
    if (flags & 1) invalid('El MXL está cifrado. Exporta una copia sin contraseña.');
    if (![0, 8].includes(method)) invalid('El MXL utiliza un tipo de compresión no compatible.');
    total += size;
    if (size > MAX_XML || total > MAX_XML * 2 || compressedSize > bytes.length) invalid('El contenido descomprimido supera el límite de 30 MB por archivo.');
    entries.push({ name, size, compressedSize, crc:view.getUint32(p+16,true) });
    p = next;
  }
  return { bytes, entries };
}

export function extractMxl(buffer) {
  const { bytes, entries } = zipEntries(buffer);
  const extract = name => {
    try {
      const entry = unzipSync(bytes, { filter: file => file.name === name })[name];
      if (!entry || entry.length !== entries.find(e => e.name === name)?.size) invalid('El archivo MXL está incompleto.');
      if(crc32(entry)!==entries.find(e=>e.name===name)?.crc)invalid('El archivo MXL está dañado: la suma de comprobación no coincide.');
      return decoder.decode(entry);
    } catch (error) {
      invalid(error.message?.startsWith('El archivo') ? error.message : 'No se pudo descomprimir el MXL. Puede estar dañado.');
    }
  };
  let path;
  if (entries.some(e => e.name === 'META-INF/container.xml')) {
    const container = extract('META-INF/container.xml');
    if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(container)) invalid('El contenedor MXL contiene entidades no compatibles.');
    const doc = new DOMParser().parseFromString(container.replace(/<!DOCTYPE[^>]*>/gi, ''), 'application/xml');
    if (doc.querySelector('parsererror')) invalid('El contenedor del MXL no es XML válido.');
    const roots = [...doc.getElementsByTagNameNS('*', 'rootfile')];
    path = (roots.find(e => e.getAttribute('media-type') === 'application/vnd.recordare.musicxml+xml') || roots[0])?.getAttribute('full-path');
    if (!path || !entries.some(e => e.name === path)) invalid('El MXL no contiene la partitura indicada en container.xml.');
  } else {
    const candidates = entries.filter(e => /\.(xml|musicxml)$/i.test(e.name) && !e.name.startsWith('META-INF/'));
    if (candidates.length !== 1) invalid('El MXL no indica cuál es la partitura principal.');
    path = candidates[0].name;
  }
  return extract(path);
}
