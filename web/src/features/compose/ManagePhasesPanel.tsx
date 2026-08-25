/**
 * `ManagePhasesPanel` — modal panel for phase CRUD.
 *
 * Opened from the Compose header ("Manage phases" button); lets the
 * user add, rename, reorder, duplicate, and delete phases. Editing
 * boards within a phase happens in the main Compose view via the
 * phase tabs.
 */
import { observer } from "mobx-react-lite";
import { useState } from "react";
import type { CompositionStore } from "./CompositionStore.js";

export const ManagePhasesPanel = observer(function ManagePhasesPanel({
  store,
  onClose,
}: {
  store: CompositionStore;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      data-testid="compose.phases.backdrop"
      aria-modal="true"
      aria-label="Manage phases"
      className="fixed inset-0 z-40 bg-ink-500/40 flex items-start justify-center pt-20 px-4"
      onClick={onClose}
    >
      <div
        data-testid="compose.phases.panel"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] bg-paper-50 border border-ink-300 p-6 shadow-2xl"
        style={{ borderRadius: "4px" }}
      >
        <div className="flex items-baseline justify-between mb-4">
          <div
            className="font-display text-[24px] text-ink-500"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
          >
            Manage phases
          </div>
          <button
            type="button"
            data-testid="compose.phases.close"
            onClick={onClose}
            className="font-mono text-[12px] text-ink-200 hover:text-oxblood-500"
          >
            ✕ Close
          </button>
        </div>
        <ul className="space-y-2 mb-4">
          {store.phases.map((phase, idx) => (
            <PhaseRow key={phase.id} store={store} phaseId={phase.id} index={idx} />
          ))}
        </ul>
        <button
          type="button"
          data-testid="compose.phases.add"
          onClick={() => store.addPhase()}
          className="px-3 py-1.5 font-mono uppercase tracking-wide-caps text-[11px] text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
          style={{ borderRadius: "2px" }}
        >
          + Add phase
        </button>
      </div>
    </div>
  );
});

const PhaseRow = observer(function PhaseRow({
  store,
  phaseId,
  index,
}: {
  store: CompositionStore;
  phaseId: string;
  index: number;
}) {
  const phase = store.phases.find((p) => p.id === phaseId);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(phase?.name ?? "");
  if (phase === undefined) return null;
  return (
    <li
      className="flex items-center gap-2 px-3 py-2 border border-ink-100/30 bg-paper-100"
      style={{ borderRadius: "2px" }}
    >
      <span className="font-mono uppercase tracking-wide-caps text-[10px] text-ink-100 w-6 text-right">
        {index + 1}.
      </span>
      {editing ? (
        <input
          autoFocus
          data-testid={`compose.phases.name-${phase.id}`}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => {
            store.renamePhase(phase.id, draftName);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              store.renamePhase(phase.id, draftName);
              setEditing(false);
            } else if (e.key === "Escape") {
              setDraftName(phase.name);
              setEditing(false);
            }
          }}
          className="flex-1 px-2 py-1 text-[13px] border border-ink-100/40 bg-paper-50"
          style={{ borderRadius: "2px" }}
        />
      ) : (
        <button
          type="button"
          data-testid={`compose.phases.rename-${phase.id}`}
          onClick={() => {
            setDraftName(phase.name);
            setEditing(true);
          }}
          className="flex-1 text-left font-display text-[16px] text-ink-500 hover:text-oxblood-500"
          style={{ fontVariationSettings: '"opsz" 60, "SOFT" 30' }}
          title="Click to rename"
        >
          {phase.name}
        </button>
      )}
      <span className="font-mono text-[10px] text-ink-200 mr-2">
        {phase.boards.length} board{phase.boards.length === 1 ? "" : "s"}
      </span>
      <IconBtn
        testId={`compose.phases.move-up-${phase.id}`}
        title="Move up"
        disabled={index === 0}
        onClick={() => store.reorderPhase(phase.id, index - 1)}
      >
        ↑
      </IconBtn>
      <IconBtn
        testId={`compose.phases.move-down-${phase.id}`}
        title="Move down"
        disabled={index === store.phases.length - 1}
        onClick={() => store.reorderPhase(phase.id, index + 1)}
      >
        ↓
      </IconBtn>
      <IconBtn testId={`compose.phases.duplicate-${phase.id}`} title="Duplicate" onClick={() => store.duplicatePhase(phase.id)}>
        ⧉
      </IconBtn>
      <IconBtn
        testId={`compose.phases.delete-${phase.id}`}
        title="Delete"
        disabled={store.phases.length <= 1}
        onClick={() => {
          if (!confirm(`Delete phase "${phase.name}" and all its boards?`)) return;
          store.removePhase(phase.id);
        }}
        destructive
      >
        ✕
      </IconBtn>
    </li>
  );
});

function IconBtn(props: {
  testId: string;
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      onClick={props.onClick}
      title={props.title}
      disabled={props.disabled}
      className={[
        "px-2 py-0.5 font-mono text-[12px] border transition-colors",
        props.disabled
          ? "border-ink-100/20 text-ink-100/40 cursor-not-allowed"
          : props.destructive
          ? "border-ink-100/40 text-ink-200 hover:border-oxblood-500 hover:text-oxblood-500"
          : "border-ink-100/40 text-ink-300 hover:border-oxblood-500 hover:text-oxblood-500",
      ].join(" ")}
      style={{ borderRadius: "2px" }}
    >
      {props.children}
    </button>
  );
}
