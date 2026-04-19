/**
 * Tiny MobX store that mirrors the active `IdentityService` user.
 *
 * Stores own MobX. The IdentityService produces sync + async user
 * updates; this store turns them into observables so React components
 * can `useIdentity()` without dealing with subscription plumbing.
 */
import { action, makeObservable, observable } from "mobx";
import type { IdentityService, User } from "../services/identityService.js";

export class IdentityStore {
  user: User;
  private readonly disposeListener: () => void;

  constructor(private readonly identity: IdentityService) {
    this.user = identity.currentUser();
    makeObservable(this, {
      user: observable.ref,
      setUser: action,
    });
    this.disposeListener = identity.onChange((u) => this.setUser(u));
  }

  setUser(user: User): void {
    this.user = user;
  }

  dispose(): void {
    this.disposeListener();
  }
}
