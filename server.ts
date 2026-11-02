import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  DEFAULT_SPREADSHEET_ID,
  SECONDARY_SPREADSHEET_ID,
  clearSheetCache,
  fetchProductsFromGoogleSheet,
  getActiveSpreadsheetId,
  setActiveSpreadsheetId,
  stripProfitListForCustomer,
} from './src/lib/googleSheets.ts';
import {
  archiveOrder,
  calculateSalesAndProfitsReport,
  clearAllArchivedOrders,
  createOrder,
  deleteSelectedArchivedOrders,
  deleteSingleArchivedOrder,
  dispatchOrderCompletionPushNotification,
  getActiveChefOrders,
  getArchivedChefOrders,
  getChefOrderById,
  getCustomerOrders,
  getVapidConfig,
  removePushSubscriptionByEndpoint,
  resetSalesAndProfitsBaseline,
  savePushSubscription,
  toCustomerOrder,
  transitionOrderToFinished,
  transitionOrderToInProgress,
} from './src/lib/database.ts';
import { FulfillmentType, InternalProduct, ReportingPeriod } from './src/types.ts';

const CHEF_PIN = process.env.CHEF_ACCESS_PIN || '1234';
const VALID_CHEF_TOKEN = `chef_session_${Buffer.from(`authorized:${CHEF_PIN}`).toString('base64')}`;

export function getAuthorizedChefToken(): string {
  return VALID_CHEF_TOKEN;
}

