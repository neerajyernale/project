export type PageKey =
  | 'Dashboard' | 'Warehouses' | 'Inventory' | 'Products'
  | 'Inbound' | 'Outbound' | 'Orders' | 'Picking' | 'Packing'
  | 'Shipping' | 'Stock Transfers' | 'Suppliers' | 'Customers'
  | 'Reports' | 'Users & Roles' | 'Settings';

export type NavItem = { label: PageKey; icon: string; badge?: string };

export type RecordRow = { [key: string]: string };

export type Kpi = {
  label: string;
  value: string;
  trend: string;
  trendUp: boolean;
  icon: string;
  tone: string;
  sparkline: number[];
};

export type Activity = {
  title: string;
  detail: string;
  time: string;
  icon: string;
  tone: string;
};

export type ProductRow = {
  name: string;
  category: string;
  sku: string;
  orders: string;
  stock: string;
  status: string;
  statusTone: string;
  short: string;
  tone: string;
};

export type Warehouse = {
  code: string;
  name: string;
  city: string;
  manager: string;
  capacity: string;
  utilization: number;
  status: string;
  zones: WarehouseZone[];
};

export type WarehouseZone = {
  name: string;
  code: string;
  area: string;
  utilization: number;
  bins: number;
  status: string;
};

export type ReportCategory = {
  title: string;
  icon: string;
  reports: ReportItem[];
};

export type ReportItem = {
  name: string;
  description: string;
  lastRun: string;
  icon: string;
};

export type UserRow = {
  name: string;
  email: string;
  role: string;
  warehouse: string;
  lastLogin: string;
  status: string;
  avatar: string;
};

export type RolePermission = {
  module: string;
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
};

export type SettingsSection = {
  key: string;
  label: string;
  icon: string;
  fields: SettingsField[];
};

export type SettingsField = {
  label: string;
  type: 'text' | 'toggle' | 'select' | 'textarea' | 'password';
  value: string | boolean;
  options?: string[];
  hint?: string;
};

export const PRIMARY_NAV: NavItem[] = [
  { label: 'Dashboard', icon: '⌂' },
  { label: 'Warehouses', icon: '▦' },
  { label: 'Inventory', icon: '◫' },
  { label: 'Products', icon: '◇' },
  { label: 'Inbound', icon: '⇥' },
  { label: 'Outbound', icon: '⇤' },
  { label: 'Orders', icon: '≡', badge: '12' },
  { label: 'Picking', icon: '⌖' },
  { label: 'Packing', icon: '▣' },
  { label: 'Shipping', icon: '➤' },
  { label: 'Stock Transfers', icon: '⇄' },
];

export const MANAGE_NAV: NavItem[] = [
  { label: 'Suppliers', icon: '♧' },
  { label: 'Customers', icon: '♙' },
  { label: 'Reports', icon: '▥' },
  { label: 'Users & Roles', icon: '♟' },
  { label: 'Settings', icon: '⚙' },
];

export const PAGE_DESCRIPTIONS: Record<PageKey, string> = {
  Dashboard: '',
  Warehouses: 'Manage facilities, capacity, zones and warehouse teams.',
  Inventory: 'Track stock levels, locations and inventory health across all warehouses.',
  Products: 'Maintain your product catalog, SKUs and reorder rules.',
  Inbound: 'Coordinate expected deliveries and receiving progress.',
  Outbound: 'Manage outbound shipments from pick to dispatch.',
  Orders: 'Track customer orders through every fulfillment stage.',
  Picking: 'Monitor pick queues, performance and exceptions.',
  Packing: 'Coordinate packing stations and completed packages.',
  Shipping: 'Track carriers, dispatches and delivery progress.',
  'Stock Transfers': 'Move inventory safely between warehouses and locations.',
  Suppliers: 'Manage supplier relationships and inbound partners.',
  Customers: 'View customer accounts and fulfillment history.',
  Reports: 'Turn warehouse activity into actionable operational insight.',
  'Users & Roles': 'Manage access, responsibilities and warehouse assignments.',
  Settings: 'Configure workspace preferences, alerts and security.',
};

export const KPIS: Kpi[] = [
  { label: 'Total Inventory', value: '125,480', trend: '+12.4%', trendUp: true, icon: '◫', tone: 'blue', sparkline: [42, 57, 48, 70, 64, 82, 76, 92] },
  { label: "Today's Orders", value: '2,846', trend: '+8.6%', trendUp: true, icon: '≡', tone: 'sky', sparkline: [30, 45, 52, 48, 65, 70, 85, 88] },
  { label: 'Pending Picking', value: '426', trend: '-3.2%', trendUp: false, icon: '⌖', tone: 'orange', sparkline: [80, 72, 68, 75, 60, 55, 58, 52] },
  { label: 'Pending Shipping', value: '184', trend: '+2.1%', trendUp: true, icon: '➤', tone: 'green', sparkline: [40, 38, 45, 50, 48, 55, 60, 58] },
  { label: 'Low Stock Items', value: '73', trend: '+5.8%', trendUp: false, icon: '△', tone: 'red', sparkline: [20, 25, 30, 35, 42, 48, 55, 62] },
  { label: 'Warehouse Capacity', value: '78%', trend: '+4.2%', trendUp: false, icon: '⌗', tone: 'navy', sparkline: [60, 64, 68, 70, 72, 74, 76, 78] },
];

export const ACTIVITIES: Activity[] = [
  { title: 'Order ORD-10482 picked successfully', detail: 'Picking zone B-12 · By Amit Sharma', time: '2 min ago', icon: '✓', tone: 'green' },
  { title: 'Shipment SHP-2048 dispatched', detail: 'BlueDart Express · Mumbai to Bengaluru', time: '18 min ago', icon: '➤', tone: 'blue' },
  { title: 'Product inventory updated', detail: 'SKU-10045 · Wireless Barcode Scanner', time: '34 min ago', icon: '↗', tone: 'sky' },
  { title: 'Warehouse reached 78% capacity', detail: 'Mumbai Central Warehouse · Zone C', time: '1 hr ago', icon: '⌗', tone: 'orange' },
  { title: 'Low stock alert generated', detail: 'SKU-10078 · Thermal Label Roll', time: '2 hrs ago', icon: '!', tone: 'red' },
  { title: 'Stock transfer TRF-3048 approved', detail: 'Mumbai Central → Pune Distribution', time: '3 hrs ago', icon: '⇄', tone: 'blue' },
];

