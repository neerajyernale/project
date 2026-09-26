/** Paged response envelope (ARCHITECTURE §6). */
export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export type SortDir = 'asc' | 'desc';

export interface ListQuery {
  page: number;
  size: number;
  sort?: string;
  q?: string;
  [filter: string]: string | number | undefined;
}

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

/** RFC 7807 problem detail, as returned by the API. */
export interface ProblemDetail {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  correlationId?: string;
  errors?: FieldError[];
}

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface Option<T = string> {
  value: T;
  label: string;
}
