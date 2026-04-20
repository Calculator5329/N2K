/**
 * Top-level surface ids the app routes between.
 *
 * v3.2 introduces the **Library** tab as the fourth public surface,
 * alongside Lookup, Compose (Competition builder), and Play. Library
 * browses locally-saved competitions; opening one routes back to
 * Compose, "Play" launches a `MatchStore` and routes to Play.
 */
export type View = "lookup" | "compose" | "library" | "play";
