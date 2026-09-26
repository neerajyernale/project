import { Pipe, PipeTransform } from '@angular/core';
import { humanize } from './status/status-tones';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-09-26T09:42:00Z` → `26 Sep 2026` or with `time`: `26 Sep 2026 · 15:12`. */
@Pipe({ name: 'wmsDate' })
export class WmsDatePipe implements PipeTransform {
  transform(value: string | null | undefined, mode: 'date' | 'datetime' | 'time' = 'date'): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const date = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (mode === 'time') return time;
    return mode === 'datetime' ? `${date} · ${time}` : date;
  }
}

/** Relative time for feeds: "just now", "12 min ago", "3 hrs ago", "Yesterday", then a date. */
@Pipe({ name: 'relTime' })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '—';
    const diff = Date.now() - new Date(value).getTime();
    const min = Math.round(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const hrs = Math.round(min / 60);
    if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
    const days = Math.round(hrs / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new WmsDatePipe().transform(value);
  }
}

@Pipe({ name: 'humanize' })
export class HumanizePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return humanize(value);
  }
}

/** Initials for avatars: "Rajesh Kumar" → "RK". */
@Pipe({ name: 'initials' })
export class InitialsPipe implements PipeTransform {
  transform(name: string | null | undefined): string {
    return (name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }
}

/** Compact large numbers for tiles: 125480 → "125.5K". */
@Pipe({ name: 'compact' })
export class CompactNumberPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    const abs = Math.abs(value);
    if (abs >= 1e7) return `${(value / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (abs >= 1e5) return `${(value / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return value.toLocaleString('en-US');
  }
}

/** `rows | pluck: 'received'` → number[] (feeding chart series from row objects). */
@Pipe({ name: 'pluck' })
export class PluckPipe implements PipeTransform {
  transform<T, K extends keyof T>(rows: T[] | null | undefined, key: K): T[K][] {
    return (rows ?? []).map((r) => r[key]);
  }
}