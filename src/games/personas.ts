/**
 * Bot personas for N2K Classic.
 *
 * NOTE — divergence from v1: v1's `web/src/features/play/personas.ts`
 * exposed personas with `(speed, difficultyCeiling, greediness)`. The
 * v2 plan calls for a different shape — `(difficultyTarget,
 * mistakeRate, passThreshold, thinkMs)` — which gives the bot a
 * narrower behavioral contract: pick the easiest move that lands
 * inside a target difficulty band, occasionally make a sub-optimal
 * choice on purpose, and pass when nothing easy enough is available.
 *
 * The four personas below are calibrated to feel similar to v1's
 * (rookie / casual / sharp / expert) while conforming to the new
 * fields:
 *
 *   easy      — wide band (any easy move), high mistake rate, fast
 *   standard  — medium band, moderate mistakes, normal speed
 *   hard      — narrow low-difficulty band, rare mistakes, slow think
 *   aether    — Æther-only persona; comfortable with arity 4-5
 */
import { AETHER_MODE } from "../core/constants.js";
import type { Mode } from "../core/types.js";

export type PersonaId = "easy" | "standard" | "hard" | "aether";

export interface Persona {
  readonly id: PersonaId;
  readonly displayName: string;
  /** Bot aims to pick moves whose difficulty is in this range. */
  readonly difficultyTarget: { readonly min: number; readonly max: number };
  /** Probability of picking a sub-optimal move on purpose (0..1). */
  readonly mistakeRate: number;
  /** Bot will pass instead of claiming if every option exceeds this difficulty. */
  readonly passThreshold: number;
  /** Synthetic latency (ms) added to pickMove to feel more human in the UI. */
  readonly thinkMs: number;
}

export const EASY_PERSONA: Persona = {
  id: "easy",
  displayName: "Easy",
  difficultyTarget: { min: 0, max: 30 },
  mistakeRate: 0.4,
  passThreshold: 25,
  thinkMs: 250,
};

export const STANDARD_PERSONA: Persona = {
  id: "standard",
  displayName: "Standard",
  difficultyTarget: { min: 0, max: 50 },
  mistakeRate: 0.2,
  passThreshold: 50,
  thinkMs: 500,
};

export const HARD_PERSONA: Persona = {
  id: "hard",
  displayName: "Hard",
  difficultyTarget: { min: 0, max: 70 },
  mistakeRate: 0.05,
  passThreshold: 80,
  thinkMs: 900,
};

export const AETHER_PERSONA: Persona = {
  id: "aether",
  displayName: "Æther",
  difficultyTarget: { min: 0, max: 95 },
  mistakeRate: 0.05,
  passThreshold: 100,
  thinkMs: 1200,
};

export const PERSONAS: readonly Persona[] = [
  EASY_PERSONA,
  STANDARD_PERSONA,
  HARD_PERSONA,
  AETHER_PERSONA,
];

export function getPersona(id: PersonaId): Persona {
  const match = PERSONAS.find((p) => p.id === id);
  if (match === undefined) throw new Error(`unknown persona: ${id}`);
  return match;
}

/**
 * Personas that are eligible for a given mode. The Æther persona is
 * gated to Æther mode; the rest are mode-agnostic.
 */
export function personasForMode(mode: Mode): readonly Persona[] {
  if (mode.id === "aether" || mode === AETHER_MODE) return PERSONAS;
  return PERSONAS.filter((p) => p.id !== "aether");
}
