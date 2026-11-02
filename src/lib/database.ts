import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import {
  ChefOrder,
  CustomerOrder,
  CustomerOrderItem,
  FulfillmentType,
  InternalOrderItem,
  InternalProduct,
  NotificationEventRecord,
  OrderStatus,
  ProductSalesSummaryRow,
  ReportingPeriod,
  SalesAndProfitsReport,
} from '../types.ts';

export interface PushSubscriptionRecord {
  id: string;
  customerId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface DatabaseSchema {
  nextOrderNumber: number;
  orders: ChefOrder[];
  subscriptions: PushSubscriptionRecord[];
  notificationEvents: NotificationEventRecord[];
  settings: {
    salesResetAt: string | null;
    vapidPublicKey: string;
    vapidPrivateKey: string;
  };
}

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'store.json');

let dbState: DatabaseSchema | null = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadDatabase(): DatabaseSchema {
  if (dbState) return dbState;
  ensureDataDir();

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
      const vapidKeys =
        parsed.settings?.vapidPublicKey && parsed.settings?.vapidPrivateKey
          ? {
              publicKey: parsed.settings.vapidPublicKey,
              privateKey: parsed.settings.vapidPrivateKey,
            }
          : webpush.generateVAPIDKeys();

      dbState = {
        nextOrderNumber:
          typeof parsed.nextOrderNumber === 'number' && parsed.nextOrderNumber >= 1001
            ? parsed.nextOrderNumber
            : 1001,
        orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
        notificationEvents: Array.isArray(parsed.notificationEvents)
          ? parsed.notificationEvents
          : [],
        settings: {
          salesResetAt: parsed.settings?.salesResetAt ?? null,
          vapidPublicKey: process.env.VAPID_PUBLIC_KEY || vapidKeys.publicKey,
          vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || vapidKeys.privateKey,
        },
      };
      saveDatabase();
      return dbState;
    } catch (err) {
      console.error('Failed to parse store.json, initializing fresh state:', err);
    }
  }

  const generatedVapid = webpush.generateVAPIDKeys();
  dbState = {
    nextOrderNumber: 1001,
    orders: [],
    subscriptions: [],
    notificationEvents: [],
    settings: {
      salesResetAt: null,
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || generatedVapid.publicKey,
      vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || generatedVapid.privateKey,
    },
  };
  saveDatabase();
  return dbState;
}

function saveDatabase() {
  if (!dbState) return;
  ensureDataDir();
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(dbState, null, 2), 'utf-8');
  fs.renameSync(tempFile, DB_FILE);
}

export function getVapidConfig() {
  const db = loadDatabase();
  return {
    publicKey: db.settings.vapidPublicKey,
    privateKey: db.settings.vapidPrivateKey,
    subject: process.env.VAPID_SUBJECT || 'mailto:ma.anoosh111@gmail.com',
  };
}

/**
 * Strips private profit fields from a ChefOrder to produce a safe CustomerOrder.
 */
export function toCustomerOrder(order: ChefOrder): CustomerOrder {
  const safeItems: CustomerOrderItem[] = order.items.map((item) => ({
    productId: item.productId,
    name: item.name,
    category: item.category,
    price: item.price,
    quantity: item.quantity,
    image: item.image,
    engravingName: item.engravingName,
    hasLogo: item.hasLogo,
    logoUrl: item.logoUrl,
    logoFileName: item.logoFileName,
    designerNotes: item.designerNotes,
  }));

  return {
    id: order.id,
    orderCode: order.orderCode,
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    customerNotes: order.customerNotes,
    fulfillmentType: order.fulfillmentType,
    status: order.status,
    items: safeItems,
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge,
    discount: order.discount,
    refundAmount: order.refundAmount,
    total: order.total,
    createdAt: order.createdAt,
    startedAt: order.startedAt,
    completedAt: order.completedAt,
    isPaid: order.isPaid,
    engravingName: order.engravingName,
    hasLogo: order.hasLogo,
    logoUrl: order.logoUrl,
    logoFileName: order.logoFileName,
    designerNotes: order.designerNotes,
  };
}

/**
 * Creates a new order with server-validated prices from Google Sheets.
 */
