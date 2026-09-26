/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dataset compile date (ISO), injected by `vite.config.ts`. */
  readonly VITE_N2K_DATASET_DATE?: string;
}

declare module "*?worker" {
  const WorkerCtor: {
    new (options?: { name?: string }): Worker;
  };
  export default WorkerCtor;
}

declare module "*?worker&inline" {
  const WorkerCtor: {
    new (options?: { name?: string }): Worker;
  };
  export default WorkerCtor;
}
