/**
 * Index d'un dépôt (`index.json`) : construction, signature ed25519 et vérification. Le format est décrit dans
 * `docs/index-format.md` ; ce module en est l'implémentation de référence.
 *
 * La signature couvre la forme canonique de l'index sans son champ `signature` (clés triées, aucun espace, nombres
 * entiers seulement), précédée d'un en-tête de contexte : une signature d'index ne peut pas servir ailleurs.
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { isVersion, isVersionRange, PLUGIN_ID_RE, validateManifest } from '@mire/plugin-sdk';

export const INDEX_FORMAT = 1;
export const SIGNATURE_CONTEXT = 'mire-addons-index:1\n';
const SHA256_RE = /^[0-9a-f]{64}$/;

/** JSON canonique : clés triées (ordre des unités UTF-16, comme RFC 8785), sans espace, entiers seulement. */
export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`Nombre non entier refusé dans l'index : ${value}`);
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  throw new Error(`Valeur refusée dans l'index : ${typeof value}`);
}

/** Octets signés : en-tête de contexte puis index canonique sans `signature`. */
export function signedBytes(index) {
  const { signature: _signature, ...body } = index;
  return Buffer.from(SIGNATURE_CONTEXT + canonicalJson(body), 'utf8');
}

/** Clé privée ed25519 au format PKCS#8 PEM (celui d'`openssl genpkey -algorithm ed25519`). */
export function loadPrivateKey(pem) {
  let key;
  try {
    key = createPrivateKey({ key: pem, format: 'pem' });
  } catch {
    throw new Error('Clé privée illisible : une clé ed25519 au format PKCS#8 PEM (-----BEGIN PRIVATE KEY-----) est attendue.');
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(`Clé privée de type ${key.asymmetricKeyType} : une clé ed25519 est attendue.`);
  return key;
}

/** Clé publique ed25519 : PEM (SPKI) ou 32 octets bruts en base64. */
export function loadPublicKey(text) {
  const s = String(text).trim();
  let key;
  try {
    if (s.startsWith('-----BEGIN')) key = createPublicKey({ key: s, format: 'pem' });
    else {
      const raw = Buffer.from(s, 'base64');
      if (raw.length !== 32) throw new Error();
      key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' });
    }
  } catch {
    throw new Error('Clé publique illisible : PEM (-----BEGIN PUBLIC KEY-----) ou 32 octets en base64 attendus.');
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('La clé publique n’est pas une clé ed25519.');
  return key;
}

/** 32 octets bruts d'une clé publique (ou de la clé publique d'une clé privée). */
export function rawPublicKey(key) {
  const pub = key.type === 'private' ? createPublicKey(key) : key;
  return Buffer.from(pub.export({ format: 'jwk' }).x, 'base64url');
}

/** Identifiant d'une clé : sha256 (hexadécimal) de ses 32 octets bruts. C'est aussi l'empreinte affichée. */
export const keyId = (key) => createHash('sha256').update(rawPublicKey(key)).digest('hex');

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Signe un index (sans signature) et rend l'index signé. */
export function signIndex(index, privateKey) {
  const value = sign(null, signedBytes(index), privateKey).toString('base64');
  return { ...index, signature: { algorithm: 'ed25519', keyId: keyId(privateKey), value } };
}

/**
 * Vérifie la signature d'un index avec une clé publique. Lève une erreur explicite si elle est absente, faite par une
 * autre clé ou invalide ; rend l'index sinon.
 */
export function verifyIndex(index, publicKey) {
  const sig = index?.signature;
  if (!sig || sig.algorithm !== 'ed25519' || typeof sig.value !== 'string') throw new Error('Index non signé ou signature mal formée.');
  if (sig.keyId !== keyId(publicKey)) throw new Error(`Index signé par une autre clé (${sig.keyId}).`);
  if (!verify(null, signedBytes(index), publicKey, Buffer.from(sig.value, 'base64'))) throw new Error('Signature de l’index invalide.');
  if (index.format !== INDEX_FORMAT) throw new Error(`Format d'index ${index.format} inconnu.`);
  return index;
}

const NUMERIC = /^\d+$/;
/** Compare deux versions semver (ordre de priorité semver ; métadonnées de construction ignorées). */
export function compareVersions(a, b) {
  const split = (v) => {
    const [core, pre] = v.split('+')[0].split(/-(.*)/s);
    return { core: core.split('.').map(Number), pre: pre ? pre.split('.') : [] };
  };
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
    if (p === q) continue;
    if (NUMERIC.test(p) && NUMERIC.test(q)) return Number(p) - Number(q);
    if (NUMERIC.test(p) !== NUMERIC.test(q)) return NUMERIC.test(p) ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/** Textes d'un catalogue (`messages.plugin.<clé>`) par langue. */
function textsByLang(catalogs, key) {
  const out = {};
  for (const [lang, cat] of Object.entries(catalogs).sort()) {
    const v = cat?.messages?.plugin?.[key];
    if (typeof v === 'string' && v.trim()) out[lang] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Entrée d'index d'une version, d'après le manifeste et les textes lus DANS le paquet publié, et l'empreinte de ce
 * paquet : ce qui est signé décrit exactement les octets téléchargés.
 */
export function versionEntry({ manifest, catalogs, url, sha, size }) {
  if (!SHA256_RE.test(sha)) throw new Error(`Empreinte invalide pour ${manifest.id} ${manifest.version}.`);
  if (!/^https:\/\//.test(url)) throw new Error(`Adresse de paquet refusée : ${url}`);
  return {
    version: manifest.version,
    engines: { mire: manifest.engines.mire },
    level: manifest.level,
    contributes: Object.keys(manifest.contributes).filter((k) => manifest.contributes[k].length > 0).sort(),
    permissions: manifest.permissions ?? {},
    dependencies: manifest.dependencies ?? {},
    name: textsByLang(catalogs, 'name'),
    description: textsByLang(catalogs, 'description'),
    package: { url, sha256: sha, size },
  };
}

/**
 * Index (non signé) à partir des versions publiées : [{ id, entry }]. Plugins triés par identifiant, versions de la
 * plus récente à la plus ancienne.
 */
export function buildIndex({ repository, generated, versions }) {
  const byId = new Map();
  for (const { id, entry } of versions) {
    if (!PLUGIN_ID_RE.test(id)) throw new Error(`Identifiant invalide : ${id}`);
    const list = byId.get(id) ?? [];
    if (list.some((e) => e.version === entry.version)) throw new Error(`Version en double : ${id} ${entry.version}`);
    byId.set(id, [...list, entry]);
  }
  const plugins = [...byId.keys()].sort().map((id) => ({ id, versions: byId.get(id).sort((a, b) => compareVersions(b.version, a.version)) }));
  return { format: INDEX_FORMAT, repository, generated, plugins };
}

/**
 * Vérifie la structure d'un index (après sa signature) : champs, identifiants, versions, empreintes et adresses.
 * Un client fait ces contrôles avant d'utiliser l'index ; la CI les fait avant de le publier.
 */
export function checkIndexContent(index, { official = false } = {}) {
  const errors = [];
  if (!Array.isArray(index.plugins)) return ['plugins : liste attendue.'];
  if (typeof index.generated !== 'string' || Number.isNaN(Date.parse(index.generated))) errors.push('generated : date ISO attendue.');
  for (const p of index.plugins) {
    if (!PLUGIN_ID_RE.test(p.id ?? '')) errors.push(`Identifiant invalide : ${p.id}`);
    if (!official && p.id?.startsWith('mire.')) errors.push(`${p.id} : préfixe « mire. » réservé au dépôt officiel.`);
    for (const v of p.versions ?? []) {
      const where = `${p.id} ${v.version}`;
      if (!isVersion(v.version) || !isVersionRange(v.engines?.mire)) errors.push(`${where} : version ou engines.mire invalide.`);
      if (!SHA256_RE.test(v.package?.sha256 ?? '')) errors.push(`${where} : empreinte sha256 invalide.`);
      if (!/^https:\/\//.test(v.package?.url ?? '')) errors.push(`${where} : adresse https attendue.`);
      if (!Number.isSafeInteger(v.package?.size) || v.package.size <= 0) errors.push(`${where} : taille invalide.`);
    }
  }
  return errors;
}

/**
 * Lit un paquet publié (fichiers extraits) : manifeste validé par le SDK, cohérence avec l'étiquette, catalogues.
 */
export function readPackage(files, { id, version, official }) {
  const get = (p) => files.find((f) => f.path === p)?.data;
  const raw = get('mire-plugin.json');
  if (!raw) throw new Error(`${id} ${version} : mire-plugin.json absent du paquet.`);
  const manifest = JSON.parse(raw.toString('utf8'));
  const result = validateManifest(manifest, { official });
  if (!result.ok) throw new Error(`${id} ${version} : manifeste du paquet invalide (${result.issues.map((i) => i.message).join(' ; ')}).`);
  if (manifest.id !== id || manifest.version !== version) throw new Error(`${id} ${version} : le paquet contient ${manifest.id} ${manifest.version}.`);
  const dir = manifest.i18n.replace(/\/+$/, '');
  const catalogs = {};
  for (const f of files) {
    const m = f.path.startsWith(`${dir}/`) && /^([a-z]{2,3}(?:-[A-Za-z0-9]+)*)\.json$/.exec(f.path.slice(dir.length + 1));
    if (m) catalogs[m[1]] = JSON.parse(f.data.toString('utf8'));
  }
  return { manifest, catalogs };
}
