/// <reference types="vite/client" />

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
