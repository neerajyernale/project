/** Navigation taxonomy kept from the prototype (PROTOTYPE_AUDIT §12: KEEP). */
export interface NavItem {
  label: string;
  icon: string;
  link: string;
  permission: string;
  badgeKey?: 'openOrders';
}

export const WORKSPACE_NAV: NavItem[] = [
  { label: 'Dashboard', icon: 'dashboard', link: '/dashboard', permission: 'dashboard:view' },
  { label: 'Warehouses', icon: 'warehouse', link: '/warehouses', permission: 'warehouses:view' },
  { label: 'Inventory', icon: 'inventory', link: '/inventory', permission: 'inventory:view' },
  { label: 'Products', icon: 'product', link: '/products', permission: 'catalog:view' },
  { label: 'Inbound', icon: 'inbound', link: '/inbound', permission: 'inbound:view' },
  { label: 'Outbound', icon: 'outbound', link: '/outbound', permission: 'orders:view' },
  { label: 'Orders', icon: 'orders', link: '/orders', permission: 'orders:view', badgeKey: 'openOrders' },
  { label: 'Picking', icon: 'picking', link: '/picking', permission: 'picking:view' },
  { label: 'Packing', icon: 'packing', link: '/packing', permission: 'packing:view' },
  { label: 'Shipping', icon: 'shipping', link: '/shipping', permission: 'shipping:view' },
  { label: 'Stock Transfers', icon: 'transfer', link: '/transfers', permission: 'transfers:view' },
];

export const MANAGE_NAV: NavItem[] = [
  { label: 'Suppliers', icon: 'supplier', link: '/suppliers', permission: 'catalog:view' },
  { label: 'Customers', icon: 'customer', link: '/customers', permission: 'catalog:view' },
  { label: 'Reports', icon: 'reports', link: '/reports', permission: 'reports:view' },
  { label: 'Users & Roles', icon: 'users', link: '/admin/users', permission: 'users:view' },
  { label: 'Settings', icon: 'settings', link: '/settings', permission: 'settings:view' },
];
