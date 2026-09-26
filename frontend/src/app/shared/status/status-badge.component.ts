import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Tone } from '@core/models';
import { humanize, toneOf } from './status-tones';

/** Status pill. Colour is never the only signal: the label is always shown. */
@Component({
  selector: 'wms-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [ngClass]="'badge-' + tone">{{ label }}</span>`,
})
export class StatusBadgeComponent {
  @Input() value: string | null | undefined;
  /** Force a tone, e.g. for derived flags like "Delayed". */
  @Input() toneOverride: Tone | null = null;

  get tone(): Tone {
    return this.toneOverride ?? toneOf(this.value);
  }

  get label(): string {
    return humanize(this.value);
  }
}