export function createOrder(params: {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerNotes?: string;
  fulfillmentType: FulfillmentType;
  requestedItems: Array<{
    productId?: string;
    name: string;
    quantity: number;
    engravingName?: string;
    hasLogo?: boolean;
    logoUrl?: string;
    logoFileName?: string;
    designerNotes?: string;
  }>;
  catalogProducts: InternalProduct[];
  deliveryCharge?: number;
  discount?: number;
  engravingName?: string;
  hasLogo?: boolean;
  logoUrl?: string;
  logoFileName?: string;
  designerNotes?: string;
}): ChefOrder {
  const db = loadDatabase();

  if (!params.customerId || !params.customerId.trim()) {
    throw new Error('Customer identity is required');
  }
  if (!params.customerName || !params.customerName.trim()) {
    throw new Error('Customer name is required');
  }
  if (!params.customerPhone || !params.customerPhone.trim()) {
    throw new Error('Customer phone number is required');
  }
  if (
    params.fulfillmentType !== 'Delivery' &&
    params.fulfillmentType !== 'Pickup'
  ) {
    throw new Error('Fulfillment type must be Delivery or Pickup');
  }
  if (
    params.fulfillmentType === 'Delivery' &&
    (!params.customerAddress || !params.customerAddress.trim())
  ) {
    throw new Error('Delivery address is required for Delivery orders');
  }
  if (!Array.isArray(params.requestedItems) || params.requestedItems.length === 0) {
    throw new Error('Order must contain at least one product');
  }

  const orderItems: InternalOrderItem[] = [];
  let subtotal = 0;

  for (const reqItem of params.requestedItems) {
    const qty = Math.floor(Number(reqItem.quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`Invalid quantity for item ${reqItem.name}`);
    }

    // Match against authoritative Google Sheet catalog
    const matchedProduct =
      params.catalogProducts.find((p) => p.id === reqItem.productId) ||
      params.catalogProducts.find(
        (p) => p.name.trim().toLowerCase() === (reqItem.name || '').trim().toLowerCase()
      );

    if (!matchedProduct) {
      throw new Error(`Product "${reqItem.name}" is no longer available in the menu`);
    }

    const unitPrice = matchedProduct.price;
    const unitProfit =
      matchedProduct.profit !== null &&
      matchedProduct.profit !== undefined &&
      Number.isFinite(matchedProduct.profit)
        ? matchedProduct.profit
        : null;

    subtotal += unitPrice * qty;

    const itemEngravingName = (reqItem.engravingName || params.engravingName || '').trim();
    const itemHasLogo = Boolean(reqItem.hasLogo ?? params.hasLogo ?? false);
    const itemLogoUrl = reqItem.logoUrl || (itemHasLogo ? params.logoUrl : undefined);
    const itemLogoFileName = reqItem.logoFileName || (itemHasLogo ? params.logoFileName : undefined);
    const itemDesignerNotes = (reqItem.designerNotes || params.designerNotes || '').trim();

    orderItems.push({
      productId: matchedProduct.id,
      name: matchedProduct.name,
      category: matchedProduct.category,
      price: unitPrice,
      quantity: qty,
      image: matchedProduct.image,
      unitProfit,
      hasProfitSnapshot: unitProfit !== null,
      engravingName: itemEngravingName || undefined,
      hasLogo: itemHasLogo,
      logoUrl: itemLogoUrl,
      logoFileName: itemLogoFileName,
      designerNotes: itemDesignerNotes || undefined,
    });
  }

  const deliveryCharge =
    params.fulfillmentType === 'Delivery'
      ? Math.max(0, Number(params.deliveryCharge ?? 0))
      : 0;
  const discount = Math.max(0, Number(params.discount ?? 0));
  const total = Math.max(0, subtotal + deliveryCharge - discount);

  const orderNum = db.nextOrderNumber++;
  const orderCode = `ORD-${orderNum}`;
  const nowIso = new Date().toISOString();

  const finalEngravingName =
    (params.engravingName || orderItems.find((i) => i.engravingName)?.engravingName || '').trim();
  const finalHasLogo = Boolean(
    params.hasLogo ?? orderItems.some((i) => i.hasLogo)
  );
  const finalLogoUrl =
    params.logoUrl || orderItems.find((i) => i.logoUrl)?.logoUrl || undefined;
  const finalLogoFileName =
    params.logoFileName || orderItems.find((i) => i.logoFileName)?.logoFileName || undefined;
  const finalDesignerNotes =
    (params.designerNotes || orderItems.find((i) => i.designerNotes)?.designerNotes || '').trim();

  const newOrder: ChefOrder = {
    id: `order_${orderNum}_${Date.now()}`,
    orderCode,
    customerId: params.customerId.trim(),
    customerName: params.customerName.trim(),
    customerPhone: params.customerPhone.trim(),
    customerAddress:
      params.fulfillmentType === 'Delivery' ? (params.customerAddress || '').trim() : '',
    customerNotes: (params.customerNotes || '').trim(),
    fulfillmentType: params.fulfillmentType,
    status: 'Pending',
    items: orderItems,
    subtotal,
    deliveryCharge,
    discount,
    refundAmount: 0,
    total,
    createdAt: nowIso,
    startedAt: null,
    completedAt: null,
    isPaid: true,
    isArchived: false,
    archivedAt: null,
    archiveDeleted: false,
    archiveDeletedAt: null,
    notificationStatus: 'none',
    notificationMessage: '',
    notificationSentAt: null,
    engravingName: finalEngravingName || undefined,
    hasLogo: finalHasLogo,
    logoUrl: finalLogoUrl,
    logoFileName: finalLogoFileName,
    designerNotes: finalDesignerNotes || undefined,
  };

  db.orders.unshift(newOrder);
  saveDatabase();
  return newOrder;
}

