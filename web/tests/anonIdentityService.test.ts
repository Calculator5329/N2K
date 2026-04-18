import { beforeEach, describe, expect, it } from "vitest";
import { AnonIdentityService } from "../src/services/local/anonIdentityService.js";

describe("AnonIdentityService", () => {
  beforeEach(() => {
    // happy-dom provides localStorage; clear between tests
    if (typeof localStorage !== "undefined") localStorage.clear();
  });

  it("generates a stable id on first call", () => {
    const svc = new AnonIdentityService();
    const u = svc.currentUser();
    expect(u.id).toMatch(/^[0-9a-z]{12}$/);
    expect(u.anonymous).toBe(true);
    expect(u.displayName.length).toBeGreaterThan(0);
  });

  it("reuses the persisted id across instances", () => {
    const a = new AnonIdentityService();
    const idA = a.currentUser().id;
    const b = new AnonIdentityService();
    expect(b.currentUser().id).toBe(idA);
  });

  it("onChange fires immediately with the current user", () => {
    const svc = new AnonIdentityService();
    let received: string | null = null;
    svc.onChange((u) => {
      received = u.id;
    });
    expect(received).toBe(svc.currentUser().id);
  });

  it("onChange fires again after rename", () => {
    const svc = new AnonIdentityService();
    const initialName = svc.currentUser().displayName;
    const events: string[] = [];
    svc.onChange((u) => events.push(u.displayName));
    svc.renameForTesting("New Name");
    expect(events).toEqual([initialName, "New Name"]);
  });

  it("unsubscribe stops further events", () => {
    const svc = new AnonIdentityService();
    const events: string[] = [];
    const off = svc.onChange((u) => events.push(u.displayName));
    expect(events.length).toBe(1);
    off();
    svc.renameForTesting("Other");
    expect(events.length).toBe(1);
  });

  it("resetForTesting yields a different id", () => {
    const svc = new AnonIdentityService();
    const before = svc.currentUser().id;
    svc.resetForTesting();
    expect(svc.currentUser().id).not.toBe(before);
  });
});
