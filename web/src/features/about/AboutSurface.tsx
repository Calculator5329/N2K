/**
 * About / Colophon surface.
 */
import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";

export const AboutSurface = observer(function AboutSurface() {
  const { identity } = useAppStore();
  return (
    <div className="space-y-6">
      <header>
        <div className="label-caps text-accent-500 text-[10px] mb-1">Colophon</div>
        <h1 className="font-display text-[34px] leading-[1.05] text-ink-500" style={{ letterSpacing: "-0.01em" }}>
          About
        </h1>
        <p className="mt-3 max-w-prose text-[14px] text-ink-300 leading-relaxed">
          N2K v2 — pluggable services, structured themes, real game kernel.
        </p>
      </header>

      <Card title="Identity">
        <p className="text-sm text-ink-300">Signed in as</p>
        <p className="text-lg font-medium text-ink-500">{identity.user.displayName}</p>
        <p className="text-xs mt-1 text-ink-300">
          id: <code>{identity.user.id}</code>
          {identity.user.anonymous ? " (anonymous, local)" : ""}
        </p>
      </Card>

      <Card title="What works today">
        <ul className="text-sm space-y-1.5 text-ink-300">
          <li>• Lookup, Explore, Compare, Visualize, Compose, Play, Gallery</li>
          <li>• 17 bundled themes × 12 layout variants</li>
          <li>• Web Worker solver + virtualized large tables</li>
          <li>• Studio + Sandbox surfaces over the seven service seams</li>
        </ul>
      </Card>

      <Card title="Coming next">
        <ul className="text-sm space-y-1.5 text-ink-300">
          <li>• HTTP dataset client backed by the bulk export pipeline</li>
          <li>• User-authored themes via Gemini, registered into ThemeRegistry</li>
          <li>• Async multiplayer + tournaments on Cloud Run + Firestore</li>
        </ul>
      </Card>
    </div>
  );
});

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="p-4"
      style={{
        background: "rgb(var(--paper-100))",
        border: "1px solid rgb(var(--ink-100))",
        borderRadius: 4,
      }}
    >
      <h2 className="label-caps text-ink-300 text-[10px] mb-2">{title}</h2>
      {children}
    </section>
  );
}
