import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ICONS } from './icons';

/** Decorative by default (aria-hidden); pass `label` when the icon is the only content. */
@Component({
  selector: 'wms-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="stroke"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-hidden]="label ? null : 'true'"
      [attr.role]="label ? 'img' : null"
      [attr.aria-label]="label"
      focusable="false"
    >
      <path *ngFor="let d of paths" [attr.d]="d" />
    </svg>
  `,
  styles: [':host { display: inline-flex; flex: 0 0 auto; line-height: 0; }'],
})
export class IconComponent {
  paths: string[] = [];
  @Input() size = 16;
  @Input() stroke = 1.75;
  @Input() label: string | null = null;

  @Input() set name(value: string) {
    this.paths = ICONS[value] ?? ICONS['info'];
  }
}
