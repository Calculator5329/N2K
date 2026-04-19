import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";
import { DicePicker } from "./DicePicker.js";
import { ModePicker } from "./ModePicker.js";
import { TargetGrid } from "./TargetGrid.js";
import { TargetNeighborhood } from "./TargetNeighborhood.js";
import { SolutionsPanel } from "./SolutionsPanel.js";
import { PageHeader } from "../../ui/primitives/PageHeader.js";
import { navItemById } from "../../ui/layouts/nav.js";

/**
 * Lookup — pick a (mode, dice) and explore every reachable target with
 * its easiest known equation. Click a target to see every distinct
 * solution at that exact total.
 */
export const LookupView = observer(function LookupView() {
  const store = useAppStore().lookup;
  const item = navItemById("lookup");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        folio={item.folio}
        eyebrow="Targets, by dice"
        title="Lookup"
        dek="Pick a mode and a dice tuple. The platform shows every target the dice can hit, sorted by difficulty. Click a target to see every distinct equation."
      />

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

      <TargetNeighborhood store={store} />
      <TargetGrid store={store} />
      <SolutionsPanel store={store} />
    </div>
  );
});
