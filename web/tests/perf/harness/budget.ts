export interface MedianOptions {
  warmup: number;
  samples: number;
}

export function medianMs(fn: () => unknown, opts: MedianOptions): number {
  for (let i = 0; i < opts.warmup; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < opts.samples; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}
