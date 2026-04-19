import { describe, expect, it } from "vitest";
import {
  flag,
  optionalInt,
  optionalIntList,
  optionalString,
  parseArgs,
  requireString,
} from "../../src/cli/parseArgs.js";

describe("parseArgs", () => {
  it("returns empty result for no args", () => {
    const r = parseArgs([]);
    expect(r.positionals).toEqual([]);
    expect(r.options).toEqual({});
  });

  it("collects positional arguments", () => {
    const r = parseArgs(["solve", "47"]);
    expect(r.positionals).toEqual(["solve", "47"]);
    expect(r.options).toEqual({});
  });

  it("parses --key value pairs", () => {
    const r = parseArgs(["--mode", "aether", "--dice", "2,3,5"]);
    expect(r.options).toEqual({ mode: "aether", dice: "2,3,5" });
    expect(r.positionals).toEqual([]);
  });

  it("parses --key=value", () => {
    const r = parseArgs(["--mode=aether", "--target=47"]);
    expect(r.options).toEqual({ mode: "aether", target: "47" });
  });

  it("treats trailing --key as boolean true", () => {
    const r = parseArgs(["--verbose"]);
    expect(r.options["verbose"]).toBe(true);
  });

  it("treats --key followed by --other as boolean", () => {
    const r = parseArgs(["--verbose", "--mode", "standard"]);
    expect(r.options["verbose"]).toBe(true);
    expect(r.options["mode"]).toBe("standard");
  });

  it("respects an explicit booleanFlags whitelist", () => {
    const r = parseArgs(["--quiet", "extra"], { booleanFlags: ["quiet"] });
    expect(r.options["quiet"]).toBe(true);
    expect(r.positionals).toEqual(["extra"]);
  });

  it("treats -- as end-of-options", () => {
    const r = parseArgs(["solve", "--", "--target", "47"]);
    expect(r.positionals).toEqual(["solve", "--target", "47"]);
    expect(r.options).toEqual({});
  });

  it("mixes positionals and options", () => {
    const r = parseArgs(["solve", "--target", "47", "extra"]);
    expect(r.positionals).toEqual(["solve", "extra"]);
    expect(r.options).toEqual({ target: "47" });
  });

  it("last value of a repeated key wins", () => {
    const r = parseArgs(["--mode", "standard", "--mode", "aether"]);
    expect(r.options["mode"]).toBe("aether");
  });
});

describe("argv helpers", () => {
  it("requireString throws when missing", () => {
    expect(() => requireString(parseArgs([]), "mode")).toThrow(/mode/);
  });

  it("optionalString returns undefined when absent", () => {
    expect(optionalString(parseArgs([]), "mode")).toBeUndefined();
    expect(optionalString(parseArgs(["--mode", "aether"]), "mode")).toBe(
      "aether",
    );
  });

  it("flag returns false unless explicitly set", () => {
    expect(flag(parseArgs([]), "verbose")).toBe(false);
    expect(flag(parseArgs(["--verbose"]), "verbose")).toBe(true);
    expect(flag(parseArgs(["--verbose=true"]), "verbose")).toBe(true);
  });

  it("optionalInt parses valid integers and rejects non-integers", () => {
    expect(optionalInt(parseArgs(["--target", "47"]), "target")).toBe(47);
    expect(optionalInt(parseArgs([]), "target")).toBeUndefined();
    expect(() =>
      optionalInt(parseArgs(["--target", "4.5"]), "target"),
    ).toThrow();
    expect(() =>
      optionalInt(parseArgs(["--target", "x"]), "target"),
    ).toThrow();
  });

  it("optionalIntList parses comma-separated integers", () => {
    expect(optionalIntList(parseArgs(["--dice", "2,3,5"]), "dice")).toEqual([
      2, 3, 5,
    ]);
    expect(optionalIntList(parseArgs(["--dice", "-3,7,11"]), "dice")).toEqual([
      -3, 7, 11,
    ]);
    expect(optionalIntList(parseArgs([]), "dice")).toBeUndefined();
    expect(() =>
      optionalIntList(parseArgs(["--dice", "2,x,3"]), "dice"),
    ).toThrow();
  });
});
