/**
 * Studio surface — surfaces every pluggable service seam in the app.
 *
 * Every render reaches the screen through one of seven swappable
 * services. Today they are local; tomorrow they can be Cloud Run /
 * Firestore / Firebase Auth / Gemini without a single feature view
 * changing. This view exists so the architecture is observable.
 */
import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";

export const StudioSurface = observer(function StudioSurface() {
  const { services } = useAppStore();
  const seams: ReadonlyArray<{ readonly key: string; readonly impl: string; readonly hint: string }> = [
    { key: "ContentBackend", impl: services.content.constructor.name, hint: "boards · themes · plans" },
    { key: "IdentityService", impl: services.identity.constructor.name, hint: "anonymous → cloud sign-in" },
    { key: "AIService", impl: services.ai.constructor.name, hint: "theme + plan generation" },
    { key: "DatasetClient", impl: services.dataset.constructor.name, hint: "tuple sweeps + caching" },
    { key: "SolverWorkerService", impl: services.solverWorker.constructor.name, hint: "interactive solves" },
    { key: "TupleIndexService", impl: services.tupleIndex.constructor.name, hint: "explore catalog" },
    { key: "CompetitionService", impl: services.competition.constructor.name, hint: "balanced board generator" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="label-caps text-accent-500 text-[10px] mb-1">Live service</div>
        <h1 className="font-display text-[34px] leading-[1.05] text-ink-500" style={{ letterSpacing: "-0.01em" }}>
          Studio
        </h1>
        <p className="mt-3 max-w-prose text-[14px] text-ink-300 leading-relaxed">
          Every render in this app reaches the screen through one of seven swappable
          service seams. Today they're local. Tomorrow they're Cloud Run, Firestore,
          Firebase Auth, and Gemini — without a single feature view changing.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3" aria-label="Service seams">
        {seams.map((s) => (
          <article
            key={s.key}
            className="px-4 py-3"
            style={{
              background: "rgb(var(--paper-100))",
              border: "1px solid rgb(var(--ink-100))",
              borderRadius: 4,
            }}
          >
            <header className="flex items-baseline justify-between gap-3 mb-1.5">
              <h3 className="font-display text-[15px] text-ink-500" style={{ fontWeight: 600 }}>
                {s.key}
              </h3>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent-500"
                style={{
                  border: "1px solid rgb(var(--accent-500) / 0.6)",
                  borderRadius: 3,
                  padding: "2px 6px",
                }}
              >
                {s.impl}
              </span>
            </header>
            <p className="text-[12px] text-ink-300">{s.hint}</p>
          </article>
        ))}
      </section>
    </div>
  );
});
