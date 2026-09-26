import { Injectable } from '@angular/core';
import { environment } from '@env/environment';

export interface AppConfig {
  environment: string;
  apiBaseUrl: string;
  /** Serve /api from the in-browser mock server (until the Spring Boot API exists). */
  useMockApi: boolean;
  mockLatencyMs: number;
}

/**
 * Runtime configuration, read from /assets/config/app-config.json before bootstrap
 * finishes, so one build can be promoted DEV → QA → UAT → PROD (ARCHITECTURE §12).
 */
@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private config: AppConfig = { ...environment.defaults };

  get value(): AppConfig {
    return this.config;
  }

  async load(): Promise<void> {
    try {
      // fetch, not HttpClient: interceptors depend on this config.
      const res = await fetch('assets/config/app-config.json', { cache: 'no-cache' });
      if (res.ok) this.config = { ...environment.defaults, ...((await res.json()) as Partial<AppConfig>) };
    } catch {
      console.warn('[config] app-config.json unavailable, using build defaults');
    }
  }
}
