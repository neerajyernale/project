export type UserStatus = 'ACTIVE' | 'INVITED' | 'DISABLED';

export interface User {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  /** Empty means the user may work in every warehouse. */
  warehouseIds: string[];
  status: UserStatus;
  lastLoginAt: string | null;
  version: number;
}

export interface SessionUser extends User {
  permissions: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  system: boolean;
  permissions: string[];
  userCount: number;
}

export interface UserUpsert {
  name: string;
  email: string;
  roleId: string;
  warehouseIds: string[];
}

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve'] as const;
export type PermissionAction = typeof PERMISSION_ACTIONS[number];

export interface PermissionModule {
  key: string;
  label: string;
  /** Actions that mean something for this module; others are not offered. */
  actions: PermissionAction[];
}

export const PERMISSION_MODULES: PermissionModule[] = [
  { key: 'dashboard', label: 'Dashboard', actions: ['view'] },
  { key: 'warehouses', label: 'Warehouses', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'inventory', label: 'Inventory', actions: ['view', 'edit', 'approve'] },
  { key: 'transfers', label: 'Stock Transfers', actions: ['view', 'create', 'approve'] },
  { key: 'catalog', label: 'Products, Suppliers & Customers', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'inbound', label: 'Inbound', actions: ['view', 'create', 'edit'] },
  { key: 'orders', label: 'Orders', actions: ['view', 'create', 'edit', 'approve'] },
  { key: 'picking', label: 'Picking', actions: ['view', 'edit'] },
  { key: 'packing', label: 'Packing', actions: ['view', 'edit'] },
  { key: 'shipping', label: 'Shipping', actions: ['view', 'edit'] },
  { key: 'reports', label: 'Reports', actions: ['view'] },
  { key: 'users', label: 'Users & Roles', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'settings', label: 'Settings', actions: ['view', 'edit'] },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_MODULES.flatMap((m) =>
  m.actions.map((a) => `${m.key}:${a}`),
);
