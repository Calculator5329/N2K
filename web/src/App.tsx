import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useAppStore } from "./stores/AppStoreContext.js";

export const App = observer(function App() {
  const store = useAppStore();
  const { theme, identity } = store;

  // Apply the active theme tokens to the document root whenever it changes.
  useEffect(() => {
    theme.applyTo(document.documentElement);
  }, [theme, theme.activeId]);

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "var(--color-bg)", color: "var(--color-ink)" }}
    >
      <header className="border-b" style={{ borderColor: "var(--color-rule)" }}>
        <div className="mx-auto max-w-5xl px-6 py-5 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">N2K</h1>
            <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
              v2 platform — foundation
            </p>
          </div>
          <ThemeSwitcher />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
        <Card title="Identity">
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            Signed in as
          </p>
          <p className="text-lg font-medium">{identity.user.displayName}</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-ink-muted)" }}>
            id: <code>{identity.user.id}</code>
            {identity.user.anonymous ? " (anonymous, local)" : ""}
          </p>
        </Card>

        <Card title="Status">
          <ul className="text-sm space-y-1.5" style={{ color: "var(--color-ink-muted)" }}>
            <li>• Three-layer architecture: UI &rarr; Stores &rarr; Services</li>
            <li>• Pluggable backends: ContentBackend / IdentityService / AIService</li>
            <li>• Single domain: NEquation + Mode-parameterized solver</li>
            <li>• Game kernel ready for N2K Classic + future minigames</li>
          </ul>
          <p className="mt-4 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Phase 3 (web foundation) in progress. Phase 4 (Play surface) and
            Phase 5 (compose / dataset / lookup) follow.
          </p>
        </Card>
      </main>
    </div>
  );
});

const Card = observer(function Card(props: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="p-6"
      style={{
        background: "var(--color-surface)",
        boxShadow: "var(--shadow-card)",
        borderRadius: "var(--radius-card)",
      }}
    >
      <h2 className="text-sm uppercase tracking-wider mb-3" style={{ color: "var(--color-ink-muted)" }}>
        {props.title}
      </h2>
      {props.children}
    </section>
  );
});

const ThemeSwitcher = observer(function ThemeSwitcher() {
  const store = useAppStore();
  return (
    <select
      value={store.theme.activeId}
      onChange={(e) => store.theme.setActive(e.target.value)}
      className="text-sm rounded px-2 py-1.5 border"
      style={{
        borderColor: "var(--color-rule)",
        background: "var(--color-surface)",
        color: "var(--color-ink)",
      }}
    >
      {store.theme.availableThemes.map((t) => (
        <option key={t.id} value={t.id}>
          {t.displayName}
        </option>
      ))}
    </select>
  );
});
