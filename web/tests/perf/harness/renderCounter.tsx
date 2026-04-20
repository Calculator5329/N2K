import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";

export interface RenderCounter {
  get(id: string): number;
  reset(id?: string): void;
  record: ProfilerOnRenderCallback;
}

export function createRenderCounter(): RenderCounter {
  const counts = new Map<string, number>();
  const record: ProfilerOnRenderCallback = (id) => {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  return {
    get: (id) => counts.get(id) ?? 0,
    reset: (id) => { if (id) counts.delete(id); else counts.clear(); },
    record,
  };
}

export function CountProfiler({
  id, counter, children,
}: { id: string; counter: RenderCounter; children: ReactNode }) {
  return <Profiler id={id} onRender={counter.record}>{children}</Profiler>;
}