export async function createAppServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ limit: '25mb', extended: true }));

  const server = http.createServer(app);

  // WebSocket & SSE Real-Time Synchronization
  const wss = new WebSocketServer({ server, path: '/ws' });
  const sseClients = new Set<{
    res: Response;
    role: 'chef' | 'customer';
    customerId?: string;
  }>();

  function broadcastEvent(
    eventType: string,
    payload: Record<string, unknown>,
    targetCustomerId?: string
  ) {
    const messageForChef = JSON.stringify({ type: eventType, payload });
    // Strip any internal fields before sending to customer sockets
    const safeCustomerPayload =
      payload.order && typeof payload.order === 'object'
        ? { ...payload, order: toCustomerOrder(payload.order as any) }
        : payload;
    const messageForCustomer = JSON.stringify({
      type: eventType,
      payload: safeCustomerPayload,
    });

    wss.clients.forEach((client: WebSocket & { role?: string; customerId?: string }) => {
      if (client.readyState !== WebSocket.OPEN) return;
      if (client.role === 'chef') {
        client.send(messageForChef);
      } else if (!targetCustomerId || client.customerId === targetCustomerId) {
        client.send(messageForCustomer);
      }
    });

    sseClients.forEach((client) => {
      try {
        if (client.role === 'chef') {
          client.res.write(`data: ${messageForChef}\n\n`);
        } else if (!targetCustomerId || client.customerId === targetCustomerId) {
          client.res.write(`data: ${messageForCustomer}\n\n`);
        }
      } catch {
        sseClients.delete(client);
      }
    });
  }

  wss.on('connection', (ws: WebSocket & { role?: string; customerId?: string }, req) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const role = url.searchParams.get('role');
      const chefToken = url.searchParams.get('chefToken');
      const customerId = url.searchParams.get('customerId') || undefined;

      if (role === 'chef' && chefToken === VALID_CHEF_TOKEN) {
        ws.role = 'chef';
      } else {
        ws.role = 'customer';
        ws.customerId = customerId;
      }

      ws.send(
        JSON.stringify({
          type: 'connected',
          payload: { role: ws.role, timestamp: new Date().toISOString() },
        })
      );
    } catch {
      ws.role = 'customer';
    }
  });

  // SSE Real-time endpoint fallback
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const roleParam = req.query.role as string;
    const chefToken = (req.query.chefToken as string) || (req.headers['x-chef-token'] as string);
    const customerId =
      (req.query.customerId as string) || (req.headers['x-customer-id'] as string);

    const role: 'chef' | 'customer' =
      roleParam === 'chef' && chefToken === VALID_CHEF_TOKEN ? 'chef' : 'customer';

    const clientObj = { res, role, customerId };
    sseClients.add(clientObj);

    res.write(
      `data: ${JSON.stringify({
        type: 'connected',
        payload: { role, timestamp: new Date().toISOString() },
      })}\n\n`
    );

    req.on('close', () => {
      sseClients.delete(clientObj);
    });
  });

  // Authorization middleware for Chef endpoints
  function requireChefAuth(req: Request, res: Response, next: NextFunction) {
    const headerToken =
      (req.headers['x-chef-token'] as string) ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : '');

    if (!headerToken || headerToken !== VALID_CHEF_TOKEN) {
      res.status(403).json({
        error: 'Unauthorized: Valid Chef authorization is required for this operation.',
      });
      return;
    }
    next();
  }

  // ============================================================================
  // PUBLIC / CUSTOMER ENDPOINTS (Profit data is strictly stripped)
  // ============================================================================

  app.get('/api/products', async (req: Request, res: Response) => {
    try {
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const internalProducts = await fetchProductsFromGoogleSheet({ forceRefresh });
      const publicProducts = stripProfitListForCustomer(internalProducts);
      const categories = Array.from(new Set(publicProducts.map((p) => p.category)));

      res.json({
        products: publicProducts,
        categories,
        sheetId: getActiveSpreadsheetId(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(503).json({
        error: 'Unable to load menu products at this moment. Please try again.',
        details: err?.message || 'Sheet fetch error',
      });
    }
  });

  // Force instant sync with Google Sheets (available to both Customer and Boss)
  app.all('/api/sync-sheet', async (_req: Request, res: Response) => {
    try {
      clearSheetCache();
      const internalProducts = await fetchProductsFromGoogleSheet({ forceRefresh: true });
      const publicProducts = stripProfitListForCustomer(internalProducts);
      const categories = Array.from(new Set(publicProducts.map((p) => p.category)));

      broadcastEvent('catalog:updated', {
        sheetId: getActiveSpreadsheetId(),
        count: publicProducts.length,
      });

      res.json({
        success: true,
        count: publicProducts.length,
        categories,
        sheetId: getActiveSpreadsheetId(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({
        error: 'Failed to sync with Google Sheet',
        details: err?.message || 'Sync error',
      });
    }
  });

  // Create new customer order
  app.post('/api/orders', async (req: Request, res: Response) => {
    try {
      const customerId =
        (req.headers['x-customer-id'] as string) || req.body?.customerId || '';
      const {
        customerName,
        customerPhone,
        customerAddress,
        customerNotes,
        fulfillmentType,
        items,
        deliveryCharge,
        discount,
        engravingName,
        hasLogo,
        logoUrl,
        logoFileName,
        designerNotes,
      } = req.body || {};

      const catalogProducts = await fetchProductsFromGoogleSheet({ forceRefresh: false });
      const createdOrder = createOrder({
        customerId,
        customerName,
        customerPhone,
        customerAddress,
        customerNotes,
        fulfillmentType: fulfillmentType as FulfillmentType,
        requestedItems: items,
        catalogProducts,
        deliveryCharge,
        discount,
        engravingName,
        hasLogo,
        logoUrl,
        logoFileName,
        designerNotes,
      });

      broadcastEvent('order:created', { order: createdOrder }, createdOrder.customerId);

      // Return strictly sanitized customer order without unitProfit
      res.status(201).json({
        order: toCustomerOrder(createdOrder),
      });
    } catch (err: any) {
      res.status(400).json({
        error: err?.message || 'Failed to place order',
      });
    }
  });

  // Get authenticated customer's own order history
  app.get('/api/my-orders', (req: Request, res: Response) => {
    const customerId =
      (req.headers['x-customer-id'] as string) || (req.query.customerId as string) || '';
    if (!customerId.trim()) {
      res.status(401).json({
        error: 'Customer authentication identifier is required to view order history.',
      });
      return;
    }

    const orders = getCustomerOrders(customerId);
    res.json({ orders });
  });

  // Web Push VAPID Public Key
  app.get('/api/push/vapid-public-key', (_req: Request, res: Response) => {
    const vapid = getVapidConfig();
    res.json({ publicKey: vapid.publicKey });
  });

  // Register/Update Customer Web Push Subscription
  app.post('/api/push/subscribe', (req: Request, res: Response) => {
    try {
      const customerId =
        (req.headers['x-customer-id'] as string) || req.body?.customerId || '';
      const subscription = req.body?.subscription;

      if (!customerId || !customerId.trim()) {
        res.status(401).json({ error: 'Customer identity is required for push subscription' });
        return;
      }
      if (
        !subscription ||
        !subscription.endpoint ||
        !subscription.keys?.p256dh ||
        !subscription.keys?.auth
      ) {
        res.status(400).json({ error: 'Valid push subscription object is required' });
        return;
      }

      const saved = savePushSubscription({
        customerId,
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      });

      res.status(201).json({
        subscribed: true,
        subscriptionId: saved.id,
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to save push subscription' });
    }
  });

  app.post('/api/push/unsubscribe', (req: Request, res: Response) => {
    const endpoint = req.body?.endpoint;
    if (!endpoint) {
      res.status(400).json({ error: 'Subscription endpoint is required' });
      return;
    }
    const removed = removePushSubscriptionByEndpoint(endpoint);
    res.json({ unsubscribed: removed });
  });

  // ============================================================================
  // CHEF AUTHENTICATION & AUTHORIZED DASHBOARD ENDPOINTS
  // ============================================================================

  app.post('/api/chef/login', (req: Request, res: Response) => {
    const { pin, role } = req.body || {};
    const inputPin = String(pin || '').trim();
    if (inputPin && inputPin === CHEF_PIN) {
      res.json({
        authorized: true,
        token: VALID_CHEF_TOKEN,
        role: role || 'boss',
      });
      return;
    }
    res.status(403).json({
      authorized: false,
      error: 'رمز الدخول غير صحيح. الدخول مخصص للمدير والمشرفين وطاقم العمل فقط.',
    });
  });

  // Get active and archived orders for the Chef Dashboard
  app.get('/api/chef/orders', requireChefAuth, (_req: Request, res: Response) => {
    const activeOrders = getActiveChefOrders();
    const archivedOrders = getArchivedChefOrders();
    res.json({
      activeOrders,
      archivedOrders,
    });
  });

  // Start Order: Pending -> In Progress
  app.post(
    '/api/chef/orders/:orderId/start',
    requireChefAuth,
    (req: Request, res: Response) => {
      try {
        const updated = transitionOrderToInProgress(req.params.orderId);
        broadcastEvent('order:updated', { order: updated }, updated.customerId);
        res.json({ order: updated });
      } catch (err: any) {
        res.status(400).json({ error: err?.message || 'Failed to start order' });
      }
    }
  );

  // Finish Order: In Progress -> Finished (Captures Profit snapshot & dispatches Web Push)
  app.post(
    '/api/chef/orders/:orderId/finish',
    requireChefAuth,
    async (req: Request, res: Response) => {
      try {
        // Fetch latest Google Sheets catalog so the exact Profit value at the time of sale is captured
        let latestProducts;
        try {
          latestProducts = await fetchProductsFromGoogleSheet({ forceRefresh: true });
        } catch {
          latestProducts = undefined;
        }

        const updated = transitionOrderToFinished(req.params.orderId, latestProducts);
        const notificationEvent = await dispatchOrderCompletionPushNotification(updated);

        const refreshedOrder = getChefOrderById(updated.id) || updated;
        broadcastEvent(
          'order:finished',
          { order: refreshedOrder, notification: notificationEvent },
          refreshedOrder.customerId
        );

        res.json({
          order: refreshedOrder,
          notification: notificationEvent,
        });
      } catch (err: any) {
        res.status(400).json({ error: err?.message || 'Failed to finish order' });
      }
    }
  );

  // Retry Push Notification for a finished order
  app.post(
    '/api/chef/orders/:orderId/retry-notification',
    requireChefAuth,
    async (req: Request, res: Response) => {
      try {
        const order = getChefOrderById(req.params.orderId);
        if (!order) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }
        if (order.status !== 'Finished') {
          res
            .status(400)
            .json({ error: 'Notifications are only sent for Finished orders' });
          return;
        }
        const notificationEvent = await dispatchOrderCompletionPushNotification(order, {
          forceRetry: true,
        });
        const refreshed = getChefOrderById(order.id) || order;
        res.json({ order: refreshed, notification: notificationEvent });
      } catch (err: any) {
        res.status(400).json({ error: err?.message || 'Failed to retry notification' });
      }
    }
  );

  // Archive an active order (moves to Archived Orders tab)
  app.post(
    '/api/chef/orders/:orderId/archive',
    requireChefAuth,
    (req: Request, res: Response) => {
      try {
        const archived = archiveOrder(req.params.orderId);
        broadcastEvent('order:archived', { order: archived }, archived.customerId);
        res.json({ order: archived });
      } catch (err: any) {
        res.status(400).json({ error: err?.message || 'Failed to archive order' });
      }
    }
  );

  // Delete a single archived order permanently from the archive (preserves historical sales records)
  app.delete(
    '/api/chef/archived-orders/:orderId',
    requireChefAuth,
    (req: Request, res: Response) => {
      try {
        const deleted = deleteSingleArchivedOrder(req.params.orderId);
        broadcastEvent('archive:deleted', { orderIds: [deleted.id] });
        res.json({
          deleted: true,
          orderId: deleted.id,
          archivedOrders: getArchivedChefOrders(),
        });
      } catch (err: any) {
        res.status(400).json({ error: err?.message || 'Failed to delete archived order' });
      }
    }
  );

  // Bulk delete selected archived orders
  app.post(
    '/api/chef/archived-orders/bulk-delete',
    requireChefAuth,
    (req: Request, res: Response) => {
      try {
        const orderIds = req.body?.orderIds;
        const result = deleteSelectedArchivedOrders(orderIds);
        broadcastEvent('archive:bulk-deleted', { orderIds: result.deletedIds });
        res.json({
          ...result,
          archivedOrders: getArchivedChefOrders(),
        });
      } catch (err: any) {
        res
          .status(400)
          .json({ error: err?.message || 'Failed to bulk-delete archived orders' });
      }
    }
  );

  // Clear All archived orders (never affects active/non-archived orders; preserves historical sales)
  app.delete(
    '/api/chef/archived-orders',
    requireChefAuth,
    (_req: Request, res: Response) => {
      try {
        const result = clearAllArchivedOrders();
        broadcastEvent('archive:cleared', { deletedCount: result.deletedCount });
        res.json({
          ...result,
          archivedOrders: getArchivedChefOrders(),
        });
      } catch (err: any) {
        res.status(400).json({ error: err?.message || 'Failed to clear archived orders' });
      }
    }
  );

  // Sales & Profits Report Endpoint (Authorized Chef Only)
  app.get('/api/chef/sales-profits', requireChefAuth, async (req: Request, res: Response) => {
    try {
      const rawPeriod = ((req.query.period as string) || 'today').toLowerCase();
      const period: ReportingPeriod =
        rawPeriod === 'week' || rawPeriod === 'month' ? rawPeriod : 'today';

      const report = calculateSalesAndProfitsReport(period);
      let sheetProducts: InternalProduct[] = [];
      try {
        sheetProducts = await fetchProductsFromGoogleSheet({
          forceRefresh: req.query.refresh === '1',
        });
      } catch {
        sheetProducts = [];
      }

      res.json({
        report,
        catalogProductsWithProfit: sheetProducts,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: err?.message || 'Failed to calculate Sales & Profits report' });
    }
  });

  // Reset Sales & Profits Baseline Endpoint (Authorized Chef Only)
  app.post(
    '/api/chef/sales-profits/reset',
    requireChefAuth,
    (req: Request, res: Response) => {
      try {
        const { salesResetAt } = resetSalesAndProfitsBaseline();
        const rawPeriod = ((req.body?.period as string) || 'today').toLowerCase();
        const period: ReportingPeriod =
          rawPeriod === 'week' || rawPeriod === 'month' ? rawPeriod : 'today';

        const updatedReport = calculateSalesAndProfitsReport(period);
        broadcastEvent('sales:reset', { salesResetAt });

        res.json({
          reset: true,
          salesResetAt,
          report: updatedReport,
        });
      } catch (err: any) {
        res
          .status(500)
          .json({ error: err?.message || 'Failed to reset Sales & Profits baseline' });
      }
    }
  );

  // Optional Sheet Switcher for Chef (supports switching between the Arabic CNC sheet and Cafe sheet)
  app.post('/api/chef/sheet-source', requireChefAuth, async (req: Request, res: Response) => {
    try {
      const { sheetId } = req.body || {};
      const target =
        sheetId === 'secondary'
          ? SECONDARY_SPREADSHEET_ID
          : sheetId === 'default'
          ? DEFAULT_SPREADSHEET_ID
          : sheetId;
      if (!target) {
        res.status(400).json({ error: 'Sheet ID is required' });
        return;
      }
      setActiveSpreadsheetId(target);
      const products = await fetchProductsFromGoogleSheet({ forceRefresh: true });
      broadcastEvent('catalog:updated', { sheetId: target, count: products.length });
      res.json({ sheetId: target, productsCount: products.length });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to switch Google Sheet' });
    }
  });

  // Mount Vite dev server or static production assets
  if (process.env.TEST_MODE === 'true') {
    // API-only mode for fast, clean test server lifecycle
  } else if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return { app, server };
}

// Start server when executed directly
const scriptArg = process.argv[1] ? path.basename(process.argv[1]) : '';
const isMainModule =
  Boolean(scriptArg && (scriptArg === 'server.ts' || scriptArg === 'server.js')) ||
  (process.argv[1] ? import.meta.url.endsWith(scriptArg) : false);

if (isMainModule && process.env.VITEST !== 'true' && process.env.TEST_MODE !== 'true') {
  const PORT = Number(process.env.PORT) || 3000;
  createAppServer().then(({ server }) => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on http://0.0.0.0:${PORT}`);
    });
  });
}