/**
 * Retrieves active (non-archived) orders for the Chef Dashboard, newest first.
 */
export function getActiveChefOrders(): ChefOrder[] {
  const db = loadDatabase();
  return db.orders
    .filter((o) => !o.isArchived && !o.archiveDeleted)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Retrieves archived orders (that have not been permanently deleted from archive), newest first.
 */
export function getArchivedChefOrders(): ChefOrder[] {
  const db = loadDatabase();
  return db.orders
    .filter((o) => o.isArchived && !o.archiveDeleted)
    .sort(
      (a, b) =>
        new Date(b.archivedAt || b.createdAt).getTime() -
        new Date(a.archivedAt || a.createdAt).getTime()
    );
}

/**
 * Retrieves orders belonging exclusively to a specific authenticated customer.
 */
export function getCustomerOrders(customerId: string): CustomerOrder[] {
  const db = loadDatabase();
  if (!customerId || !customerId.trim()) return [];
  return db.orders
    .filter((o) => o.customerId === customerId.trim() && !o.archiveDeleted)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(toCustomerOrder);
}

export function getChefOrderById(orderIdOrCode: string): ChefOrder | null {
  const db = loadDatabase();
  return (
    db.orders.find(
      (o) => o.id === orderIdOrCode || o.orderCode === orderIdOrCode
    ) || null
  );
}

/**
 * Transitions an order from Pending -> In Progress.
 */
export function transitionOrderToInProgress(orderId: string): ChefOrder {
  const db = loadDatabase();
  const order = db.orders.find((o) => o.id === orderId || o.orderCode === orderId);
  if (!order) {
    throw new Error('Order not found');
  }
  if (order.status !== 'Pending') {
    throw new Error(
      `Invalid status transition: Order ${order.orderCode} is currently "${order.status}". Only "Pending" orders can be started.`
    );
  }

  order.status = 'In Progress';
  order.startedAt = new Date().toISOString();
  saveDatabase();
  return order;
}

/**
 * Transitions an order from In Progress -> Finished.
 * Captures and locks the current Profit snapshot from Google Sheets at the exact moment the sale is completed.
 * Subsequent edits to Google Sheets will NEVER alter this completed order's historical Profit snapshot.
 */
export function transitionOrderToFinished(
  orderId: string,
  latestCatalogProducts?: InternalProduct[],
  overrideCompletedAtIso?: string
): ChefOrder {
  const db = loadDatabase();
  const order = db.orders.find((o) => o.id === orderId || o.orderCode === orderId);
  if (!order) {
    throw new Error('Order not found');
  }
  if (order.status !== 'In Progress') {
    throw new Error(
      `Invalid status transition: Order ${order.orderCode} is currently "${order.status}". Only "In Progress" orders can be finished.`
    );
  }

  // Capture the product's current Profit value from Google Sheets at the time the sale is completed
  if (Array.isArray(latestCatalogProducts) && latestCatalogProducts.length > 0) {
    order.items = order.items.map((item) => {
      const matched =
        latestCatalogProducts.find((p) => p.id === item.productId) ||
        latestCatalogProducts.find(
          (p) => p.name.trim().toLowerCase() === item.name.trim().toLowerCase()
        );

      if (matched) {
        const snapshotProfit =
          matched.profit !== null &&
          matched.profit !== undefined &&
          Number.isFinite(matched.profit)
            ? matched.profit
            : null;
        return {
          ...item,
          unitProfit: snapshotProfit,
          hasProfitSnapshot: snapshotProfit !== null,
        };
      }
      return item;
    });
  }

  order.status = 'Finished';
  order.completedAt = overrideCompletedAtIso || new Date().toISOString();
  order.isPaid = true;
  saveDatabase();
  return order;
}

/**
 * Archives an order from the active Chef Dashboard so it moves to the Archived Orders tab
 * while preserving historical records.
 */
export function archiveOrder(orderId: string): ChefOrder {
  const db = loadDatabase();
  const order = db.orders.find((o) => o.id === orderId || o.orderCode === orderId);
  if (!order) {
    throw new Error('Order not found');
  }
  order.isArchived = true;
  order.archivedAt = new Date().toISOString();
  saveDatabase();
  return order;
}

/**
 * Permanently deletes a single archived order from the Archived Orders list.
 * Preserves historical completed sales records for Sales & Profits reporting!
 */
export function deleteSingleArchivedOrder(orderId: string): ChefOrder {
  const db = loadDatabase();
  const order = db.orders.find((o) => o.id === orderId || o.orderCode === orderId);
  if (!order) {
    throw new Error('Order not found');
  }
  if (!order.isArchived) {
    throw new Error('Only archived orders can be deleted from the archive');
  }
  if (order.archiveDeleted) {
    throw new Error('Archived order has already been deleted');
  }

  order.archiveDeleted = true;
  order.archiveDeletedAt = new Date().toISOString();
  saveDatabase();
  return order;
}

/**
 * Bulk-deletes selected archived orders.
 * Never affects active, pending, or in-progress non-archived orders.
 * Preserves historical completed sales records for Sales & Profits reporting.
 */
export function deleteSelectedArchivedOrders(orderIds: string[]): {
  deletedCount: number;
  deletedIds: string[];
} {
  const db = loadDatabase();
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new Error('No archived orders selected for deletion');
  }

  const targetSet = new Set(orderIds);
  const deletedIds: string[] = [];
  const nowIso = new Date().toISOString();

  for (const order of db.orders) {
    if (
      (targetSet.has(order.id) || targetSet.has(order.orderCode)) &&
      order.isArchived &&
      !order.archiveDeleted
    ) {
      order.archiveDeleted = true;
      order.archiveDeletedAt = nowIso;
      deletedIds.push(order.id);
    }
  }

  saveDatabase();
  return {
    deletedCount: deletedIds.length,
    deletedIds,
  };
}

