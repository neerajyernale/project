import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormGroup } from '@angular/forms';
import { FieldError, ProblemDetail } from '../models';

/** The one error type features see. Built from RFC 7807 problem details by the error interceptor. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail: string,
    readonly fieldErrors: FieldError[] = [],
    readonly correlationId: string | null = null,
  ) {
    super(detail || title);
  }

  get isOffline(): boolean {
    return this.status === 0;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isValidation(): boolean {
    return this.status === 422 || this.status === 400;
  }
}

export function toApiError(err: unknown, correlationId: string | null = null): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return new ApiError(0, 'You are offline', 'The server could not be reached. Check your connection and try again.', [], correlationId);
    }
    const p = (err.error ?? {}) as Partial<ProblemDetail>;
    const fallback = err.status >= 500 ? 'Something went wrong on our side. Try again in a moment.' : err.message;
    return new ApiError(err.status, p.title ?? err.statusText, p.detail ?? fallback, p.errors ?? [], p.correlationId ?? correlationId);
  }
  return new ApiError(-1, 'Unexpected error', err instanceof Error ? err.message : String(err));
}

/** Short user-facing message for toasts and inline banners. */
export function errorMessage(err: unknown): string {
  const e = toApiError(err);
  if (e.isValidation && e.fieldErrors.length) return e.fieldErrors.map((f) => f.message).join(' ');
  return e.detail || e.title;
}

/**
 * Maps server field errors (422) onto form controls, so the message shows under the field.
 * Returns errors that matched no control, for a banner.
 */
export function applyServerErrors(form: FormGroup, err: unknown): string[] {
  const e = toApiError(err);
  const unmatched: string[] = [];
  for (const fe of e.fieldErrors) {
    const control: AbstractControl | null = form.get(fe.field) ?? form.get(fe.field.split('.').pop() ?? '');
    if (control) {
      control.setErrors({ ...(control.errors ?? {}), server: fe.message });
      control.markAsTouched();
    } else {
      unmatched.push(fe.message);
    }
  }
  if (!e.fieldErrors.length) unmatched.push(e.detail || e.title);
  return unmatched;
}
