import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Directive,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
} from '@angular/core';
import { ChartSeries, columnPath, formatTick, niceTicks } from './chart-utils';

const CHART_STYLES = `
  :host { display: block; }
  .plot { position: relative; }
  .chart-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 11px; color: var(--wms-text-muted); list-style: none; margin: 0; padding: 0; }
  .legend li { display: inline-flex; align-items: center; gap: 6px; }
  .key { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .key.line { height: 2px; width: 14px; border-radius: 1px; }
  .view-toggle { border: 1px solid var(--wms-border-strong); background: var(--wms-surface); border-radius: var(--wms-radius); font-size: 11px; color: var(--wms-text-body); padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; }
  .view-toggle:hover { color: var(--wms-primary); border-color: var(--wms-primary); }
  svg { display: block; overflow: visible; }
  svg:focus-visible { outline: 2px solid var(--wms-primary); outline-offset: 4px; border-radius: 4px; }
  .tick { font-size: 10px; fill: var(--wms-text-subtle); font-variant-numeric: tabular-nums; }
  .grid { stroke: var(--wms-chart-grid); stroke-width: 1; }
  .baseline { stroke: var(--wms-chart-axis); stroke-width: 1; }
  .tooltip { position: absolute; pointer-events: none; background: var(--wms-surface); border: 1px solid var(--wms-border); box-shadow: var(--wms-shadow-pop); border-radius: 6px; padding: 8px 10px; font-size: 11px; color: var(--wms-text); min-width: 140px; z-index: 5; transform: translate(-50%, calc(-100% - 10px)); white-space: nowrap; }
  .tooltip strong { display: block; margin-bottom: 4px; font-size: 12px; }
  .tooltip .row { display: flex; align-items: center; gap: 6px; justify-content: space-between; }
  .tooltip .row span:first-child { display: inline-flex; align-items: center; gap: 6px; color: var(--wms-text-muted); }
  .tooltip .row b { font-variant-numeric: tabular-nums; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid var(--wms-divider); text-align: right; font-variant-numeric: tabular-nums; }
  th:first-child, td:first-child { text-align: left; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: var(--wms-text-subtle); font-weight: 700; }
`;

/** Tracks the host's width so charts draw at real pixel size (no stretched text). */
@Directive()
abstract class ResponsiveChart implements AfterViewInit, OnDestroy {
  width = 0;
  showTable = false;
  private observer?: ResizeObserver;