export const TOP_PRODUCTS: ProductRow[] = [
  { name: 'Wireless Barcode Scanner', category: 'Scanning Equipment', sku: 'SKU-10045', orders: '1,284', stock: '2,450', status: 'In Stock', statusTone: 'success', short: 'WS', tone: 'purple-free-blue' },
  { name: 'Thermal Label Roll 4×6', category: 'Packaging Supplies', sku: 'SKU-10078', orders: '986', stock: '184', status: 'Low Stock', statusTone: 'warning', short: 'TL', tone: 'purple-free-orange' },
  { name: 'Heavy Duty Storage Bin', category: 'Storage & Handling', sku: 'SKU-10112', orders: '748', stock: '1,820', status: 'In Stock', statusTone: 'success', short: 'SB', tone: 'purple-free-green' },
  { name: 'Handheld RFID Reader', category: 'Scanning Equipment', sku: 'SKU-10092', orders: '621', stock: '96', status: 'Low Stock', statusTone: 'warning', short: 'RF', tone: 'purple-free-slate' },
  { name: 'Pallet Wrap Film 500mm', category: 'Packaging Supplies', sku: 'SKU-10056', orders: '512', stock: '3,200', status: 'In Stock', statusTone: 'success', short: 'PW', tone: 'purple-free-blue' },
];

export const WAREHOUSES: Warehouse[] = [
  {
    code: 'WH-MUM-001', name: 'Mumbai Central Warehouse', city: 'Mumbai', manager: 'Rajesh Kumar', capacity: '50,000 m²', utilization: 78, status: 'ACTIVE',
    zones: [
      { name: 'Receiving', code: 'RCV-A', area: '4,200 m²', utilization: 65, bins: 120, status: 'Active' },
      { name: 'Storage', code: 'STR-B', area: '18,000 m²', utilization: 82, bins: 480, status: 'Active' },
      { name: 'Picking', code: 'PCK-C', area: '6,500 m²', utilization: 74, bins: 340, status: 'Active' },
      { name: 'Packing', code: 'PKG-D', area: '3,800 m²', utilization: 58, bins: 90, status: 'Active' },
      { name: 'Dispatch', code: 'DPT-E', area: '4,500 m²', utilization: 71, bins: 60, status: 'Active' },
      { name: 'Returns', code: 'RET-F', area: '1,800 m²', utilization: 32, bins: 45, status: 'Active' },
    ],
  },
  {
    code: 'WH-PUN-001', name: 'Pune Distribution Center', city: 'Pune', manager: 'Amit Sharma', capacity: '35,000 m²', utilization: 64, status: 'ACTIVE',
    zones: [
      { name: 'Receiving', code: 'RCV-A', area: '2,800 m²', utilization: 48, bins: 80, status: 'Active' },
      { name: 'Storage', code: 'STR-B', area: '12,000 m²', utilization: 68, bins: 320, status: 'Active' },
      { name: 'Picking', code: 'PCK-C', area: '4,500 m²', utilization: 55, bins: 220, status: 'Active' },
      { name: 'Packing', code: 'PKG-D', area: '2,600 m²', utilization: 42, bins: 60, status: 'Active' },
      { name: 'Dispatch', code: 'DPT-E', area: '3,100 m²', utilization: 60, bins: 40, status: 'Active' },
      { name: 'Returns', code: 'RET-F', area: '1,200 m²', utilization: 22, bins: 28, status: 'Active' },
    ],
  },
  {
    code: 'WH-HYD-001', name: 'Hyderabad Warehouse', city: 'Hyderabad', manager: 'Suresh Rao', capacity: '40,000 m²', utilization: 82, status: 'AT CAPACITY',
    zones: [
      { name: 'Receiving', code: 'RCV-A', area: '3,200 m²', utilization: 72, bins: 95, status: 'Active' },
      { name: 'Storage', code: 'STR-B', area: '14,000 m²', utilization: 88, bins: 380, status: 'Near Capacity' },
      { name: 'Picking', code: 'PCK-C', area: '5,200 m²', utilization: 80, bins: 280, status: 'Active' },
      { name: 'Packing', code: 'PKG-D', area: '3,000 m²', utilization: 65, bins: 70, status: 'Active' },
      { name: 'Dispatch', code: 'DPT-E', area: '3,600 m²', utilization: 78, bins: 50, status: 'Active' },
      { name: 'Returns', code: 'RET-F', area: '1,500 m²', utilization: 40, bins: 35, status: 'Active' },
    ],
  },
  {
    code: 'WH-DEL-001', name: 'Delhi North Hub', city: 'New Delhi', manager: 'Anil Gupta', capacity: '45,000 m²', utilization: 45, status: 'ACTIVE',
    zones: [
      { name: 'Receiving', code: 'RCV-A', area: '3,500 m²', utilization: 30, bins: 100, status: 'Active' },
      { name: 'Storage', code: 'STR-B', area: '16,000 m²', utilization: 48, bins: 400, status: 'Active' },
      { name: 'Picking', code: 'PCK-C', area: '5,800 m²', utilization: 42, bins: 300, status: 'Active' },
      { name: 'Packing', code: 'PKG-D', area: '3,200 m²', utilization: 35, bins: 75, status: 'Active' },
      { name: 'Dispatch', code: 'DPT-E', area: '4,000 m²', utilization: 40, bins: 55, status: 'Active' },
      { name: 'Returns', code: 'RET-F', area: '1,600 m²', utilization: 18, bins: 38, status: 'Active' },
    ],
  },
  {
    code: 'WH-BLR-001', name: 'Bengaluru South Depot', city: 'Bengaluru', manager: 'Deepak Reddy', capacity: '28,000 m²', utilization: 91, status: 'AT CAPACITY',
    zones: [
      { name: 'Receiving', code: 'RCV-A', area: '2,200 m²', utilization: 78, bins: 65, status: 'Active' },
      { name: 'Storage', code: 'STR-B', area: '10,000 m²', utilization: 94, bins: 280, status: 'Near Capacity' },
      { name: 'Picking', code: 'PCK-C', area: '3,800 m²', utilization: 88, bins: 190, status: 'Active' },
      { name: 'Packing', code: 'PKG-D', area: '2,200 m²', utilization: 72, bins: 50, status: 'Active' },
      { name: 'Dispatch', code: 'DPT-E', area: '2,600 m²', utilization: 85, bins: 35, status: 'Active' },
      { name: 'Returns', code: 'RET-F', area: '1,000 m²', utilization: 35, bins: 22, status: 'Active' },
    ],
  },
];

