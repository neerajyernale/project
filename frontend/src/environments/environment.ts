export const environment = {
  production: false,
  /** Fallback when /assets/config/app-config.json cannot be loaded. */
  defaults: {
    environment: 'local',
    apiBaseUrl: '/api/v1',
    useMockApi: true,
    mockLatencyMs: 250,
  },
};