/**
 * Clears all archived orders without affecting any active/non-archived orders
 * and without corrupting historical completed sales reports.
 */
export function clearAllArchivedOrders(): { deletedCount: number } {
  const db = loadDatabase();
  let deletedCount = 0;
  const nowIso = new Date().toISOString();

  for (const order of db.orders) {
    if (order.isArchived && !order.archiveDeleted) {
      order.archiveDeleted = true;
      order.archiveDeletedAt = nowIso;
      deletedCount++;
    }
  }

  saveDatabase();
  return { deletedCount };
}

/**
 * Resets the Sales & Profits reporting baseline timestamp so that all reports calculate
 * from this moment forward, while preserving all historical orders, archived orders,
 * and historical Profit snapshots intact.
 */
export function resetSalesAndProfitsBaseline(customTimestampIso?: string): {
  salesResetAt: string;
} {
  const db = loadDatabase();
  const resetIso = customTimestampIso || new Date().toISOString();
  db.settings.salesResetAt = resetIso;
  saveDatabase();
  return { salesResetAt: resetIso };
}

export function getSalesResetBaseline(): string | null {
  const db = loadDatabase();
  return db.settings.salesResetAt;
}

/**
 * Calculates date boundaries for Today, This Week, and This Month.
 */
export function getPeriodBoundaries(
  period: ReportingPeriod,
  referenceDate: Date = new Date()
): { start: Date; end: Date } {
  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);

  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);

  if (period === 'today') {
    return { start, end };
  }

  if (period === 'week') {
    // Start of the current 7-day week window (inclusive of today)
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  return { start, end };
}

