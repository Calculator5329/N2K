import { observer } from "mobx-react-lite";
import {
  BOARD_COLS,
  BOARD_SIZE,
  type BoardConfig,
  type CompositionStore,
} from "./CompositionStore";

/**
 * Per-board editor card. Lets the user toggle between random/pattern boards,
 * tweak parameters, set per-cell overrides on a 6×6 grid, preview the result,
 * and remove the board.
 *
 * Stays presentation-only — every mutation routes through `CompositionStore`.
 */
export const BoardEditor = observer(function BoardEditor({
  store,
  board,
  index,
}: {
  store: CompositionStore;
  board: BoardConfig;
  index: number;
}) {
  return (
    <div className="border border-ink-100/20 bg-paper-50 px-6 py-5">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-wide-caps uppercase text-oxblood-500">
            Board {index + 1}
          </span>
          <KindToggle store={store} board={board} />
        </div>
        <button
          type="button"
          onClick={() => store.removeBoard(board.id)}
          className="text-[11px] font-mono uppercase tracking-wide-caps text-ink-100 hover:text-oxblood-500 transition-colors"
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-12 gap-y-6 md:gap-6">
        {/* LEFT — parameter inputs */}
        <div className="col-span-12 md:col-span-5 space-y-4 min-w-0">
          {board.kind === "random" ? (
            <RandomParams store={store} board={board} />
          ) : (
            <PatternParams store={store} board={board} />
          )}
          <RoundsField store={store} board={board} />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => store.previewBoard(board.id)}
              className="px-3 py-1.5 text-[12px] font-mono uppercase tracking-wide-caps text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
              style={{ borderRadius: "2px" }}
            >
              Preview
            </button>
            {board.errorMessage && (
              <span className="text-[11px] font-mono text-oxblood-500 self-center">
                {board.errorMessage}
              </span>
            )}
          </div>
        </div>

        {/* RIGHT — 6×6 override grid (also doubles as preview) */}
        <div className="col-span-12 md:col-span-7 min-w-0">
          <div className="label-caps mb-2 flex items-baseline justify-between">
            <span>Cells (click to pin)</span>
            <span className="text-ink-100/70">
              {board.overrides.size > 0
                ? `${board.overrides.size} pinned`
                : "no pins"}
            </span>
          </div>
          <CellGrid store={store} board={board} />
        </div>
      </div>
    </div>
  );
});

const KindToggle = observer(function KindToggle({
  store,
  board,
}: {
  store: CompositionStore;
  board: BoardConfig;
}) {
  return (
    <div className="inline-flex border border-ink-100/30" style={{ borderRadius: "2px" }}>
      {(["random", "pattern"] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => store.updateBoard(board.id, { kind })}
          className={[
            "px-3 py-1 text-[11px] font-mono uppercase tracking-wide-caps",
            board.kind === kind
              ? "bg-oxblood-500 text-paper-50"
              : "text-ink-200 hover:text-ink-500",
          ].join(" ")}
        >
          {kind}
        </button>
      ))}
    </div>
  );
});

const RandomParams = observer(function RandomParams({
  store,
  board,
}: {
  store: CompositionStore;
  board: BoardConfig;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField
        label="Min"
        value={board.rangeMin}
        min={1}
        max={9999}
        onChange={(v) => store.updateBoard(board.id, { rangeMin: v })}
      />
      <NumberField
        label="Max"
        value={board.rangeMax}
        min={1}
        max={9999}
        onChange={(v) => store.updateBoard(board.id, { rangeMax: v })}
      />
    </div>
  );
});

