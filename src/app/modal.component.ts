import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
})
export class Modal {
  @Input() open = false;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() variant: 'default' | 'confirm' = 'default';
  @Input() message = '';
  @Input() detailHtml = '';
  @Input() confirmTone: 'danger' | 'warning' | 'success' = 'danger';
  @Input() confirmLabel = 'Delete';
  @Input() cancelLabel = 'Cancel';
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  confirmIcon(): string {
    if (this.confirmTone === 'warning') return '!';
    if (this.confirmTone === 'success') return '✓';
    return '!';
  }

  confirmButtonClass(): string {
    if (this.confirmTone === 'danger') return 'button-danger';
    if (this.confirmTone === 'warning') return 'button-warning';
    return 'button-primary';
  }

  handleOverlay(event: Event): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }
}
