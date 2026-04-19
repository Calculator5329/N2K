import { register } from "tsx/esm/api";

register();

await import("./exporter.worker.ts");
