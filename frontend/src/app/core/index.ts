/**
 * Public API of `@wms/core` (docs/MICROFRONTEND.md §5).
 *
 * Shared as a Module Federation singleton, so the shell and every remote get the same
 * AuthSession, AppConfig and WarehouseContext instance. Import it only through
 * `@wms/core`: a deep import would bundle a second copy into the remote.
 */
export * from './models';
export * from './api/api-client';
export * from './api/api-error';
export * from './api/domain-apis';
export * from './auth/auth-session.service';
export * from './auth/guards';
export * from './config/app-config.service';
export * from './context/warehouse-context.service';
export * from './http/interceptors';
export * from './notify/toast.service';
export * from './state/list-controller';
export * from './util/ids';
