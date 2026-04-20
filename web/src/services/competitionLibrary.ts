/**
 * `competitionLibrary` — service layer for the saved Competition library.
 *
 * Sits between the LibraryStore (state + UI) and the abstract
 * ContentBackend (LocalStorage today, IndexedDB / cloud tomorrow).
 * Stateless on purpose so the same primitives can be reused from
 * tests, the future export tooling, and from ad-hoc scripts.
 *
 * Saved-comp ids are keyed `compose:saved:{uuid}` — the same
 * `compose:` namespace the working draft uses (`compose:current`)
 * so a future "promote draft to library entry" command can stay in
 * the same prefix. Match-state and stats live under their own
 * namespaces (`match:current`, `stats:{uuid}`).
 *
 * Schema versioning matches `CompositionStore.DOC_SCHEMA_VERSION`
 * (currently 5). Older docs decode through `applySnapshot`'s
 * back-compat path; this service doesn't migrate on read.
 */
import {
  defaultContentBackend,
  type ContentBackend,
  type ContentDoc,
} from "./contentBackend";
import type {
  AnySharedPlan,
  SharedPlanV5,
} from "../features/compose/CompositionStore";

const SAVED_PREFIX = "compose:saved:";
const DRAFT_ID = "compose:current";

/** Build a fresh saved-comp id with a short, URL-safe uuid suffix. */
export function newSavedId(): string {
  return SAVED_PREFIX + cryptoRandomId();
}

/** True iff the given id targets a saved Library entry (not the draft). */
export function isSavedId(id: string): boolean {
  return id.startsWith(SAVED_PREFIX) && id !== DRAFT_ID;
}

/** A library entry — header summary used by the Library list. */
export interface LibraryEntry {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  /** True when every board has a generated result. */
  readonly isGenerated: boolean;
  readonly phaseCount: number;
  readonly boardCount: number;
  readonly boutCount: number;
  readonly rules: SharedPlanV5["rules"];
  /**
   * 36-cell preview of the first generated board (Phase 1 / Board 1)
   * so the Library card can render a glanceable thumbnail without
   * re-loading the whole comp body. Empty array when no generated
   * board is available yet.
   */
  readonly firstBoardCells: readonly number[];
}

export interface CompetitionLibraryService {
  list(): Promise<readonly LibraryEntry[]>;
  load(id: string): Promise<ContentDoc<AnySharedPlan> | null>;
  remove(id: string): Promise<void>;
  rename(id: string, name: string): Promise<boolean>;
  /**
   * Save a snapshot under the given id. Used both by Save-as-new (id
   * generated via `newSavedId()`) and by autosave-routing in
   * `CompositionStore`.
   */
  save(id: string, body: SharedPlanV5): Promise<void>;
  /**
   * Duplicate the entry under a new id; returns the new id (or
   * `null` if the source id was missing).
   */
  duplicate(sourceId: string, newName?: string): Promise<string | null>;
}

export class CompetitionLibrary implements CompetitionLibraryService {
  constructor(private readonly backend: ContentBackend = defaultContentBackend) {}

  async list(): Promise<readonly LibraryEntry[]> {
    const ids = await this.backend.list();
    const entries: LibraryEntry[] = [];
    for (const id of ids) {
      if (!isSavedId(id)) continue;
      const doc = await this.backend.load<AnySharedPlan>(id);
      if (doc === null) continue;
      entries.push(summarize(id, doc));
    }
    return entries;
  }

  async load(id: string): Promise<ContentDoc<AnySharedPlan> | null> {
    return this.backend.load<AnySharedPlan>(id);
  }

  async remove(id: string): Promise<void> {
    if (!isSavedId(id)) return;
    await this.backend.remove(id);
  }

