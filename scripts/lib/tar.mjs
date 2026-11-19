/**
 * Archives `.tgz` des plugins : tar (format ustar) compressé en gzip, écrit et lu sans dépendance (D-03).
 *
 * L'archive est déterministe : fichiers triés, aucun dossier, date, propriétaire et droits fixes. Le même dossier
 * donne donc les mêmes octets de tar, ce qui permet de vérifier qu'une version déjà publiée n'a pas changé. Le gzip
 * peut varier d'une version de zlib à l'autre : la comparaison porte sur le contenu, pas sur l'empreinte du `.tgz`.
 */
import { gunzipSync, gzipSync } from 'node:zlib';

const BLOCK = 512;
/** Taille maximale d'un fichier et de l'archive décompressée (un plugin n'est pas un gros paquet). */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_ARCHIVE_SIZE = 200 * 1024 * 1024;

/**
 * Chemin permis dans une archive : relatif, séparateurs `/`, sans `.`, `..`, `\` ni `:`, 100 octets au plus (champ
 * `name` de l'en-tête ustar, sans le préfixe : plus simple à relire pour un client).
 */
export function isArchivePath(p) {
  if (typeof p !== 'string' || !p || Buffer.byteLength(p) > 100) return false;
  if (/[\\:\0]/.test(p) || p.startsWith('/')) return false;
  return p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

function writeField(header, offset, length, value) {
  const bytes = Buffer.from(value);
  if (bytes.length > length) throw new Error(`Champ tar trop long : ${value}`);
  bytes.copy(header, offset);
}

const octal = (n, length) => `${n.toString(8).padStart(length - 1, '0')}\0`;

function headerFor(name, size) {
  const h = Buffer.alloc(BLOCK);
  writeField(h, 0, 100, name);
  writeField(h, 100, 8, octal(0o644, 8));
  writeField(h, 108, 8, octal(0, 8));
  writeField(h, 116, 8, octal(0, 8));
  writeField(h, 124, 12, octal(size, 12));
  writeField(h, 136, 12, octal(0, 12));
  writeField(h, 148, 8, '        ');
  writeField(h, 156, 1, '0');
  writeField(h, 257, 6, 'ustar\0');
  writeField(h, 263, 2, '00');
  const sum = h.reduce((a, b) => a + b, 0);
  writeField(h, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
  return h;
}

/** Tar non compressé de `files` ({ path, data }), triés par chemin. */
export function createTar(files) {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const parts = [];
  let previous = null;
  for (const { path, data } of sorted) {
    if (!isArchivePath(path)) throw new Error(`Chemin refusé dans l'archive : ${path}`);
    if (path === previous) throw new Error(`Fichier en double dans l'archive : ${path}`);
    previous = path;
    parts.push(headerFor(path, data.length), data, Buffer.alloc((BLOCK - (data.length % BLOCK)) % BLOCK));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts);
}

/**
 * `.tgz` de `files`. L'octet « système » de l'en-tête gzip est fixé à 255 (inconnu) : sans cela, il dépend du
 * système qui compresse.
 */
export function createTgz(files) {
  const gz = gzipSync(createTar(files), { level: 9 });
  gz[9] = 255;
  return gz;
}

const readString = (buf, offset, length) => {
  const raw = buf.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end < 0 ? length : end).toString('utf8');
};

function readOctal(buf, offset, length) {
  const s = readString(buf, offset, length).trim();
  if (!/^[0-7]+$/.test(s)) throw new Error('En-tête tar invalide.');
  return parseInt(s, 8);
}

function checkHeader(h) {
  const stored = readOctal(h, 148, 8);
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
  if (sum !== stored) throw new Error('Somme de contrôle tar invalide.');
}

/**
 * Lit un tar et rend ses fichiers ({ path, data }). Refuse tout ce qui n'est pas un fichier ordinaire (liens,
 * dossiers, périphériques), les chemins dangereux, les doublons et les tailles excessives : un client peut extraire
 * ce qu'il a obtenu sans autre contrôle de chemin.
 */
export function readTar(tar) {
  const files = [];
  const seen = new Set();
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const h = tar.subarray(offset, offset + BLOCK);
    if (h.every((b) => b === 0)) return files;
    checkHeader(h);
    const type = String.fromCharCode(h[156]);
    const prefix = readString(h, 345, 155);
    const path = prefix ? `${prefix}/${readString(h, 0, 100)}` : readString(h, 0, 100);
    if (type !== '0' && type !== '\0') throw new Error(`Entrée refusée (ni un fichier ordinaire) : ${path}`);
    if (!isArchivePath(path) || seen.has(path)) throw new Error(`Chemin refusé : ${path}`);
    const size = readOctal(h, 124, 12);
    if (size > MAX_FILE_SIZE) throw new Error(`Fichier trop gros : ${path}`);
    const start = offset + BLOCK;
    if (start + size > tar.length) throw new Error('Archive tronquée.');
    files.push({ path, data: Buffer.from(tar.subarray(start, start + size)) });
    seen.add(path);
    offset = start + Math.ceil(size / BLOCK) * BLOCK;
  }
  throw new Error('Archive tronquée (fin de tar absente).');
}

/** Lit un `.tgz`. */
export function readTgz(tgz) {
  return readTar(gunzipSync(tgz, { maxOutputLength: MAX_ARCHIVE_SIZE }));
}
