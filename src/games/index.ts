/**
 * Public surface of the games module.
 *
 * Re-exports every concrete game + player implementation so consumers
 * can write `import { n2kClassicGame, LocalBot } from "n2k-platform/games"`
 * once the package exports are wired (see `package.json`).
 */
export * from "./n2kClassic.js";
export * from "./n2kClassicSerializer.js";
export * from "./n2kClassicBots.js";
export * from "./personas.js";
