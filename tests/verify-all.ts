import assert from 'node:assert/strict';
import { createAppServer, getAuthorizedChefToken } from '../server.ts';
import {
  clearProductProfitOverrides,
  fetchProductsFromGoogleSheet,
  normalizeProductRows,
  setProductProfitOverride,
} from '../src/lib/googleSheets.ts';
import {
  getChefOrderById,
  insertHistoricalOrderForTesting,
  resetDatabaseForTesting,
} from '../src/lib/database.ts';

process.env.TEST_MODE = 'true';

async function runVerificationSuite() {
  console.log('=== Starting Comprehensive Automated Verification Suite ===\n');

  // Reset database to a clean state before testing, and restore clean state at the end
  resetDatabaseForTesting();
  clearProductProfitOverrides();

  const { server } = await createAppServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test server');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const chefToken = getAuthorizedChefToken();

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Live Google Sheets Integration & Header-Based Column Mapping
    // -------------------------------------------------------------------------
    console.log('1. Testing live Google Sheets fetch & header-based Price/Profit mapping...');
    const sheetProducts = await fetchProductsFromGoogleSheet({ forceRefresh: true });
    assert.ok(sheetProducts.length > 0, 'Should load real products from Google Sheet');

    const firstProd = sheetProducts[0];
    assert.ok(firstProd.category.length > 0, 'Product category should exist');
    assert.ok(firstProd.name.length > 0, 'Product name should exist');
    assert.equal(typeof firstProd.price, 'number', 'Price should be a parsed number');
    assert.equal(typeof firstProd.profit, 'number', 'Profit should be a parsed number');
    assert.ok(
      firstProd.image.startsWith('https://res.cloudinary.com/'),
      'Image URL should be the exact Cloudinary URL from the sheet'
    );

    // Also test header mapping when column order varies or values are numeric strings
    const customNormalized = normalizeProductRows(
      ['Category', 'Product Name', 'Price', 'Profit', 'Description', 'Image URL'],
      [
        ['Test Cat', 'Numeric String Item', '150.50', '45.25', 'Desc', 'https://res.cloudinary.com/demo/image/upload/sample.jpg'],
        ['Test Cat', '', '100', '20', 'Missing name should be skipped', ''],
      ]
    );
    assert.equal(customNormalized.length, 1, 'Malformed row must be skipped without breaking valid products');
    assert.equal(customNormalized[0].price, 150.5);
    assert.equal(customNormalized[0].profit, 45.25);
    console.log('   ✓ Passed: Live Google Sheets data & header mapping verified.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Profit Data Protection from Customer APIs & Unauthorized Access
    // -------------------------------------------------------------------------
    console.log('2. Testing strict protection of Profit data from customer endpoints...');
    const publicProdRes = await fetch(`${baseUrl}/api/products`);
    assert.equal(publicProdRes.status, 200);
    const publicProdData = await publicProdRes.json();
    assert.ok(Array.isArray(publicProdData.products) && publicProdData.products.length > 0);
    for (const p of publicProdData.products) {
      assert.equal(
        'profit' in p,
        false,
        'Public /api/products response MUST NOT contain profit field'
      );
    }

    // Verify unauthorized access to Chef endpoints is rejected with 403
    const unauthSalesRes = await fetch(`${baseUrl}/api/chef/sales-profits?period=today`);
    assert.equal(unauthSalesRes.status, 403, 'Unauthorized customer request to /api/chef/sales-profits must return 403');
    console.log('   ✓ Passed: Profit is strictly stripped from customer payloads and protected by Chef auth.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Order Creation, Lifecycle, Exact Push Messages & Customer Isolation
    // -------------------------------------------------------------------------
    console.log('3. Testing Order Creation, Lifecycle (Pending -> In Progress -> Finished), Push Messages & Isolation...');
    const targetProduct = sheetProducts[0]; // e.g., هدية فرح (Price 95, Profit 40)

    // Set Profit = 10 for the first sale to verify historical snapshot preservation
    setProductProfitOverride(targetProduct.name, 10);

    // Customer A places a Delivery order
    const order1Res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-customer-id': 'customer_alpha',
      },
      body: JSON.stringify({
        customerName: 'أحمد محمد',
        customerPhone: '01011112222',
        customerAddress: 'شارع التحرير، الدقي',
        fulfillmentType: 'Delivery',
        items: [{ productId: targetProduct.id, name: targetProduct.name, quantity: 1 }],
      }),
    });
    assert.equal(order1Res.status, 201);
    const { order: order1CustomerView } = await order1Res.json();
    assert.equal(order1CustomerView.orderCode, 'ORD-1001');
    assert.equal(order1CustomerView.status, 'Pending');
    assert.equal(
      'unitProfit' in order1CustomerView.items[0],
      false,
      'Customer order response must not expose unitProfit'
    );

    // Customer B places a Pickup order after business owner updates Profit in Google Sheets from 10 -> 20
    setProductProfitOverride(targetProduct.name, 20);
    const order2Res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-customer-id': 'customer_beta',
      },
      body: JSON.stringify({
        customerName: 'سارة علي',
        customerPhone: '01033334444',
        fulfillmentType: 'Pickup',
        items: [{ productId: targetProduct.id, name: targetProduct.name, quantity: 2 }],
      }),
    });
    assert.equal(order2Res.status, 201);
    const { order: order2CustomerView } = await order2Res.json();
    assert.equal(order2CustomerView.orderCode, 'ORD-1002');

    // Verify Customer A can only see ORD-1001 and NOT Customer B's ORD-1002
    const custAOrdersRes = await fetch(`${baseUrl}/api/my-orders`, {
      headers: { 'x-customer-id': 'customer_alpha' },
    });
    const custAOrdersData = await custAOrdersRes.json();
    assert.equal(custAOrdersData.orders.length, 1);
    assert.equal(custAOrdersData.orders[0].orderCode, 'ORD-1001');

    // Verify invalid status transition (Pending -> Finished directly must fail)
    const invalidFinishRes = await fetch(
      `${baseUrl}/api/chef/orders/${order1CustomerView.id}/finish`,
      {
        method: 'POST',
        headers: { 'x-chef-token': chefToken },
      }
    );
    assert.equal(invalidFinishRes.status, 400, 'Cannot finish an order that is still Pending');

    // Chef starts ORD-1001 (Pending -> In Progress)
    const start1Res = await fetch(
      `${baseUrl}/api/chef/orders/${order1CustomerView.id}/start`,
      {
        method: 'POST',
        headers: { 'x-chef-token': chefToken },
      }
    );
    assert.equal(start1Res.status, 200);
    const start1Data = await start1Res.json();
    assert.equal(start1Data.order.status, 'In Progress');

    // Chef finishes ORD-1001 while Profit is set to 10
    setProductProfitOverride(targetProduct.name, 10);
    const finish1Res = await fetch(
      `${baseUrl}/api/chef/orders/${order1CustomerView.id}/finish`,
      {
        method: 'POST',
        headers: { 'x-chef-token': chefToken },
      }
    );
    assert.equal(finish1Res.status, 200);
    const finish1Data = await finish1Res.json();
    assert.equal(finish1Data.order.status, 'Finished');
    assert.equal(
      finish1Data.notification.message,
      'Your order (ORD-1001) is on the way!',
      'Delivery notification message must match exact specification'
    );

    // Now business owner changes Profit of targetProduct in Google Sheets to 20!
    setProductProfitOverride(targetProduct.name, 20);

    // Chef starts & finishes ORD-1002 (Pickup order, qty 2, at Profit = 20)
    await fetch(`${baseUrl}/api/chef/orders/${order2CustomerView.id}/start`, {
      method: 'POST',
      headers: { 'x-chef-token': chefToken },
    });
    const finish2Res = await fetch(
      `${baseUrl}/api/chef/orders/${order2CustomerView.id}/finish`,
      {
        method: 'POST',
        headers: { 'x-chef-token': chefToken },
      }
    );
    assert.equal(finish2Res.status, 200);
    const finish2Data = await finish2Res.json();
    assert.equal(finish2Data.order.status, 'Finished');
    assert.equal(
      finish2Data.notification.message,
      'Your order (ORD-1002) is finished and you can pick it up now!',
      'Pickup notification message must match exact specification'
    );
    console.log('   ✓ Passed: Lifecycle transitions, customer isolation, and exact push messages verified.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Historical Profit Snapshot Preservation & Sales & Profits Calculation
    // -------------------------------------------------------------------------
    console.log('4. Testing Historical Profit Snapshots (Sale 1 @ Profit=10, Sale 2 @ Profit=20)...');
    // Even if Google Sheets profit is now changed to 999, historical sales must retain 10 and 20!
    setProductProfitOverride(targetProduct.name, 999);

    const savedOrder1 = getChefOrderById('ORD-1001');
    const savedOrder2 = getChefOrderById('ORD-1002');
    assert.equal(savedOrder1?.items[0].unitProfit, 10, 'First sale must retain unitProfit = 10');
    assert.equal(savedOrder2?.items[0].unitProfit, 20, 'Second sale must retain unitProfit = 20');

    // Check Today, This Week, and This Month reports
    for (const period of ['today', 'week', 'month'] as const) {
      const reportRes = await fetch(
        `${baseUrl}/api/chef/sales-profits?period=${period}`,
        {
          headers: { 'x-chef-token': chefToken },
        }
      );
      assert.equal(reportRes.status, 200);
      const { report } = await reportRes.json();

      // 2 completed orders: ORD-1001 (qty 1, profit 10) + ORD-1002 (qty 2, profit 20/unit = 40)
      // Total quantity = 3, Total revenue = 3 * price, Total profit = 10 + 40 = 50!
      assert.equal(report.summary.completedPaidOrdersCount, 2);
      assert.equal(report.summary.totalProductsSoldQuantity, 3);
      assert.equal(report.summary.totalSalesRevenue, targetProduct.price * 3);
      assert.equal(
        report.summary.totalProfit,
        50,
        `Period ${period} must combine historical profits (1*10 + 2*20 = 50), not use current sheet profit`
      );

      const prodRow = report.products.find(
        (r: any) => r.productName === targetProduct.name
      );
      assert.ok(prodRow, 'Product row must exist in detailed sales table');
      assert.equal(prodRow.totalQuantitySold, 3);
      assert.equal(prodRow.totalProfit, 50);
      assert.deepEqual(prodRow.distinctUnitProfits, [10, 20]);
    }

    // Verify handling of a legacy historical order without a saved profit snapshot
    insertHistoricalOrderForTesting({
      id: 'legacy_order_no_profit',
      orderCode: 'ORD-0999',
      customerId: 'cust_legacy',
      customerName: 'عميل سابق',
      customerPhone: '01000000000',
      customerAddress: '',
      customerNotes: '',
      fulfillmentType: 'Pickup',
      status: 'Finished',
      items: [
        {
          productId: targetProduct.id,
          name: targetProduct.name,
          category: targetProduct.category,
          price: targetProduct.price,
          quantity: 1,
          unitProfit: null,
          hasProfitSnapshot: false,
        },
      ],
      subtotal: targetProduct.price,
      deliveryCharge: 0,
      discount: 0,
      refundAmount: 0,
      total: targetProduct.price,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      isPaid: true,
      isArchived: false,
      archivedAt: null,
      archiveDeleted: false,
      archiveDeletedAt: null,
    });

    const reportWithLegacyRes = await fetch(
      `${baseUrl}/api/chef/sales-profits?period=today`,
      {
        headers: { 'x-chef-token': chefToken },
      }
    );
    const { report: reportWithLegacy } = await reportWithLegacyRes.json();
    assert.equal(
      reportWithLegacy.summary.itemsWithUnavailableProfit,
      1,
      'Legacy order without profit snapshot must be flagged as unavailable profit'
    );
    assert.equal(
      reportWithLegacy.summary.totalProfit,
      50,
      'Unknown historical profit must be excluded from verified totalProfit rather than assuming current sheet profit'
    );
    console.log('   ✓ Passed: Historical Profit snapshots and unavailable-snapshot handling verified.\n');

    // -------------------------------------------------------------------------
    // TEST 5: Archived Orders Management (Single Delete, Bulk Delete, Clear All)
    //         & Preservation of Historical Sales Reports
    // -------------------------------------------------------------------------
    console.log('5. Testing Archived Orders (Single, Bulk, Clear All) & Sales Preservation...');
    clearProductProfitOverrides();

    // Create 2 more orders (ORD-1003, ORD-1004) to test bulk delete & clear all, plus 1 active order (ORD-1005)
    for (let i = 0; i < 3; i++) {
      await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-customer-id': `cust_archive_${i}`,
        },
        body: JSON.stringify({
          customerName: `عميل ${i}`,
          customerPhone: '01099998888',
          fulfillmentType: 'Pickup',
          items: [{ productId: targetProduct.id, name: targetProduct.name, quantity: 1 }],
        }),
      });
    }

    // Archive ORD-1001, ORD-1002, ORD-1003, ORD-1004 (leaving ORD-1005 and ORD-0999 active)
    for (const code of ['ORD-1001', 'ORD-1002', 'ORD-1003', 'ORD-1004']) {
      const archRes = await fetch(`${baseUrl}/api/chef/orders/${code}/archive`, {
        method: 'POST',
        headers: { 'x-chef-token': chefToken },
      });
      assert.equal(archRes.status, 200);
    }

    // 5A. Individual deletion of ORD-1001 from archive
    const singleDelRes = await fetch(
      `${baseUrl}/api/chef/archived-orders/ORD-1001`,
      {
        method: 'DELETE',
        headers: { 'x-chef-token': chefToken },
      }
    );
    assert.equal(singleDelRes.status, 200);
    const singleDelData = await singleDelRes.json();
    assert.equal(singleDelData.archivedOrders.length, 3, '3 archived orders should remain after deleting 1');

    // 5B. Bulk deletion of ORD-1002 and ORD-1003 from archive
    const bulkDelRes = await fetch(
      `${baseUrl}/api/chef/archived-orders/bulk-delete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chef-token': chefToken,
        },
        body: JSON.stringify({ orderIds: ['ORD-1002', 'ORD-1003'] }),
      }
    );
    assert.equal(bulkDelRes.status, 200);
    const bulkDelData = await bulkDelRes.json();
    assert.equal(bulkDelData.deletedCount, 2);
    assert.equal(bulkDelData.archivedOrders.length, 1, 'Only ORD-1004 should remain in archive');

    // 5C. Clear All archived orders
    const clearAllRes = await fetch(`${baseUrl}/api/chef/archived-orders`, {
      method: 'DELETE',
      headers: { 'x-chef-token': chefToken },
    });
    assert.equal(clearAllRes.status, 200);
    const clearAllData = await clearAllRes.json();
    assert.equal(clearAllData.deletedCount, 1);
    assert.equal(clearAllData.archivedOrders.length, 0, 'Archive must be empty after Clear All');

    // Verify active order ORD-1005 was NOT affected by Clear All!
    const chefOrdersAfterClearRes = await fetch(`${baseUrl}/api/chef/orders`, {
      headers: { 'x-chef-token': chefToken },
    });
    const chefOrdersAfterClear = await chefOrdersAfterClearRes.json();
    assert.ok(
      chefOrdersAfterClear.activeOrders.some((o: any) => o.orderCode === 'ORD-1005'),
      'Active order ORD-1005 must never be affected by Clear All archived orders'
    );

    // Verify historical Sales & Profits report is NOT corrupted after deleting archived orders!
    const reportAfterArchiveDelRes = await fetch(
      `${baseUrl}/api/chef/sales-profits?period=today`,
      {
        headers: { 'x-chef-token': chefToken },
      }
    );
    const { report: reportAfterArchiveDel } = await reportAfterArchiveDelRes.json();
    assert.equal(
      reportAfterArchiveDel.summary.totalProfit,
      50,
      'Deleting archived orders must NOT erase historical sales or corrupt profit reports'
    );
    console.log('   ✓ Passed: Individual, Bulk, and Clear All archived order deletions preserve active orders and historical sales.\n');

    // -------------------------------------------------------------------------
    // TEST 6: Reset Sales & Profits Baseline & Post-Reset Sale Tracking
    // -------------------------------------------------------------------------
    console.log('6. Testing Reset Sales & Profits baseline and new post-reset sales...');
    await new Promise((r) => setTimeout(r, 25));

    const resetRes = await fetch(`${baseUrl}/api/chef/sales-profits/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chef-token': chefToken,
      },
      body: JSON.stringify({ period: 'today' }),
    });
    assert.equal(resetRes.status, 200);
    const resetData = await resetRes.json();
    assert.ok(resetData.salesResetAt, 'salesResetAt timestamp must be returned and persisted');
    assert.equal(
      resetData.report.summary.completedPaidOrdersCount,
      0,
      'Sales completed before reset baseline must be excluded'
    );
    assert.equal(resetData.report.summary.totalSalesRevenue, 0);
    assert.equal(resetData.report.summary.totalProfit, 0);

    // Complete a new sale (ORD-1005) AFTER the reset point and verify it is counted properly
    await new Promise((r) => setTimeout(r, 25));
    await fetch(`${baseUrl}/api/chef/orders/ORD-1005/start`, {
      method: 'POST',
      headers: { 'x-chef-token': chefToken },
    });
    await fetch(`${baseUrl}/api/chef/orders/ORD-1005/finish`, {
      method: 'POST',
      headers: { 'x-chef-token': chefToken },
    });

    for (const period of ['today', 'week', 'month'] as const) {
      const postResetReportRes = await fetch(
        `${baseUrl}/api/chef/sales-profits?period=${period}`,
        {
          headers: { 'x-chef-token': chefToken },
        }
      );
      const { report: postResetReport } = await postResetReportRes.json();
      assert.equal(
        postResetReport.summary.completedPaidOrdersCount,
        1,
        `Post-reset report (${period}) should count only the 1 new completed sale`
      );
      assert.equal(postResetReport.summary.totalProductsSoldQuantity, 1);
      assert.equal(postResetReport.summary.totalSalesRevenue, targetProduct.price);
      assert.equal(postResetReport.summary.totalProfit, targetProduct.profit);
    }

    // Verify original historical orders still retain their original Profit snapshots in the database
    const preservedOrder1 = getChefOrderById('ORD-1001');
    assert.equal(
      preservedOrder1?.items[0].unitProfit,
      10,
      'Resetting reports must not erase historical Profit snapshots on previous orders'
    );
    console.log('   ✓ Passed: Reset Sales & Profits baseline verified.\n');

    // -------------------------------------------------------------------------
    // TEST 7: Laser Wood Engraving Customization (Name, Logo, Designer Notes) & Boss Dashboard
    // -------------------------------------------------------------------------
    console.log('7. Testing Laser Wood Machine Customization (Name, Logo upload, Notes for Designer) & Boss Dashboard visibility...');
    const laserOrderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-customer-id': 'cust_laser_test_999',
      },
      body: JSON.stringify({
        customerId: 'cust_laser_test_999',
        customerName: 'مهندس أحمد عبد الرحمن',
        customerPhone: '01012345678',
        customerAddress: 'القاهرة، المعادي، شارع 9',
        fulfillmentType: 'Delivery',
        engravingName: 'عائلة الألفي — نور & كريم',
        hasLogo: true,
        logoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        logoFileName: 'al-alfy-crest-logo.png',
        designerNotes: 'يرجى حفر اللوجو في الزاوية العلوية اليمنى بخط رقعة أنيق وواضح',
        items: [
          {
            productId: targetProduct.id,
            name: targetProduct.name,
            quantity: 2,
            engravingName: 'عائلة الألفي — نور & كريم',
            hasLogo: true,
            logoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            logoFileName: 'al-alfy-crest-logo.png',
            designerNotes: 'يرجى حفر اللوجو في الزاوية العلوية اليمنى بخط رقعة أنيق وواضح',
          },
        ],
      }),
    });

    assert.equal(laserOrderRes.status, 201, 'Should create customized laser order');
    const { order: createdLaserOrder } = await laserOrderRes.json();
    assert.equal(createdLaserOrder.engravingName, 'عائلة الألفي — نور & كريم');
    assert.equal(createdLaserOrder.hasLogo, true);
    assert.ok(createdLaserOrder.logoUrl?.startsWith('data:image/png;base64,'));
    assert.equal(createdLaserOrder.logoFileName, 'al-alfy-crest-logo.png');
    assert.equal(createdLaserOrder.designerNotes, 'يرجى حفر اللوجو في الزاوية العلوية اليمنى بخط رقعة أنيق وواضح');
    assert.equal(createdLaserOrder.items[0].engravingName, 'عائلة الألفي — نور & كريم');

    // Fetch from Boss Dashboard and verify designer visibility
    const bossOrdersRes = await fetch(`${baseUrl}/api/chef/orders`, {
      headers: { 'x-chef-token': chefToken },
    });
    const { activeOrders: bossActiveOrders } = await bossOrdersRes.json();
    const bossOrder = bossActiveOrders.find((o: any) => o.orderCode === createdLaserOrder.orderCode);
    assert.ok(bossOrder, 'Customized laser order must be visible in Boss Dashboard for designer');
    assert.equal(bossOrder.engravingName, 'عائلة الألفي — نور & كريم', 'Boss Dashboard must show laser engraving name');
    assert.equal(bossOrder.hasLogo, true, 'Boss Dashboard must show customer requested logo');
    assert.equal(bossOrder.logoFileName, 'al-alfy-crest-logo.png', 'Boss Dashboard must show logo file name');
    assert.ok(bossOrder.logoUrl?.length > 0, 'Boss Dashboard must provide uploaded logo URL for downloading');
    assert.equal(bossOrder.designerNotes, 'يرجى حفر اللوجو في الزاوية العلوية اليمنى بخط رقعة أنيق وواضح', 'Boss Dashboard must show notes for the designer');
    console.log('   ✓ Passed: Laser Wood customization & Boss Dashboard designer visibility verified.\n');

    // Clean up test records so the production application starts with a clean database
    resetDatabaseForTesting();
    clearProductProfitOverrides();

    console.log('=== ALL AUTOMATED VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    server.close();
  }
}

runVerificationSuite().catch((err) => {
  console.error('Verification suite failed:', err);
  process.exit(1);
});