  async rename(id: string, name: string): Promise<boolean> {
    const doc = await this.backend.load<AnySharedPlan>(id);
    if (doc === null) return false;
    const trimmed = name.trim();
    if (trimmed === "") return false;
    // Renames only apply cleanly to v5 envelopes (older envelopes get
    // promoted to v5 next time the user opens + autosaves them in
    // Compose). Refuse rather than silently re-shape pre-v5 docs.
    if (doc.body.version !== 5) return false;
    const next: ContentDoc<SharedPlanV5> = {
      ...doc,
      body: { ...doc.body, name: trimmed },
      updatedAt: new Date().toISOString(),
    };
    await this.backend.save(next);
    return true;
  }

  async save(id: string, body: SharedPlanV5): Promise<void> {
    const doc: ContentDoc<SharedPlanV5> = {
      id,
      body,
      updatedAt: new Date().toISOString(),
      schemaVersion: 5,
    };
    await this.backend.save(doc);
  }

  async duplicate(
    sourceId: string,
    newName?: string,
  ): Promise<string | null> {
    const doc = await this.backend.load<AnySharedPlan>(sourceId);
    if (doc === null || doc.body.version !== 5) return null;
    const id = newSavedId();
    const baseName = newName ?? `${doc.body.name} (copy)`;
    const body: SharedPlanV5 = { ...doc.body, name: baseName };
    await this.save(id, body);
    return id;
  }
}

/** Project a stored doc onto the lightweight summary the list uses. */
function summarize(id: string, doc: ContentDoc<AnySharedPlan>): LibraryEntry {
  const body = doc.body;
  let name = "Untitled competition";
  let rules: SharedPlanV5["rules"] = "standard";
  let phaseCount = 0;
  let boardCount = 0;
  let boutCount = 0;
  let isGenerated = false;
  let firstBoardCells: readonly number[] = [];

  if (body.version === 5) {
    name = body.name?.trim() === "" ? "Untitled competition" : body.name;
    rules = body.rules;
    phaseCount = body.phases.length;
    for (const phase of body.phases) {
      boardCount += phase.boards.length;
      for (const b of phase.boards) boutCount += b.bouts;
    }
    isGenerated =
      boardCount > 0 &&
      body.phases.every((p) => p.boards.every((b) => b.result !== undefined));
    // First generated board's preview, used for the card thumbnail.
    outer: for (const phase of body.phases) {
      for (const b of phase.boards) {
        const preview = (b as { preview?: readonly number[] }).preview;
        if (preview && preview.length === 36) {
          firstBoardCells = preview;
          break outer;
        }
      }
    }
  } else {
    // Older envelopes were never saved into the Library in the first
    // place (the Library only writes v5), but we tolerate them here
    // so a user editing a legacy doc as their draft can still see it.
    // TS can't narrow `version >= 3` against the V1..V4 union (only
    // `===` discriminates), so we cast on the per-branch reads.
    rules =
      body.version >= 3
        ? (body as { rules: SharedPlanV5["rules"] }).rules
        : "standard";
    phaseCount = 1;
    boardCount = body.boards.length;
    for (const b of body.boards) boutCount += b.rounds;
    isGenerated =
      boardCount > 0 &&
      (body.version >= 2
        ? body.boards.every(
            (b) => (b as { result?: unknown }).result !== undefined,
          )
        : false);
    if (body.version >= 2) {
      for (const b of body.boards) {
        const preview = (b as { preview?: readonly number[] }).preview;
        if (preview && preview.length === 36) {
          firstBoardCells = preview;
          break;
        }
      }
    }
  }

  return {
    id,
    name,
    updatedAt: doc.updatedAt,
    isGenerated,
    phaseCount,
    boardCount,
    boutCount,
    rules,
    firstBoardCells,
  };
}

/** Short, URL-safe random id — 11 chars of base32 entropy is plenty for LS. */
function cryptoRandomId(): string {
  // Prefer crypto when available (browser, Node 18+), fall back to
  // Math.random in the SSR / test fallbacks.
  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(36).padStart(2, "0");
  }
  return out.slice(0, 12);
}

/** Default singleton service, ready to import from any layer. */
export const defaultCompetitionLibrary = new CompetitionLibrary();
