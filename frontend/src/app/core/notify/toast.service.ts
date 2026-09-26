import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Tone } from '@core/models';

export interface Toast {
  id: number;
  tone: Tone;
  title: string;
  detail?: string;
  action?: { label: string; run: () => void };
}

/** Toasts rendered by the shell (docs/MICROFRONTEND.md §5: `NotificationService`). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  private readonly subject = new BehaviorSubject<Toast[]>([]);
  readonly toasts$ = this.subject.asObservable();

  show(tone: Tone, title: string, detail?: string, action?: Toast['action'], timeoutMs = 5000): void {
    const toast: Toast = { id: ++this.seq, tone, title, detail, action };
    this.subject.next([...this.subject.value.slice(-3), toast]);
    if (timeoutMs > 0) setTimeout(() => this.dismiss(toast.id), action ? timeoutMs * 2 : timeoutMs);
  }

  success(title: string, detail?: string): void {
    this.show('success', title, detail);
  }

  error(title: string, detail?: string, action?: Toast['action']): void {
    this.show('danger', title, detail, action, 8000);
  }

  dismiss(id: number): void {
    this.subject.next(this.subject.value.filter((t) => t.id !== id));
  }
}
