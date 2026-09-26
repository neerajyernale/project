import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** Utilisation bar. Fill carries severity (accent → warning → danger); the % label is always shown. */
@Component({
  selector: 'wms-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="meter" role="meter" [attr.aria-valuenow]="value" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="label">
      <div class="meter-track" [class.wide]="wide">
        <div class="meter-fill" [class.warning]="severity === 'warning'" [class.danger]="severity === 'danger'" [style.width.%]="clamped"></div>
      </div>
      <span>{{ value }}%</span>
    </div>
  `,
})
export class MeterComponent {
  @Input() value = 0;
  @Input() warnAt = 75;
  @Input() dangerAt = 90;
  @Input() wide = false;
  @Input() label = 'Utilization';

  get clamped(): number {
    return Math.max(0, Math.min(100, this.value));
  }

  get severity(): 'ok' | 'warning' | 'danger' {
    if (this.value >= this.dangerAt) return 'danger';
    if (this.value >= this.warnAt) return 'warning';
    return 'ok';
  }
}