  constructor(protected readonly host: ElementRef<HTMLElement>, protected readonly cdr: ChangeDetectorRef, private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    this.width = this.host.nativeElement.clientWidth;
    this.cdr.detectChanges();
    if (typeof ResizeObserver === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      this.observer = new ResizeObserver((entries) => {
        const w = Math.floor(entries[0].contentRect.width);
        if (w !== this.width) this.zone.run(() => {
          this.width = w;
          this.cdr.markForCheck();
        });
      });
      this.observer.observe(this.host.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}

// ---------------------------------------------------------------------------------------------

/** Stacked columns: magnitude by category, split into parts (e.g. stock by warehouse). */
@Component({
  selector: 'wms-stacked-columns',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-top">
      <ul class="legend" aria-label="Legend">
        <li *ngFor="let s of series"><span class="key" [style.background]="s.color"></span>{{ s.label }}</li>
      </ul>
      <button type="button" class="view-toggle" (click)="showTable = !showTable" [attr.aria-pressed]="showTable">{{ showTable ? 'Chart' : 'Table' }}</button>
    </div>

    <table *ngIf="showTable; else chart">
      <caption class="sr-only">{{ ariaLabel }}</caption>
      <thead><tr><th scope="col">{{ categoryLabel }}</th><th scope="col" *ngFor="let s of series">{{ s.label }}</th><th scope="col">Total</th></tr></thead>
      <tbody>
        <tr *ngFor="let c of categories; let i = index">
          <td>{{ c }}</td>
          <td *ngFor="let s of series; let j = index">{{ data[i][j] | number }}</td>
          <td>{{ total(i) | number }}</td>
        </tr>
      </tbody>
    </table>

    <ng-template #chart>
      <div class="plot">
      <svg *ngIf="width > 0" [attr.width]="width" [attr.height]="height" role="img" [attr.aria-label]="ariaLabel" (mouseleave)="hover = -1">
        <g *ngFor="let t of ticks">
          <line [class.grid]="t !== 0" [class.baseline]="t === 0" [attr.x1]="ml" [attr.x2]="width - mr" [attr.y1]="y(t)" [attr.y2]="y(t)" />
          <text class="tick" [attr.x]="ml - 8" [attr.y]="y(t) + 3" text-anchor="end">{{ fmt(t) }}</text>
        </g>
        <g *ngFor="let c of categories; let i = index">
          <path *ngFor="let seg of segments(i)" [attr.d]="seg.d" [attr.fill]="seg.color" />
          <text class="tick" [attr.x]="cx(i)" [attr.y]="height - 8" text-anchor="middle">{{ short(c) }}</text>
          <rect [attr.x]="cx(i) - band / 2" [attr.y]="mt" [attr.width]="band" [attr.height]="plotH" fill="transparent" (mouseenter)="hover = i" />
        </g>
      </svg>
      <div class="tooltip" *ngIf="hover >= 0" [style.left.px]="cx(hover)" [style.top.px]="y(total(hover))">
        <strong>{{ categories[hover] }}</strong>
        <div class="row" *ngFor="let s of series; let j = index"><span><i class="key" [style.background]="s.color"></i>{{ s.label }}</span><b>{{ data[hover][j] | number }}</b></div>
        <div class="row"><span>Total</span><b>{{ total(hover) | number }}</b></div>
      </div>
      </div>
    </ng-template>
  `,
  styles: [CHART_STYLES],
})
export class StackedColumnsComponent extends ResponsiveChart {
  @Input() categories: string[] = [];
  @Input() series: ChartSeries[] = [];
  /** data[category][series] */
  @Input() data: number[][] = [];
  @Input() height = 230;
  @Input() ariaLabel = 'Chart';
  @Input() categoryLabel = 'Category';

  readonly ml = 48;
  readonly mr = 8;
  readonly mt = 10;
  readonly mb = 28;
  hover = -1;
  fmt = formatTick;

  constructor(host: ElementRef<HTMLElement>, cdr: ChangeDetectorRef, zone: NgZone) {
    super(host, cdr, zone);
  }

  get plotH(): number {
    return this.height - this.mt - this.mb;
  }

  get band(): number {
    return (this.width - this.ml - this.mr) / Math.max(1, this.categories.length);
  }

  get ticks(): number[] {
    return niceTicks(Math.max(0, ...this.categories.map((_, i) => this.total(i))));
  }

  total(i: number): number {
    return (this.data[i] ?? []).reduce((a, b) => a + b, 0);
  }

  cx(i: number): number {
    return this.ml + this.band * (i + 0.5);
  }

  y(v: number): number {
    const top = this.ticks[this.ticks.length - 1] || 1;
    return this.mt + this.plotH - (v / top) * this.plotH;
  }

  short(label: string): string {
    const perChar = 6.2;
    const max = Math.max(4, Math.floor(this.band / perChar));
    const first = label.split(' ')[0];
    // Consistent short labels: the first word (e.g. the city); full name is in the tooltip and table.
    return first.length <= max ? first : first.slice(0, max - 1) + '…';
  }

  /** Bottom-up segments with a 2px surface gap between them; only the top one is rounded. */
  segments(i: number): { d: string; color: string }[] {
    const w = Math.min(24, this.band * 0.5);
    const x = this.cx(i) - w / 2;
    const values = this.data[i] ?? [];
    const lastNonZero = values.reduce((acc, v, j) => (v > 0 ? j : acc), -1);
    const out: { d: string; color: string }[] = [];
    let acc = 0;
    values.forEach((v, j) => {
      if (v <= 0) return;
      const y0 = this.y(acc);
      const y1 = this.y(acc + v);
      acc += v;
      const gap = out.length ? 2 : 0;
      const h = Math.max(0, y0 - y1 - gap);
      if (h <= 0) return;
      const d = j === lastNonZero ? columnPath(x, y1, w, h) : `M${x},${y1}h${w}v${h}h${-w}Z`;
      out.push({ d, color: this.series[j]?.color ?? 'var(--wms-series-1)' });
    });
    return out;
  }
}

// ---------------------------------------------------------------------------------------------

/** Lines over time with a crosshair tooltip (mouse and ←/→ keys). */
@Component({
  selector: 'wms-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-top">
      <ul class="legend" aria-label="Legend" *ngIf="series.length > 1">
        <li *ngFor="let s of series"><span class="key line" [style.background]="s.color"></span>{{ s.label }}</li>
      </ul>
      <span *ngIf="series.length <= 1"></span>
      <button type="button" class="view-toggle" (click)="showTable = !showTable" [attr.aria-pressed]="showTable">{{ showTable ? 'Chart' : 'Table' }}</button>
    </div>

    <table *ngIf="showTable; else chart">
      <caption class="sr-only">{{ ariaLabel }}</caption>
      <thead><tr><th scope="col">{{ xLabel }}</th><th scope="col" *ngFor="let s of series">{{ s.label }}</th></tr></thead>
      <tbody>
        <tr *ngFor="let l of labels; let i = index"><td>{{ l }}</td><td *ngFor="let s of series; let j = index">{{ data[j][i] | number }}</td></tr>
      </tbody>
    </table>

    <ng-template #chart>
      <div class="plot">
      <svg
        *ngIf="width > 0"
        [attr.width]="width"
        [attr.height]="height"
        role="img"
        tabindex="0"
        [attr.aria-label]="ariaLabel + '. Use left and right arrow keys to read values.'"
        (mousemove)="onMove($event)"
        (mouseleave)="hover = -1"
        (keydown)="onKey($event)"
        (blur)="hover = -1"
      >
        <g *ngFor="let t of ticks">
          <line [class.grid]="t !== 0" [class.baseline]="t === 0" [attr.x1]="ml" [attr.x2]="width - mr" [attr.y1]="y(t)" [attr.y2]="y(t)" />
          <text class="tick" [attr.x]="ml - 8" [attr.y]="y(t) + 3" text-anchor="end">{{ fmt(t) }}</text>
        </g>
        <text *ngFor="let l of labels; let i = index" class="tick" [attr.x]="x(i)" [attr.y]="height - 8" text-anchor="middle">{{ l }}</text>
        <path *ngIf="series.length === 1" [attr.d]="area(0)" [attr.fill]="series[0].color" fill-opacity="0.1" />
        <path *ngFor="let s of series; let j = index" [attr.d]="line(j)" fill="none" [attr.stroke]="s.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <line *ngIf="hover >= 0" class="baseline" [attr.x1]="x(hover)" [attr.x2]="x(hover)" [attr.y1]="mt" [attr.y2]="height - mb" />
        <ng-container *ngFor="let s of series; let j = index">
          <circle *ngIf="hover >= 0" [attr.cx]="x(hover)" [attr.cy]="y(data[j][hover])" r="4" [attr.fill]="s.color" stroke="var(--wms-surface)" stroke-width="2" />
          <circle *ngIf="hover < 0 && labels.length" [attr.cx]="x(labels.length - 1)" [attr.cy]="y(data[j][labels.length - 1])" r="4" [attr.fill]="s.color" stroke="var(--wms-surface)" stroke-width="2" />
        </ng-container>
      </svg>
      <div class="tooltip" *ngIf="hover >= 0" [style.left.px]="x(hover)" [style.top.px]="y(maxAt(hover))">
        <strong>{{ labels[hover] }}</strong>
        <div class="row" *ngFor="let s of series; let j = index"><span><i class="key line" [style.background]="s.color"></i>{{ s.label }}</span><b>{{ data[j][hover] | number }}</b></div>
      </div>
      </div>
    </ng-template>
  `,
  styles: [CHART_STYLES],
})
export class LineChartComponent extends ResponsiveChart {
  @Input() labels: string[] = [];
  @Input() series: ChartSeries[] = [];
  /** data[series][point] */
  @Input() data: number[][] = [];
  @Input() height = 200;
  @Input() ariaLabel = 'Chart';
  @Input() xLabel = 'Date';

  readonly ml = 40;
  readonly mr = 12;
  readonly mt = 10;
  readonly mb = 28;
  hover = -1;
  fmt = formatTick;

  constructor(host: ElementRef<HTMLElement>, cdr: ChangeDetectorRef, zone: NgZone) {
    super(host, cdr, zone);
  }

  get ticks(): number[] {
    return niceTicks(Math.max(0, ...this.data.flat()));
  }

  x(i: number): number {
    const n = Math.max(1, this.labels.length - 1);
    return this.ml + ((this.width - this.ml - this.mr) * i) / n;
  }

  y(v: number): number {
    const top = this.ticks[this.ticks.length - 1] || 1;
    const h = this.height - this.mt - this.mb;
    return this.mt + h - (v / top) * h;
  }

  maxAt(i: number): number {
    return Math.max(...this.data.map((d) => d[i] ?? 0));
  }

  line(j: number): string {
    return (this.data[j] ?? []).map((v, i) => `${i ? 'L' : 'M'}${this.x(i)},${this.y(v)}`).join('');
  }

  area(j: number): string {
    const pts = this.data[j] ?? [];
    if (!pts.length) return '';
    return `${this.line(j)}L${this.x(pts.length - 1)},${this.y(0)}L${this.x(0)},${this.y(0)}Z`;
  }

  onMove(e: MouseEvent): void {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const n = Math.max(1, this.labels.length - 1);
    const step = (this.width - this.ml - this.mr) / n;
    this.hover = Math.max(0, Math.min(this.labels.length - 1, Math.round((e.clientX - rect.left - this.ml) / step)));
  }

  onKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const last = this.labels.length - 1;
    if (this.hover < 0) this.hover = e.key === 'ArrowLeft' ? last : 0;
    else this.hover = Math.max(0, Math.min(last, this.hover + (e.key === 'ArrowLeft' ? -1 : 1)));
  }
}

// ---------------------------------------------------------------------------------------------

export interface BarListRow {
  label: string;
  value: number;
}

/** Horizontal single-hue bars with the value at the tip: counts by stage, ranking. */
@Component({
  selector: 'wms-bar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="bar-list" [attr.aria-label]="ariaLabel">
      <li *ngFor="let r of rows">
        <span class="bl-label">{{ r.label }}</span>
        <span class="bl-track"><span class="bl-fill" [style.width.%]="pct(r.value)"></span></span>
        <span class="bl-value">{{ r.value | number }}</span>
      </li>
    </ul>
  `,
  styles: [
    `
      .bar-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
      li { display: grid; grid-template-columns: 88px 1fr 44px; align-items: center; gap: 10px; font-size: 12px; }
      .bl-label { color: var(--wms-text-muted); }
      .bl-track { height: 10px; background: transparent; border-radius: 0 4px 4px 0; }
      .bl-fill { display: block; height: 100%; min-width: 2px; background: var(--wms-series-1); border-radius: 0 4px 4px 0; }
      .bl-value { text-align: right; font-weight: 600; color: var(--wms-text); font-variant-numeric: tabular-nums; }
    `,
  ],
})
export class BarListComponent {
  @Input() rows: BarListRow[] = [];
  @Input() ariaLabel = 'Values';

  pct(v: number): number {
    const max = Math.max(1, ...this.rows.map((r) => r.value));
    return (v / max) * 100;
  }
}
