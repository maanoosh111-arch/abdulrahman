export interface PublicProduct {
  id: string;
  category: string;
  name: string;
  price: number;
  description: string;
  image: string;
}

/**
 * Internal server-side product model that includes the private Profit field from Google Sheets.
 * This must NEVER be sent to customer-facing endpoints or public API responses.
 */
export interface InternalProduct extends PublicProduct {
  profit: number | null;
}

export type OrderStatus = 'Pending' | 'In Progress' | 'Finished';
export type FulfillmentType = 'Delivery' | 'Pickup';

export interface CustomerOrderItem {
  productId: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  image?: string;
  /** Name to be laser printed / engraved on the wood product */
  engravingName?: string;
  /** Whether the customer wants to include a custom logo */
  hasLogo?: boolean;
  /** Uploaded logo data URL or image path */
  logoUrl?: string;
  /** Original file name of the uploaded logo */
  logoFileName?: string;
  /** Specific instructions or notes for the designer */
  designerNotes?: string;
}

/**
 * Internal order item stored in the database and visible only to authorized Chef Dashboard endpoints.
 * Captures the historical unitProfit snapshot at the time of sale completion.
 */
export interface InternalOrderItem extends CustomerOrderItem {
  /**
   * Historical Profit per unit captured from Google Sheets at the time the sale is completed.
   * Null if historical profit was unavailable when the sale was recorded.
   */
  unitProfit: number | null;
  /**
   * Indicates whether a valid Profit snapshot was recorded at the time of sale.
   */
  hasProfitSnapshot: boolean;
}

export interface CustomerInfo {
  customerId: string;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
}

export interface CustomerOrder {
  id: string;
  orderCode: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerNotes: string;
  fulfillmentType: FulfillmentType;
  status: OrderStatus;
  items: CustomerOrderItem[];
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  refundAmount: number;
  total: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  isPaid: boolean;
  /** Name to be laser printed / engraved on the wood machine */
  engravingName?: string;
  /** Whether a custom logo is requested for laser printing */
  hasLogo?: boolean;
  /** Uploaded logo data URL or image path */
  logoUrl?: string;
  /** Original file name of the uploaded logo */
  logoFileName?: string;
  /** Specific instructions or notes for the designer */
  designerNotes?: string;
}

export interface ChefOrder extends Omit<CustomerOrder, 'items'> {
  items: InternalOrderItem[];
  isArchived: boolean;
  archivedAt: string | null;
  archiveDeleted: boolean;
  archiveDeletedAt: string | null;
  notificationStatus?: 'none' | 'sent' | 'failed' | 'no_subscription';
  notificationMessage?: string;
  notificationSentAt?: string | null;
}

export type ReportingPeriod = 'today' | 'week' | 'month';

export interface ProductSalesSummaryRow {
  productKey: string;
  productName: string;
  category: string;
  totalQuantitySold: number;
  /**
   * Actual historical unit selling price(s). If sold at multiple prices, represents the latest or weighted price,
   * accompanied by distinctUnitPrices for full transparency.
   */
  unitSellingPrice: number;
  distinctUnitPrices: number[];
  /**
   * Actual historical unit profit snapshot(s). Null if unavailable.
   */
  unitProfit: number | null;
  distinctUnitProfits: number[];
  hasUnavailableProfitRecords: boolean;
  unavailableProfitQuantity: number;
  totalSalesRevenue: number;
  totalProfit: number | null;
}

export interface SalesAndProfitsReport {
  period: ReportingPeriod;
  periodStart: string;
  periodEnd: string;
  salesResetAt: string | null;
  effectiveStart: string;
  summary: {
    completedPaidOrdersCount: number;
    totalProductsSoldQuantity: number;
    totalSalesRevenue: number;
    totalProfit: number;
    ordersWithUnavailableProfit: number;
    itemsWithUnavailableProfit: number;
  };
  products: ProductSalesSummaryRow[];
}

export interface NotificationEventRecord {
  id: string;
  orderId: string;
  orderCode: string;
  customerId: string;
  fulfillmentType: FulfillmentType;
  message: string;
  status: 'pending' | 'sent' | 'failed' | 'no_subscription';
  attempts: number;
  lastAttemptAt: string;
  error?: string;
}