/**
 * Calculates the Sales & Profits report for the requested period (today | week | month).
 * Uses ONLY the historical unitSellingPrice and unitProfit snapshot recorded on each order item
 * at the time the sale was completed.
 * Never recalculates historical sales using current Google Sheet Profit values.
 */
export function calculateSalesAndProfitsReport(
  period: ReportingPeriod,
  referenceDate: Date = new Date()
): SalesAndProfitsReport {
  const db = loadDatabase();
  const { start, end } = getPeriodBoundaries(period, referenceDate);
  const salesResetAt = db.settings.salesResetAt;
  const resetTimeMs = salesResetAt ? new Date(salesResetAt).getTime() : null;

  const effectiveStartMs =
    resetTimeMs !== null && Number.isFinite(resetTimeMs)
      ? Math.max(start.getTime(), resetTimeMs)
      : start.getTime();
  const endMs = end.getTime();

  // Filter strictly for valid completed and paid orders within the effective period
  // Note: Archived or archive-deleted orders that were legitimately Finished & Paid
  // remain valid historical sales!
  const qualifyingOrders = db.orders
    .filter((order) => {
      if (order.status !== 'Finished' || !order.isPaid) return false;
      const completedTime = new Date(order.completedAt || order.createdAt).getTime();
      if (!Number.isFinite(completedTime)) return false;
      return completedTime >= effectiveStartMs && completedTime <= endMs;
    })
    .sort(
      (a, b) =>
        new Date(a.completedAt || a.createdAt).getTime() -
        new Date(b.completedAt || b.createdAt).getTime()
    );

  let completedPaidOrdersCount = 0;
  let totalProductsSoldQuantity = 0;
  let totalSalesRevenue = 0;
  let totalProfit = 0;
  let ordersWithUnavailableProfit = 0;
  let itemsWithUnavailableProfit = 0;

  const productMap = new Map<
    string,
    {
      productKey: string;
      productName: string;
      category: string;
      totalQuantitySold: number;
      unitPricesSet: Set<number>;
      latestUnitPrice: number;
      unitProfitsSet: Set<number>;
      latestUnitProfit: number | null;
      hasUnavailableProfitRecords: boolean;
      unavailableProfitQuantity: number;
      totalSalesRevenue: number;
      totalProfit: number;
      hasAnyValidProfit: boolean;
    }
  >();

  for (const order of qualifyingOrders) {
    completedPaidOrdersCount += 1;

    // Compute gross item subtotal to proportionally apply any order-level discount or refund
    const grossItemsTotal = order.items.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );
    const totalAdjustments = Math.max(0, (order.discount || 0) + (order.refundAmount || 0));
    const adjustmentFactor =
      grossItemsTotal > 0
        ? Math.max(0, (grossItemsTotal - totalAdjustments) / grossItemsTotal)
        : 1;

    let orderHasMissingProfit = false;

    for (const item of order.items) {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;

      const unitPrice = Number(item.price) || 0;
      const itemRevenue = Number((unitPrice * qty * adjustmentFactor).toFixed(2));

      totalProductsSoldQuantity += qty;
      totalSalesRevenue = Number((totalSalesRevenue + itemRevenue).toFixed(2));

      const hasValidSnapshot =
        item.hasProfitSnapshot !== false &&
        item.unitProfit !== null &&
        item.unitProfit !== undefined &&
        Number.isFinite(Number(item.unitProfit));

      const snapshotUnitProfit = hasValidSnapshot ? Number(item.unitProfit) : null;
      const itemProfit =
        snapshotUnitProfit !== null
          ? Number((snapshotUnitProfit * qty * adjustmentFactor).toFixed(2))
          : 0;

      if (snapshotUnitProfit !== null) {
        totalProfit = Number((totalProfit + itemProfit).toFixed(2));
      } else {
        orderHasMissingProfit = true;
        itemsWithUnavailableProfit += 1;
      }

      const key = item.name.trim().toLowerCase();
      let entry = productMap.get(key);
      if (!entry) {
        entry = {
          productKey: key,
          productName: item.name.trim(),
          category: item.category,
          totalQuantitySold: 0,
          unitPricesSet: new Set<number>(),
          latestUnitPrice: unitPrice,
          unitProfitsSet: new Set<number>(),
          latestUnitProfit: snapshotUnitProfit,
          hasUnavailableProfitRecords: false,
          unavailableProfitQuantity: 0,
          totalSalesRevenue: 0,
          totalProfit: 0,
          hasAnyValidProfit: false,
        };
        productMap.set(key, entry);
      }

      entry.totalQuantitySold += qty;
      entry.unitPricesSet.add(unitPrice);
      entry.latestUnitPrice = unitPrice;
      entry.totalSalesRevenue = Number((entry.totalSalesRevenue + itemRevenue).toFixed(2));

      if (snapshotUnitProfit !== null) {
        entry.unitProfitsSet.add(snapshotUnitProfit);
        entry.latestUnitProfit = snapshotUnitProfit;
        entry.totalProfit = Number((entry.totalProfit + itemProfit).toFixed(2));
        entry.hasAnyValidProfit = true;
      } else {
        entry.hasUnavailableProfitRecords = true;
        entry.unavailableProfitQuantity += qty;
      }
    }

    if (orderHasMissingProfit) {
      ordersWithUnavailableProfit += 1;
    }
  }

  const products: ProductSalesSummaryRow[] = Array.from(productMap.values())
    .map((entry) => {
      const distinctUnitPrices = Array.from(entry.unitPricesSet);
      const distinctUnitProfits = Array.from(entry.unitProfitsSet);
      return {
        productKey: entry.productKey,
        productName: entry.productName,
        category: entry.category,
        totalQuantitySold: entry.totalQuantitySold,
        unitSellingPrice: entry.latestUnitPrice,
        distinctUnitPrices,
        unitProfit: entry.hasAnyValidProfit ? entry.latestUnitProfit : null,
        distinctUnitProfits,
        hasUnavailableProfitRecords: entry.hasUnavailableProfitRecords,
        unavailableProfitQuantity: entry.unavailableProfitQuantity,
        totalSalesRevenue: entry.totalSalesRevenue,
        totalProfit: entry.hasAnyValidProfit ? entry.totalProfit : null,
      };
    })
    .sort((a, b) => b.totalSalesRevenue - a.totalSalesRevenue);

  return {
    period,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    salesResetAt,
    effectiveStart: new Date(effectiveStartMs).toISOString(),
    summary: {
      completedPaidOrdersCount,
      totalProductsSoldQuantity,
      totalSalesRevenue,
      totalProfit,
      ordersWithUnavailableProfit,
      itemsWithUnavailableProfit,
    },
    products,
  };
}

