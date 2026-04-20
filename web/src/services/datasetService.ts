/**
 * Stateless data-loading service. The only persisted state lives inside
 * the singleton {@link standardLoader} (the parsed blob + decoded chunk
 * cache); from the store's perspective this surface is still a stateless
 * promise factory.
 *
 * Wraps `N2kLoader` so that swapping the persistence layer (JSON →
 * binary blob → IndexedDB-cached fetch) only changes one file.
 */
import { standardLoader } from "./n2kLoader";
import type {
  ByTargetEntry,
  DatasetIndex,
  DiceDetail,
  DiceTriple,
  DifficultyMatrix,
  TargetStatsEntry,
} from "../core/types";

export const datasetService = {
  loadIndex(): Promise<DatasetIndex> {
    return standardLoader.loadIndex();
  },

  loadDice(dice: DiceTriple): Promise<DiceDetail> {
    return standardLoader.loadDice(dice);
  },

  loadByTarget(): Promise<Readonly<Record<string, ByTargetEntry | null>>> {
    return standardLoader.loadByTarget();
  },

  loadTargetStats(): Promise<Readonly<Record<string, TargetStatsEntry>>> {
    return standardLoader.loadTargetStats();
  },

  loadDifficultyMatrix(): Promise<DifficultyMatrix> {
    return standardLoader.loadDifficultyMatrix();
  },
};