export const ORDER_STATUS_DATA = [
  { label: 'Pending', value: 18, color: '#a9b8c7' },
  { label: 'Processing', value: 22, color: '#75b8ee' },
  { label: 'Picked', value: 15, color: '#e8a453' },
  { label: 'Packed', value: 12, color: '#287bd4' },
  { label: 'Shipped', value: 28, color: '#16855c' },
  { label: 'Cancelled', value: 5, color: '#c53b46' },
];

export const PAGE_DATA: Record<string, { headings: string[]; rows: RecordRow[] }> = {
  Inventory: {
    headings: ['SKU', 'PRODUCT', 'WAREHOUSE', 'AVAILABLE', 'RESERVED', 'DAMAGED', 'REORDER LEVEL', 'STATUS'],
    rows: [
      { SKU: 'SKU-10001', PRODUCT: 'Wireless Keyboard', WAREHOUSE: 'Mumbai Central', AVAILABLE: '2,450', RESERVED: '320', DAMAGED: '12', 'REORDER LEVEL': '500', STATUS: 'IN STOCK' },
      { SKU: 'SKU-10045', PRODUCT: 'Wireless Barcode Scanner', WAREHOUSE: 'Mumbai Central', AVAILABLE: '2,450', RESERVED: '180', DAMAGED: '5', 'REORDER LEVEL': '500', STATUS: 'IN STOCK' },
      { SKU: 'SKU-10078', PRODUCT: 'Thermal Label Roll 4×6', WAREHOUSE: 'Mumbai Central', AVAILABLE: '184', RESERVED: '74', DAMAGED: '4', 'REORDER LEVEL': '300', STATUS: 'LOW STOCK' },
      { SKU: 'SKU-10092', PRODUCT: 'Handheld RFID Reader', WAREHOUSE: 'Pune Distribution', AVAILABLE: '96', RESERVED: '24', DAMAGED: '2', 'REORDER LEVEL': '150', STATUS: 'LOW STOCK' },
      { SKU: 'SKU-10112', PRODUCT: 'Heavy Duty Storage Bin', WAREHOUSE: 'Mumbai Central', AVAILABLE: '1,820', RESERVED: '120', DAMAGED: '8', 'REORDER LEVEL': '400', STATUS: 'IN STOCK' },
      { SKU: 'SKU-10134', PRODUCT: 'USB-C Docking Station', WAREHOUSE: 'Pune Distribution', AVAILABLE: '0', RESERVED: '0', DAMAGED: '0', 'REORDER LEVEL': '120', STATUS: 'OUT OF STOCK' },
      { SKU: 'SKU-10056', PRODUCT: 'Pallet Wrap Film 500mm', WAREHOUSE: 'Mumbai Central', AVAILABLE: '3,200', RESERVED: '450', DAMAGED: '15', 'REORDER LEVEL': '800', STATUS: 'IN STOCK' },
      { SKU: 'SKU-10067', PRODUCT: 'Forklift Battery 24V', WAREHOUSE: 'Hyderabad Warehouse', AVAILABLE: '8,420', RESERVED: '0', DAMAGED: '0', 'REORDER LEVEL': '50', STATUS: 'OVERSTOCK' },
    ],
  },
  Products: {
    headings: ['SKU', 'PRODUCT NAME', 'CATEGORY', 'BRAND', 'UNIT', 'STOCK', 'REORDER LEVEL', 'STATUS'],
    rows: [
      { SKU: 'SKU-10045', 'PRODUCT NAME': 'Wireless Barcode Scanner', CATEGORY: 'Scanning', BRAND: 'Zebra', UNIT: 'Each', STOCK: '2,450', 'REORDER LEVEL': '500', STATUS: 'ACTIVE' },
      { SKU: 'SKU-10078', 'PRODUCT NAME': 'Thermal Label Roll 4×6', CATEGORY: 'Packaging', BRAND: 'Avery', UNIT: 'Roll', STOCK: '184', 'REORDER LEVEL': '300', STATUS: 'LOW STOCK' },
      { SKU: 'SKU-10112', 'PRODUCT NAME': 'Heavy Duty Storage Bin', CATEGORY: 'Storage', BRAND: 'Nilkamal', UNIT: 'Each', STOCK: '1,820', 'REORDER LEVEL': '400', STATUS: 'ACTIVE' },
      { SKU: 'SKU-10092', 'PRODUCT NAME': 'Handheld RFID Reader', CATEGORY: 'Scanning', BRAND: 'Honeywell', UNIT: 'Each', STOCK: '96', 'REORDER LEVEL': '150', STATUS: 'LOW STOCK' },
      { SKU: 'SKU-10001', 'PRODUCT NAME': 'Wireless Keyboard', CATEGORY: 'Electronics', BRAND: 'Logitech', UNIT: 'Each', STOCK: '2,450', 'REORDER LEVEL': '500', STATUS: 'ACTIVE' },
      { SKU: 'SKU-10134', 'PRODUCT NAME': 'USB-C Docking Station', CATEGORY: 'Electronics', BRAND: 'Anker', UNIT: 'Each', STOCK: '0', 'REORDER LEVEL': '120', STATUS: 'OUT OF STOCK' },
      { SKU: 'SKU-10056', 'PRODUCT NAME': 'Pallet Wrap Film 500mm', CATEGORY: 'Packaging', BRAND: 'Rajapack', UNIT: 'Roll', STOCK: '3,200', 'REORDER LEVEL': '800', STATUS: 'ACTIVE' },
      { SKU: 'SKU-10067', 'PRODUCT NAME': 'Forklift Battery 24V', CATEGORY: 'Equipment', BRAND: 'Exide', UNIT: 'Each', STOCK: '8,420', 'REORDER LEVEL': '50', STATUS: 'ACTIVE' },
    ],
  },
  Inbound: {
    headings: ['SHIPMENT ID', 'SUPPLIER', 'WAREHOUSE', 'EXPECTED DATE', 'ITEMS', 'QUANTITY', 'STATUS'],
    rows: [
      { 'SHIPMENT ID': 'SHP-2051', SUPPLIER: 'TechSource India Pvt Ltd', WAREHOUSE: 'Mumbai Central', 'EXPECTED DATE': '24 Jun 2024 · 14:30', ITEMS: '18', QUANTITY: '4,280', STATUS: 'EXPECTED' },
      { 'SHIPMENT ID': 'SHP-2049', SUPPLIER: 'PackRight Supplies', WAREHOUSE: 'Pune Distribution', 'EXPECTED DATE': '24 Jun 2024 · 11:00', ITEMS: '9', QUANTITY: '1,840', STATUS: 'RECEIVING' },
      { 'SHIPMENT ID': 'SHP-2043', SUPPLIER: 'Global Electronics', WAREHOUSE: 'Mumbai Central', 'EXPECTED DATE': '23 Jun 2024', ITEMS: '24', QUANTITY: '6,120', STATUS: 'RECEIVED' },
      { 'SHIPMENT ID': 'SHP-2038', SUPPLIER: 'TechSource India Pvt Ltd', WAREHOUSE: 'Hyderabad Warehouse', 'EXPECTED DATE': '25 Jun 2024 · 09:00', ITEMS: '12', QUANTITY: '2,640', STATUS: 'EXPECTED' },
      { 'SHIPMENT ID': 'SHP-2031', SUPPLIER: 'Industrial Supply Co', WAREHOUSE: 'Delhi North Hub', 'EXPECTED DATE': '22 Jun 2024', ITEMS: '6', QUANTITY: '920', STATUS: 'PARTIALLY RECEIVED' },
      { 'SHIPMENT ID': 'SHP-2025', SUPPLIER: 'PackRight Supplies', WAREHOUSE: 'Bengaluru South Depot', 'EXPECTED DATE': '21 Jun 2024', ITEMS: '15', QUANTITY: '3,480', STATUS: 'CANCELLED' },
    ],
  },
  Orders: {
    headings: ['ORDER ID', 'CUSTOMER', 'WAREHOUSE', 'ITEMS', 'PRIORITY', 'ORDER DATE', 'STATUS'],
    rows: [
      { 'ORDER ID': 'ORD-10482', CUSTOMER: 'Reliance Retail Ltd', WAREHOUSE: 'Mumbai Central', ITEMS: '12', PRIORITY: 'HIGH', 'ORDER DATE': '24 Jun 2024', STATUS: 'PICKING' },
      { 'ORDER ID': 'ORD-10481', CUSTOMER: 'Flipkart Wholesale', WAREHOUSE: 'Pune Distribution', ITEMS: '8', PRIORITY: 'NORMAL', 'ORDER DATE': '24 Jun 2024', STATUS: 'PROCESSING' },
      { 'ORDER ID': 'ORD-10479', CUSTOMER: 'Metro Brands', WAREHOUSE: 'Mumbai Central', ITEMS: '4', PRIORITY: 'LOW', 'ORDER DATE': '24 Jun 2024', STATUS: 'PICKED' },
      { 'ORDER ID': 'ORD-10470', CUSTOMER: 'Croma Retail', WAREHOUSE: 'Mumbai Central', ITEMS: '6', PRIORITY: 'NORMAL', 'ORDER DATE': '24 Jun 2024', STATUS: 'PACKED' },
      { 'ORDER ID': 'ORD-10462', CUSTOMER: 'Croma Retail', WAREHOUSE: 'Mumbai Central', ITEMS: '26', PRIORITY: 'CRITICAL', 'ORDER DATE': '23 Jun 2024', STATUS: 'DELAYED' },
      { 'ORDER ID': 'ORD-10455', CUSTOMER: 'Reliance Retail Ltd', WAREHOUSE: 'Mumbai Central', ITEMS: '18', PRIORITY: 'HIGH', 'ORDER DATE': '23 Jun 2024', STATUS: 'SHIPPED' },
      { 'ORDER ID': 'ORD-10443', CUSTOMER: 'Metro Brands', WAREHOUSE: 'Pune Distribution', ITEMS: '3', PRIORITY: 'NORMAL', 'ORDER DATE': '23 Jun 2024', STATUS: 'SHIPPED' },
      { 'ORDER ID': 'ORD-10432', CUSTOMER: 'Flipkart Wholesale', WAREHOUSE: 'Mumbai Central', ITEMS: '14', PRIORITY: 'NORMAL', 'ORDER DATE': '22 Jun 2024', STATUS: 'CANCELLED' },
    ],
  },
  Outbound: {
    headings: ['ORDER ID', 'CUSTOMER', 'WAREHOUSE', 'ITEMS', 'PRIORITY', 'ORDER DATE', 'STATUS'],
    rows: [
      { 'ORDER ID': 'ORD-10482', CUSTOMER: 'Reliance Retail Ltd', WAREHOUSE: 'Mumbai Central', ITEMS: '12', PRIORITY: 'HIGH', 'ORDER DATE': '24 Jun 2024', STATUS: 'PICKING' },
      { 'ORDER ID': 'ORD-10470', CUSTOMER: 'Croma Retail', WAREHOUSE: 'Mumbai Central', ITEMS: '6', PRIORITY: 'NORMAL', 'ORDER DATE': '24 Jun 2024', STATUS: 'PACKED' },
      { 'ORDER ID': 'ORD-10452', CUSTOMER: 'Metro Brands', WAREHOUSE: 'Pune Distribution', ITEMS: '18', PRIORITY: 'NORMAL', 'ORDER DATE': '23 Jun 2024', STATUS: 'SHIPPED' },
      { 'ORDER ID': 'ORD-10448', CUSTOMER: 'Flipkart Wholesale', WAREHOUSE: 'Mumbai Central', ITEMS: '22', PRIORITY: 'CRITICAL', 'ORDER DATE': '23 Jun 2024', STATUS: 'PROCESSING' },
      { 'ORDER ID': 'ORD-10439', CUSTOMER: 'Reliance Retail Ltd', WAREHOUSE: 'Hyderabad Warehouse', ITEMS: '9', PRIORITY: 'HIGH', 'ORDER DATE': '22 Jun 2024', STATUS: 'PICKING' },
      { 'ORDER ID': 'ORD-10425', CUSTOMER: 'Croma Retail', WAREHOUSE: 'Delhi North Hub', ITEMS: '5', PRIORITY: 'LOW', 'ORDER DATE': '22 Jun 2024', STATUS: 'SHIPPED' },
    ],
  },
  Picking: {
    headings: ['PICK ID', 'ORDER ID', 'PICKER', 'ZONE', 'ITEMS', 'PRIORITY', 'STARTED AT', 'STATUS'],
    rows: [
      { 'PICK ID': 'PCK-8021', 'ORDER ID': 'ORD-10482', PICKER: 'Amit Sharma', ZONE: 'B-12', ITEMS: '12', PRIORITY: 'HIGH', 'STARTED AT': '09:42', STATUS: 'IN PROGRESS' },
      { 'PICK ID': 'PCK-8019', 'ORDER ID': 'ORD-10479', PICKER: 'Priya Menon', ZONE: 'A-04', ITEMS: '8', PRIORITY: 'NORMAL', 'STARTED AT': '09:18', STATUS: 'COMPLETED' },
      { 'PICK ID': 'PCK-8018', 'ORDER ID': 'ORD-10477', PICKER: 'Unassigned', ZONE: 'C-02', ITEMS: '21', PRIORITY: 'CRITICAL', 'STARTED AT': '—', STATUS: 'PENDING' },
      { 'PICK ID': 'PCK-8015', 'ORDER ID': 'ORD-10470', PICKER: 'Rohit Verma', ZONE: 'D-08', ITEMS: '6', PRIORITY: 'NORMAL', 'STARTED AT': '08:55', STATUS: 'COMPLETED' },
      { 'PICK ID': 'PCK-8012', 'ORDER ID': 'ORD-10468', PICKER: 'Amit Sharma', ZONE: 'B-04', ITEMS: '14', PRIORITY: 'HIGH', 'STARTED AT': '08:30', STATUS: 'FAILED' },
      { 'PICK ID': 'PCK-8008', 'ORDER ID': 'ORD-10462', PICKER: 'Priya Menon', ZONE: 'A-12', ITEMS: '26', PRIORITY: 'CRITICAL', 'STARTED AT': '08:12', STATUS: 'IN PROGRESS' },
    ],
  },
  Packing: {
    headings: ['PACKAGE ID', 'ORDER ID', 'STATION', 'ITEMS', 'WEIGHT', 'PACKED BY', 'STATUS'],
    rows: [
      { 'PACKAGE ID': 'PKG-5042', 'ORDER ID': 'ORD-10479', STATION: 'Station 1', ITEMS: '8', WEIGHT: '12.4 kg', 'PACKED BY': 'Sneha Iyer', STATUS: 'COMPLETED' },
      { 'PACKAGE ID': 'PKG-5039', 'ORDER ID': 'ORD-10470', STATION: 'Station 2', ITEMS: '6', WEIGHT: '8.2 kg', 'PACKED BY': 'Karthik N', STATUS: 'COMPLETED' },
      { 'PACKAGE ID': 'PKG-5035', 'ORDER ID': 'ORD-10461', STATION: 'Station 1', ITEMS: '15', WEIGHT: '24.8 kg', 'PACKED BY': 'Sneha Iyer', STATUS: 'IN PROGRESS' },
      { 'PACKAGE ID': 'PKG-5031', 'ORDER ID': 'ORD-10458', STATION: 'Station 3', ITEMS: '4', WEIGHT: '5.6 kg', 'PACKED BY': 'Unassigned', STATUS: 'AWAITING' },
      { 'PACKAGE ID': 'PKG-5028', 'ORDER ID': 'ORD-10452', STATION: 'Station 2', ITEMS: '18', WEIGHT: '32.1 kg', 'PACKED BY': 'Karthik N', STATUS: 'COMPLETED' },
      { 'PACKAGE ID': 'PKG-5024', 'ORDER ID': 'ORD-10445', STATION: 'Station 1', ITEMS: '3', WEIGHT: '4.2 kg', 'PACKED BY': 'Sneha Iyer', STATUS: 'EXCEPTION' },
    ],
  },
  Shipping: {
    headings: ['SHIPMENT ID', 'ORDER ID', 'CARRIER', 'TRACKING NUMBER', 'DESTINATION', 'SHIP DATE', 'STATUS'],
    rows: [
      { 'SHIPMENT ID': 'SHP-2048', 'ORDER ID': 'ORD-10455', CARRIER: 'BlueDart Express', 'TRACKING NUMBER': 'BD4589210', DESTINATION: 'Bengaluru, KA', 'SHIP DATE': '24 Jun 2024', STATUS: 'IN TRANSIT' },
      { 'SHIPMENT ID': 'SHP-2047', 'ORDER ID': 'ORD-10443', CARRIER: 'Delhivery', 'TRACKING NUMBER': 'DL9012448', DESTINATION: 'Pune, MH', 'SHIP DATE': '24 Jun 2024', STATUS: 'DELIVERED' },
      { 'SHIPMENT ID': 'SHP-2046', 'ORDER ID': 'ORD-10432', CARRIER: 'Ecom Express', 'TRACKING NUMBER': 'EC7721092', DESTINATION: 'Chennai, TN', 'SHIP DATE': '23 Jun 2024', STATUS: 'DELAYED' },
      { 'SHIPMENT ID': 'SHP-2044', 'ORDER ID': 'ORD-10425', CARRIER: 'BlueDart Express', 'TRACKING NUMBER': 'BD4589188', DESTINATION: 'New Delhi, DL', 'SHIP DATE': '23 Jun 2024', STATUS: 'IN TRANSIT' },
      { 'SHIPMENT ID': 'SHP-2041', 'ORDER ID': 'ORD-10418', CARRIER: 'DTDC', 'TRACKING NUMBER': 'DT5520934', DESTINATION: 'Hyderabad, TS', 'SHIP DATE': '22 Jun 2024', STATUS: 'DELIVERED' },
      { 'SHIPMENT ID': 'SHP-2038', 'ORDER ID': 'ORD-10410', CARRIER: 'Delhivery', 'TRACKING NUMBER': 'DL9012401', DESTINATION: 'Kolkata, WB', 'SHIP DATE': '22 Jun 2024', STATUS: 'READY TO SHIP' },
    ],
  },
  'Stock Transfers': {
    headings: ['TRANSFER ID', 'SOURCE WAREHOUSE', 'DESTINATION', 'PRODUCTS', 'QUANTITY', 'REQUESTED BY', 'DATE', 'STATUS'],
    rows: [
      { 'TRANSFER ID': 'TRF-3048', 'SOURCE WAREHOUSE': 'Mumbai Central', DESTINATION: 'Pune Distribution', PRODUCTS: 'Wireless Keyboard', QUANTITY: '480', 'REQUESTED BY': 'Amit Sharma', DATE: '24 Jun 2024', STATUS: 'APPROVED' },
      { 'TRANSFER ID': 'TRF-3047', 'SOURCE WAREHOUSE': 'Hyderabad Warehouse', DESTINATION: 'Mumbai Central', PRODUCTS: 'Storage Bins', QUANTITY: '220', 'REQUESTED BY': 'Suresh Rao', DATE: '23 Jun 2024', STATUS: 'IN TRANSIT' },
      { 'TRANSFER ID': 'TRF-3046', 'SOURCE WAREHOUSE': 'Mumbai Central', DESTINATION: 'Hyderabad Warehouse', PRODUCTS: 'RFID Readers', QUANTITY: '64', 'REQUESTED BY': 'Rajesh Kumar', DATE: '23 Jun 2024', STATUS: 'REQUESTED' },
      { 'TRANSFER ID': 'TRF-3042', 'SOURCE WAREHOUSE': 'Pune Distribution', DESTINATION: 'Bengaluru South Depot', PRODUCTS: 'Thermal Label Rolls', QUANTITY: '1,200', 'REQUESTED BY': 'Amit Sharma', DATE: '22 Jun 2024', STATUS: 'COMPLETED' },
      { 'TRANSFER ID': 'TRF-3038', 'SOURCE WAREHOUSE': 'Delhi North Hub', DESTINATION: 'Mumbai Central', PRODUCTS: 'USB-C Docking Stations', QUANTITY: '180', 'REQUESTED BY': 'Anil Gupta', DATE: '21 Jun 2024', STATUS: 'REJECTED' },
    ],
  },
  Suppliers: {
    headings: ['SUPPLIER ID', 'SUPPLIER NAME', 'CONTACT', 'EMAIL', 'PHONE', 'PRODUCTS', 'STATUS'],
    rows: [
      { 'SUPPLIER ID': 'SUP-0018', 'SUPPLIER NAME': 'TechSource India Pvt Ltd', CONTACT: 'Vikram Mehta', EMAIL: 'vikram@techsource.in', PHONE: '+91 22 4582 1190', PRODUCTS: '42', STATUS: 'ACTIVE' },
      { 'SUPPLIER ID': 'SUP-0024', 'SUPPLIER NAME': 'PackRight Supplies', CONTACT: 'Neha Kapoor', EMAIL: 'neha@packright.in', PHONE: '+91 20 4102 8831', PRODUCTS: '18', STATUS: 'ACTIVE' },
      { 'SUPPLIER ID': 'SUP-0009', 'SUPPLIER NAME': 'Global Electronics', CONTACT: 'Arjun Nair', EMAIL: 'arjun@globalel.in', PHONE: '+91 80 2218 0044', PRODUCTS: '27', STATUS: 'ON HOLD' },
      { 'SUPPLIER ID': 'SUP-0031', 'SUPPLIER NAME': 'Industrial Supply Co', CONTACT: 'Ramesh Patil', EMAIL: 'ramesh@indsupply.in', PHONE: '+91 11 4567 8900', PRODUCTS: '35', STATUS: 'ACTIVE' },
      { 'SUPPLIER ID': 'SUP-0014', 'SUPPLIER NAME': 'Nilkamal Logistics', CONTACT: 'Sonia Dutt', EMAIL: 'sonia@nilkamal.in', PHONE: '+91 22 6789 2345', PRODUCTS: '14', STATUS: 'ACTIVE' },
    ],
  },
  Customers: {
    headings: ['CUSTOMER ID', 'CUSTOMER NAME', 'EMAIL', 'PHONE', 'ORDERS', 'LAST ORDER', 'STATUS'],
    rows: [
      { 'CUSTOMER ID': 'CUS-1001', 'CUSTOMER NAME': 'Reliance Retail Ltd', EMAIL: 'procurement@relianceretail.in', PHONE: '+91 22 3552 8800', ORDERS: '284', 'LAST ORDER': 'Today, 09:42', STATUS: 'ACTIVE' },
      { 'CUSTOMER ID': 'CUS-1008', 'CUSTOMER NAME': 'Flipkart Wholesale', EMAIL: 'warehouse@flipkart.com', PHONE: '+91 80 4567 1234', ORDERS: '192', 'LAST ORDER': 'Today, 08:18', STATUS: 'ACTIVE' },
      { 'CUSTOMER ID': 'CUS-1014', 'CUSTOMER NAME': 'Croma Retail', EMAIL: 'supply@croma.com', PHONE: '+91 22 6749 8000', ORDERS: '86', 'LAST ORDER': 'Yesterday', STATUS: 'ACTIVE' },
      { 'CUSTOMER ID': 'CUS-1022', 'CUSTOMER NAME': 'Metro Brands Ltd', EMAIL: 'logistics@metrobrands.in', PHONE: '+91 22 3456 7800', ORDERS: '64', 'LAST ORDER': 'Yesterday', STATUS: 'ACTIVE' },
      { 'CUSTOMER ID': 'CUS-1005', 'CUSTOMER NAME': 'Spencers Retail', EMAIL: 'ops@spencers.in', PHONE: '+91 33 2244 6688', ORDERS: '38', 'LAST ORDER': '3 days ago', STATUS: 'INACTIVE' },
    ],
  },
};

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    title: 'Inventory Reports', icon: '◫',
    reports: [
      { name: 'Inventory Summary', description: 'Complete stock snapshot across all warehouses', lastRun: 'Today, 08:30', icon: '▥' },
      { name: 'Stock Movement', description: 'Track all stock movements and transfers', lastRun: 'Yesterday, 18:00', icon: '⇄' },
      { name: 'Low Stock Report', description: 'Items at or below reorder level', lastRun: 'Today, 06:00', icon: '△' },
      { name: 'Inventory Valuation', description: 'Financial valuation of current inventory', lastRun: '22 Jun 2024', icon: '₹' },
    ],
  },
  {
    title: 'Warehouse Reports', icon: '▦',
    reports: [
      { name: 'Warehouse Utilization', description: 'Space and capacity usage by warehouse', lastRun: 'Today, 07:00', icon: '⌗' },
      { name: 'Bin Utilization', description: 'Individual bin occupancy and efficiency', lastRun: 'Yesterday, 17:30', icon: '▣' },
      { name: 'Warehouse Performance', description: 'Throughput and operational KPIs', lastRun: '23 Jun 2024', icon: '↗' },
    ],
  },
  {
    title: 'Order Reports', icon: '≡',
    reports: [
      { name: 'Order Summary', description: 'Order volume and fulfillment rates', lastRun: 'Today, 09:00', icon: '≡' },
      { name: 'Picking Performance', description: 'Pick rates, accuracy and cycle times', lastRun: 'Yesterday, 19:00', icon: '⌖' },
      { name: 'Packing Performance', description: 'Pack station throughput and exceptions', lastRun: 'Yesterday, 18:30', icon: '▣' },
      { name: 'Shipping Performance', description: 'Carrier delivery times and success rates', lastRun: '23 Jun 2024', icon: '➤' },
    ],
  },
  {
    title: 'Supplier Reports', icon: '♧',
    reports: [
      { name: 'Supplier Performance', description: 'On-time delivery and quality metrics', lastRun: '22 Jun 2024', icon: '♧' },
      { name: 'Receiving Performance', description: 'Inbound processing speed and accuracy', lastRun: '23 Jun 2024', icon: '⇥' },
    ],
  },
];

