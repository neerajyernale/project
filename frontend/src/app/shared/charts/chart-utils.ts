export interface ChartSeries {
  key: string;
  label: string;
  /** A token, e.g. `var(--wms-series-1)`. Series keep their slot whatever else is shown. */
  color: string;
}

/** Clean axis ticks from 0: 0 / 1,000 / 2,000 … with 3–5 steps. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export function formatTick(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}K`;
  return v.toLocaleString('en-US');
}

/** A bar/column path: square at the baseline, 4px rounded data-end (top). */
export function columnPath(x: number, y: number, w: number, h: number, radius = 4): string {
  if (h <= 0) return '';
  const r = Math.min(radius, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
