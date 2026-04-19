import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";
import { DicePicker } from "./DicePicker.js";
import { ModePicker } from "./ModePicker.js";
import { TargetGrid } from "./TargetGrid.js";
import { SolutionsPanel } from "./SolutionsPanel.js";

/**
 * Lookup — pick a (mode, dice) and explore every reachable target with
 * its easiest known equation. Click a target to see every distinct
 * solution at that exact total.
 */
export const LookupView = observer(function LookupView() {
  const store = useAppStore().lookup;

  return (
    <div className="flex flex-col gap-6 p-6 mx-auto" style={{ maxWidth: 1100 }}>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Lookup</h1>
        <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
          Pick a mode and a dice tuple. The platform shows every target the
          dice can hit, sorted by difficulty. Click a target to see every
          distinct equation.
        </p>
      </header>

      <section
        className="grid gap-4 p-4 rounded border"
        style={{
          borderColor: "var(--color-rule)",
          background: "var(--color-surface)",
          gridTemplateColumns: "minmax(200px, 1fr) minmax(280px, 2fr)",
        }}
      >
        <ModePicker store={store} />
        <DicePicker store={store} />
      </section>

      <TargetGrid store={store} />
      <SolutionsPanel store={store} />
    </div>
  );
});