/**
 * Push Subscription Management
 */
export function savePushSubscription(params: {
  customerId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): PushSubscriptionRecord {
  const db = loadDatabase();
  const nowIso = new Date().toISOString();

  const existing = db.subscriptions.find((s) => s.endpoint === params.endpoint);
  if (existing) {
    existing.customerId = params.customerId.trim();
    existing.keys = params.keys;
    existing.updatedAt = nowIso;
    saveDatabase();
    return existing;
  }

  const record: PushSubscriptionRecord = {
    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    customerId: params.customerId.trim(),
    endpoint: params.endpoint,
    keys: params.keys,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.subscriptions.push(record);
  saveDatabase();
  return record;
}

export function removePushSubscriptionByEndpoint(endpoint: string): boolean {
  const db = loadDatabase();
  const before = db.subscriptions.length;
  db.subscriptions = db.subscriptions.filter((s) => s.endpoint !== endpoint);
  if (db.subscriptions.length !== before) {
    saveDatabase();
    return true;
  }
  return false;
}

export function getCustomerPushSubscriptions(customerId: string): PushSubscriptionRecord[] {
  const db = loadDatabase();
  return db.subscriptions.filter((s) => s.customerId === customerId.trim());
}

/**
 * Exact notification message builder (Requirement 6):
 * Delivery: "Your order (ORDER_CODE) is on the way!"
 * Pickup: "Your order (ORDER_CODE) is finished and you can pick it up now!"
 */
export function buildOrderFinishedNotificationMessage(
  orderCode: string,
  fulfillmentType: FulfillmentType
): string {
  if (fulfillmentType === 'Delivery') {
    return `Your order (${orderCode}) is on the way!`;
  }
  return `Your order (${orderCode}) is finished and you can pick it up now!`;
}

/**
 * Dispatches Web Push Notification for a completed order idempotently.
 */
export async function dispatchOrderCompletionPushNotification(
  order: ChefOrder,
  options?: { forceRetry?: boolean }
): Promise<NotificationEventRecord> {
  const db = loadDatabase();
  const eventId = `notif_finish_${order.orderCode}`;
  let eventRecord = db.notificationEvents.find((e) => e.id === eventId);

  // Idempotency check: prevent duplicate notifications for the same completion event
  if (eventRecord && eventRecord.status === 'sent' && !options?.forceRetry) {
    return eventRecord;
  }

  const exactMessage = buildOrderFinishedNotificationMessage(
    order.orderCode,
    order.fulfillmentType
  );
  const nowIso = new Date().toISOString();

  if (!eventRecord) {
    eventRecord = {
      id: eventId,
      orderId: order.id,
      orderCode: order.orderCode,
      customerId: order.customerId,
      fulfillmentType: order.fulfillmentType,
      message: exactMessage,
      status: 'pending',
      attempts: 0,
      lastAttemptAt: nowIso,
    };
    db.notificationEvents.push(eventRecord);
  }

  eventRecord.attempts += 1;
  eventRecord.lastAttemptAt = nowIso;
  eventRecord.message = exactMessage;

  const subscriptions = getCustomerPushSubscriptions(order.customerId);
  if (subscriptions.length === 0) {
    eventRecord.status = 'no_subscription';
    order.notificationStatus = 'no_subscription';
    order.notificationMessage = exactMessage;
    saveDatabase();
    return eventRecord;
  }

  const vapid = getVapidConfig();
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const payload = JSON.stringify({
    title: 'عباد الرحمن — تحديث حالة الطلب',
    body: exactMessage,
    orderCode: order.orderCode,
    orderId: order.id,
    fulfillmentType: order.fulfillmentType,
    tag: `order-finished-${order.orderCode}`,
    url: `/?myOrders=1&orderCode=${encodeURIComponent(order.orderCode)}`,
  });

  let anySent = false;
  let lastError = '';

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys,
        },
        payload
      );
      anySent = true;
    } catch (err: any) {
      const statusCode = err?.statusCode;
      lastError = err?.message || String(err);
      // Remove permanently invalid or expired subscriptions
      if (statusCode === 404 || statusCode === 410) {
        removePushSubscriptionByEndpoint(sub.endpoint);
      }
    }
  }

  if (anySent) {
    eventRecord.status = 'sent';
    eventRecord.error = undefined;
    order.notificationStatus = 'sent';
    order.notificationMessage = exactMessage;
    order.notificationSentAt = nowIso;
  } else {
    eventRecord.status = 'failed';
    eventRecord.error = lastError || 'Push delivery failed';
    order.notificationStatus = 'failed';
    order.notificationMessage = exactMessage;
  }

  saveDatabase();
  return eventRecord;
}

/**
 * Helper for inserting a legacy/historical order without a profit snapshot (used in tests to verify safe handling of missing historical profit snapshots).
 */
export function insertHistoricalOrderForTesting(order: ChefOrder) {
  const db = loadDatabase();
  db.orders.unshift(order);
  saveDatabase();
}

export function resetDatabaseForTesting() {
  const generatedVapid = webpush.generateVAPIDKeys();
  dbState = {
    nextOrderNumber: 1001,
    orders: [],
    subscriptions: [],
    notificationEvents: [],
    settings: {
      salesResetAt: null,
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || generatedVapid.publicKey,
      vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || generatedVapid.privateKey,
    },
  };
  saveDatabase();
}