export const USERS: UserRow[] = [
  { name: 'Admin User', email: 'admin@wms360.com', role: 'Admin', warehouse: 'All Warehouses', lastLogin: 'Just now', status: 'ACTIVE', avatar: 'AR' },
  { name: 'Rajesh Kumar', email: 'rajesh.kumar@wms360.com', role: 'Warehouse Manager', warehouse: 'Mumbai Central', lastLogin: 'Just now', status: 'ACTIVE', avatar: 'RK' },
  { name: 'Amit Sharma', email: 'amit.sharma@wms360.com', role: 'Supervisor', warehouse: 'Mumbai Central', lastLogin: '12 min ago', status: 'ACTIVE', avatar: 'AS' },
  { name: 'Priya Menon', email: 'priya.menon@wms360.com', role: 'Inventory Manager', warehouse: 'Pune Distribution', lastLogin: '2 hrs ago', status: 'ACTIVE', avatar: 'PM' },
  { name: 'Suresh Rao', email: 'suresh.rao@wms360.com', role: 'Warehouse Manager', warehouse: 'Hyderabad Warehouse', lastLogin: '1 hr ago', status: 'ACTIVE', avatar: 'SR' },
  { name: 'Sneha Iyer', email: 'sneha.iyer@wms360.com', role: 'Packer', warehouse: 'Mumbai Central', lastLogin: '3 hrs ago', status: 'ACTIVE', avatar: 'SI' },
  { name: 'Rohit Verma', email: 'rohit.verma@wms360.com', role: 'Picker', warehouse: 'Mumbai Central', lastLogin: '5 hrs ago', status: 'OFFLINE', avatar: 'RV' },
  { name: 'Anil Gupta', email: 'anil.gupta@wms360.com', role: 'Warehouse Manager', warehouse: 'Delhi North Hub', lastLogin: 'Yesterday', status: 'OFFLINE', avatar: 'AG' },
];