const PatternParams = observer(function PatternParams({
  store,
  board,
}: {
  store: CompositionStore;
  board: BoardConfig;
}) {
  const setMultipleAt = (i: number, value: number | null) => {
    const next = [...board.multiples];
    if (value === null) {
      next.splice(i, 1);
    } else {
      next[i] = value;
    }
    store.updateBoard(board.id, { multiples: next });
  };

  const addMultiple = () => {
    if (board.multiples.length >= 3) return;
    store.updateBoard(board.id, {
      multiples: [...board.multiples, board.multiples[board.multiples.length - 1] ?? 1],
    });
  };

  return (
    <div className="space-y-3">
      <NumberField
        label="Start"
        value={board.patternStart}
        min={-99}
        max={9999}
        onChange={(v) => store.updateBoard(board.id, { patternStart: v })}
      />
      <div>
        <div className="label-caps mb-1.5">
          Multiples ({board.multiples.length}/3)
        </div>
        <div className="flex gap-2 flex-wrap">
          {board.multiples.map((m, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                type="number"
                value={m}
                onChange={(e) => setMultipleAt(i, Number(e.target.value))}
                className="w-16 bg-paper-100 border border-ink-100/30 font-mono tabular text-[14px] text-center text-ink-500 px-1 py-0.5 focus:outline-none focus:border-oxblood-500"
                style={{ borderRadius: "2px" }}
              />
              {board.multiples.length > 1 && (
                <button
                  type="button"
                  onClick={() => setMultipleAt(i, null)}
                  className="text-ink-100 hover:text-oxblood-500 text-xs px-1"
                  aria-label="remove multiple"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {board.multiples.length < 3 && (
            <button
              type="button"
              onClick={addMultiple}
              className="text-[11px] font-mono uppercase tracking-wide-caps text-ink-200 border border-dashed border-ink-100/40 px-2 py-0.5 hover:border-oxblood-500 hover:text-oxblood-500"
              style={{ borderRadius: "2px" }}
            >
              + add
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

const RoundsField = observer(function RoundsField({
  store,
  board,
}: {
  store: CompositionStore;
  board: BoardConfig;
}) {
  return (
    <NumberField
      label="Rounds"
      value={board.rounds}
      min={1}
      max={20}
      onChange={(v) => store.updateBoard(board.id, { rounds: v })}
    />
  );
});

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="label-caps block mb-1">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-full bg-paper-100 border border-ink-100/30 font-mono tabular text-[14px] text-ink-500 px-2 py-1 focus:outline-none focus:border-oxblood-500"
        style={{ borderRadius: "2px" }}
      />
    </label>
  );
}

const CellGrid = observer(function CellGrid({
  store,
  board,
}: {
  store: CompositionStore;
  board: BoardConfig;
}) {
  return (
    <div
      className="grid gap-px bg-ink-100/15 p-px"
      style={{
        gridTemplateColumns: `repeat(${BOARD_COLS}, minmax(0, 1fr))`,
        borderRadius: "2px",
      }}
    >
      {Array.from({ length: BOARD_SIZE }).map((_, slot) => {
        const row = Math.floor(slot / BOARD_COLS);
        const col = slot % BOARD_COLS;
        const previewValue = board.preview?.[slot];
        const overrideValue = board.overrides.get(slot);
        return (
          <Cell
            key={slot}
            row={row}
            col={col}
            slot={slot}
            previewValue={previewValue}
            overrideValue={overrideValue}
            onPin={(value) => store.setOverride(board.id, slot, value)}
          />
        );
      })}
    </div>
  );
});

function Cell({
  row,
  col,
  slot,
  previewValue,
  overrideValue,
  onPin,
}: {
  row: number;
  col: number;
  slot: number;
  previewValue: number | undefined;
  overrideValue: number | undefined;
  onPin: (value: number | null) => void;
}) {
  const isPinned = overrideValue !== undefined;
  const display =
    overrideValue ?? (previewValue !== undefined ? previewValue : "");

  return (
    <div
      className={[
        "relative h-12 flex items-center justify-center bg-paper-50",
        isPinned ? "ring-1 ring-oxblood-500" : "",
      ].join(" ")}
      title={`row ${row}, col ${col}, slot ${slot}`}
    >
      <input
        type="number"
        value={display === "" ? "" : String(display)}
        placeholder=""
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onPin(null);
            return;
          }
          const v = Number(raw);
          if (Number.isFinite(v)) onPin(v);
        }}
        className={[
          "w-full h-full text-center bg-transparent font-mono tabular text-[13px] focus:outline-none",
          isPinned ? "text-oxblood-500 font-medium" : "text-ink-300",
        ].join(" ")}
      />
      {isPinned && (
        <span className="absolute top-0.5 right-1 text-[8px] font-mono text-oxblood-500/70">
          pin
        </span>
      )}
    </div>
  );
}
