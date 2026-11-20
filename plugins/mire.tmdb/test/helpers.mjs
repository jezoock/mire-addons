// Contexte de plugin simulé (forme de `PluginContext` du SDK) : réponses HTTP enregistrées par adresse, sans réseau.
import { readFileSync } from 'node:fs';

/** Réponses enregistrées de `test/fixtures/<nom>.json` : adresse → `{ json, status? }`. */
export const loadRoutes = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

/** Clé courte (paramètre `api_key`) des réponses enregistrées. */
export const KEY = 'cle-tmdb-courte-0123456789';

/**
 * Contexte : `routes` (adresse exacte → `{ json, status? }`, `{ unreachable: true }`, ou une fonction), réglages
 * modifiables, journal et requêtes notés. Une adresse absente répond 404.
 */
export function fakeContext({ routes = {}, settings = {}, locale = 'fr' } = {}) {
  const values = { token: KEY, region: 'auto', language: 'auto', ...settings };
  const listeners = new Set();
  const calls = [];
  const logs = [];
  const ctx = {
    id: 'mire.tmdb',
    version: '1.0.0',
    locale,
    http: {
      async request(url, options = {}) {
        calls.push({ url, headers: { ...(options.headers ?? {}) }, timeout: options.timeout });
        const route = routes[url];
        const reply = typeof route === 'function' ? route(url) : route;
        // Message technique du client HTTP de Mire, qui ne doit jamais remonter tel quel.
        if (reply?.unreachable) throw new Error(`api.themoviedb.org could not be resolved (${url})`);
        if (!reply) return { status: 404, headers: {}, text: '{}' };
        return { status: reply.status ?? 200, headers: {}, text: reply.text ?? JSON.stringify(reply.json ?? {}) };
      },
      getJson: async () => {
        throw new Error('not used');
      },
      getText: async () => {
        throw new Error('not used');
      },
    },
    settings: {
      get: (key) => values[key],
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    log: {
      info: (...a) => logs.push(a),
      warn: (...a) => logs.push(a),
      error: (...a) => logs.push(a),
    },
    events: { on: () => () => {} },
    storage: {},
    files: {},
  };
  const set = (key, value) => {
    values[key] = value;
    for (const l of listeners) l(key);
  };
  return { ctx, calls, logs, set };
}
