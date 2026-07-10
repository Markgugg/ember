import "server-only";
import { existsSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join } from "path";

/**
 * Disk persistence for the credential-free dev store.
 *
 * Without Supabase the repo lives in `globalThis`, which dies with the dev
 * server — so every restart wiped the user's transcripts and insights, and
 * "From the news" (which draws claims from the insight bank) refused for a
 * reason nobody could see. Snapshotting to a JSON file makes local dev behave
 * like a real database. Production never touches this: Supabase is required.
 */

const FILE = join(process.cwd(), ".ember-dev-db.json");

/**
 * Methods that change state — anything else skips the write. Derived from the
 * Repo interface's verbs; a new mutating verb must be added here or its writes
 * will live only until the next restart.
 */
const MUTATORS = /^(add|claim|delete|insert|restore|touch|update|upsert)/;

type Jsonish = Record<string, unknown>;

/** Maps and Sets don't survive JSON.stringify; tag them so we can restore. */
function encode(value: unknown): unknown {
  if (value instanceof Map) {
    return { __t: "Map", v: [...value.entries()].map(([k, x]) => [k, encode(x)]) };
  }
  if (value instanceof Set) return { __t: "Set", v: [...value] };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") {
    const out: Jsonish = {};
    for (const [k, v] of Object.entries(value)) out[k] = encode(v);
    return out;
  }
  return value;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    const tagged = value as { __t?: string; v?: unknown };
    if (tagged.__t === "Map") {
      return new Map(
        (tagged.v as [string, unknown][]).map(([k, x]) => [k, decode(x)]),
      );
    }
    if (tagged.__t === "Set") return new Set(tagged.v as unknown[]);
    const out: Jsonish = {};
    for (const [k, v] of Object.entries(value)) out[k] = decode(v);
    return out;
  }
  return value;
}

export function loadState<T>(): T | null {
  if (!existsSync(FILE)) return null;
  try {
    return decode(JSON.parse(readFileSync(FILE, "utf8"))) as T;
  } catch {
    // A corrupt snapshot must never wedge the dev server — start fresh.
    return null;
  }
}

let queued = false;

/**
 * Debounced, atomic write. Batches the burst of mutations a single pipeline
 * run produces, and writes through a temp file so a crash mid-write can't
 * leave a truncated snapshot behind.
 */
export function saveState(getState: () => unknown): void {
  if (queued) return;
  queued = true;
  setTimeout(() => {
    queued = false;
    try {
      const tmp = `${FILE}.tmp`;
      writeFileSync(tmp, JSON.stringify(encode(getState())), "utf8");
      renameSync(tmp, FILE);
    } catch {
      /* dev convenience only — losing a snapshot must not break a request */
    }
  }, 150).unref?.();
}

/** Wrap a repo so every mutating call schedules a snapshot. */
export function withPersistence<T extends object>(
  repo: T,
  getState: () => unknown,
): T {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || typeof prop !== "string") return value;
      if (!MUTATORS.test(prop)) return value;
      return async (...args: unknown[]) => {
        const result = await (value as (...a: unknown[]) => unknown).apply(
          target,
          args,
        );
        saveState(getState);
        return result;
      };
    },
  });
}