export const ROLES = ['Admin', 'Warehouse Manager', 'Supervisor', 'Picker', 'Packer', 'Inventory Manager', 'Seller', 'Viewer'];

export const PERMISSION_MODULES = ['Dashboard', 'Inventory', 'Products', 'Inbound', 'Outbound', 'Orders', 'Reports', 'Users', 'Settings'];

export const PERMISSION_MATRIX: RolePermission[] = [
  { module: 'Dashboard', view: true, create: false, edit: false, delete: false, approve: false },
  { module: 'Inventory', view: true, create: true, edit: true, delete: false, approve: true },
  { module: 'Products', view: true, create: true, edit: true, delete: true, approve: false },
  { module: 'Inbound', view: true, create: true, edit: true, delete: false, approve: true },
  { module: 'Outbound', view: true, create: true, edit: true, delete: false, approve: true },
  { module: 'Orders', view: true, create: true, edit: true, delete: true, approve: true },
  { module: 'Reports', view: true, create: false, edit: false, delete: false, approve: false },
  { module: 'Users', view: true, create: true, edit: true, delete: true, approve: false },
  { module: 'Settings', view: true, create: false, edit: true, delete: false, approve: false },
];

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    key: 'general', label: 'General', icon: '⚙',
    fields: [
      { label: 'Company Name', type: 'text', value: 'WMS360 Logistics Pvt Ltd', hint: 'Displayed across the application' },
      { label: 'Default Currency', type: 'select', value: 'INR (₹)', options: ['INR (₹)', 'USD ($)', 'EUR (€)', 'GBP (£)'] },
      { label: 'Time Zone', type: 'select', value: 'Asia/Kolkata (IST)', options: ['Asia/Kolkata (IST)', 'Asia/Dubai (GST)', 'Europe/London (GMT)', 'America/New_York (EST)'] },
      { label: 'Date Format', type: 'select', value: 'DD MMM YYYY', options: ['DD MMM YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] },
    ],
  },
  {
    key: 'warehouse', label: 'Warehouse Settings', icon: '▦',
    fields: [
      { label: 'Default Warehouse', type: 'select', value: 'Mumbai Central Warehouse', options: ['Mumbai Central Warehouse', 'Pune Distribution Center', 'Hyderabad Warehouse', 'Delhi North Hub', 'Bengaluru South Depot'] },
      { label: 'Auto-assign Pickers', type: 'toggle', value: true, hint: 'Automatically assign pick tasks to available staff' },
      { label: 'Capacity Alert Threshold', type: 'select', value: '80%', options: ['70%', '75%', '80%', '85%', '90%'] },
      { label: 'Reorder Alert Threshold', type: 'select', value: '20% above reorder level', options: ['At reorder level', '10% above reorder level', '20% above reorder level', '30% above reorder level'] },
    ],
  },
  {
    key: 'notifications', label: 'Notifications', icon: '◔',
    fields: [
      { label: 'Low Stock Alerts', type: 'toggle', value: true, hint: 'Get notified when items drop below reorder level' },
      { label: 'Capacity Warnings', type: 'toggle', value: true, hint: 'Alert when warehouse capacity exceeds threshold' },
      { label: 'Order Delay Notifications', type: 'toggle', value: true, hint: 'Notify when orders are running behind schedule' },
      { label: 'Inbound Shipment Reminders', type: 'toggle', value: false, hint: 'Remind about expected deliveries 1 hour before arrival' },
      { label: 'Daily Summary Email', type: 'toggle', value: true, hint: 'Receive a daily operations summary at 8:00 AM' },
    ],
  },
  {
    key: 'security', label: 'Security', icon: '⚒',
    fields: [
      { label: 'Two-Factor Authentication', type: 'toggle', value: true, hint: 'Require 2FA for all admin and manager accounts' },
      { label: 'Session Timeout', type: 'select', value: '30 minutes', options: ['15 minutes', '30 minutes', '1 hour', '2 hours', 'Never'] },
      { label: 'Password Min Length', type: 'select', value: '12 characters', options: ['8 characters', '10 characters', '12 characters', '16 characters'] },
      { label: 'IP Allowlist', type: 'textarea', value: '103.21.58.0/24\n180.149.48.0/22', hint: 'One IP or CIDR range per line. Leave empty to allow all.' },
    ],
  },
  {
    key: 'system', label: 'System Preferences', icon: '✦',
    fields: [
      { label: 'Theme', type: 'select', value: 'Light', options: ['Light', 'Dark', 'Auto (system)'] },
      { label: 'Language', type: 'select', value: 'English', options: ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu'] },
      { label: 'Density', type: 'select', value: 'Comfortable', options: ['Compact', 'Comfortable', 'Spacious'] },
      { label: 'Show Keyboard Shortcuts', type: 'toggle', value: true },
    ],
  },
];

export const NOTIFICATIONS_LIST = [
  { title: 'Low stock alert', detail: 'SKU-10078 is below reorder level', time: '8 min ago', tone: 'orange' },
  { title: 'Inbound shipment arriving', detail: 'SHP-2051 expected in 45 minutes', time: '22 min ago', tone: 'blue' },
  { title: 'Order delayed', detail: 'ORD-10462 needs attention', time: '1 hr ago', tone: 'red' },
  { title: 'Warehouse capacity warning', detail: 'Bengaluru South Depot at 91%', time: '2 hrs ago', tone: 'orange' },
  { title: 'Stock transfer completed', detail: 'TRF-3042 delivered to Bengaluru', time: '4 hrs ago', tone: 'green' },
];

export function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('low') || s.includes('hold') || s.includes('delay') || s.includes('critical') || s.includes('exception') || s.includes('partially') || s.includes('near')) return 'warning';
  if (s.includes('out of') || s.includes('cancel') || s.includes('reject') || s.includes('failed') || s.includes('inactive') || s.includes('offline')) return 'danger';
  if (s.includes('active') || s.includes('stock') || s.includes('received') || s.includes('completed') || s.includes('delivered') || s.includes('ready') || s.includes('shipped') || s.includes('picked') || s.includes('packed')) return 'success';
  return 'info';
}

export function priorityClass(priority: string): string {
  const p = priority.toLowerCase();
  if (p === 'critical') return 'danger';
  if (p === 'high') return 'warning';
  if (p === 'low') return 'info';
  return 'info';
}
