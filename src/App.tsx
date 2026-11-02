import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ClipboardList,
  LayoutDashboard,
  Lock,
  Package,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { ChefOrder, CustomerOrder, PublicProduct } from './types.ts';
import { BrandLogo } from './components/BrandLogo.tsx';
import { ProductCard } from './components/ProductCard.tsx';
import { ProductDetailModal } from './components/ProductDetailModal.tsx';
import { CartDrawer, CartItem } from './components/CartDrawer.tsx';
import { MyOrdersModal } from './components/MyOrdersModal.tsx';
import { ChefDashboard } from './components/ChefDashboard.tsx';
import { ReceiptPrintView } from './components/ReceiptPrintView.tsx';
import { syncExistingPushSubscription } from './utils/pushNotifications.ts';

const CUSTOMER_ID_KEY = 'ibad_alrahman_customer_id';
const CART_STORAGE_KEY = 'ibad_alrahman_cart_v1';

function getOrCreateCustomerId(): string {
  if (typeof window === 'undefined') return 'cust_default';
  let existing = localStorage.getItem(CUSTOMER_ID_KEY);
  if (!existing) {
    existing = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(CUSTOMER_ID_KEY, existing);
  }
  return existing;
}

function isBossRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.toLowerCase();
  return (
    path === '/boss' ||
    path.startsWith('/boss/') ||
    path === '/staff' ||
    path.startsWith('/staff/') ||
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path === '/dashboard' ||
    path.startsWith('/dashboard/') ||
    params.get('view') === 'chef' ||
    params.get('view') === 'boss' ||
    params.get('page') === 'boss' ||
    params.get('page') === 'staff' ||
    hash === '#boss' ||
    hash === '#chef'
  );
}

export default function App() {
  const [customerId] = useState<string>(getOrCreateCustomerId);
  const [viewMode, setViewMode] = useState<'customer' | 'chef'>(() => {
    return isBossRoute() ? 'chef' : 'customer';
  });

  // Catalog state from Google Sheets
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [catalogLoading, setCatalogLoading] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Selected product for ProductDetailModal
  const [activeProduct, setActiveProduct] = useState<PublicProduct | null>(null);

  // Shopping Cart state
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);

  // Customer My Orders state
  const [isMyOrdersOpen, setIsMyOrdersOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('myOrders') === '1';
    }
    return false;
  });
  const [myOrders, setMyOrders] = useState<CustomerOrder[]>([]);
  const [myOrdersLoading, setMyOrdersLoading] = useState<boolean>(false);
  const [myOrdersError, setMyOrdersError] = useState<string | null>(null);
  const [isPushSubscribed, setIsPushSubscribed] = useState<boolean>(false);

  // Live Customer Status Toast Notification
  const [liveBannerMessage, setLiveBannerMessage] = useState<string | null>(null);
  const [syncingSheet, setSyncingSheet] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // Selected order for Receipt Printing
  const [printingOrder, setPrintingOrder] = useState<ChefOrder | null>(null);

  // Persist cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // Ignore storage quota errors
    }
  }, [cartItems]);

  // Sync route with browser history (back/forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      setViewMode(isBossRoute() ? 'chef' : 'customer');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToBoss = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/boss');
    }
    setViewMode('chef');
  }, []);

  const navigateToCustomer = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/');
    }
    setViewMode('customer');
  }, []);

  // Fetch dynamic products from Google Sheets via backend
  const fetchCatalog = useCallback(async (forceRefresh = false) => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await fetch(`/api/products${forceRefresh ? '?refresh=1' : ''}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.error ||
            'تعذر تحميل القائمة في الوقت الحالي. يرجى المحاولة مرة أخرى.'
        );
      }
      const data = await res.json();
      const loadedProducts: PublicProduct[] = Array.isArray(data.products)
        ? data.products
        : [];
      const loadedCategories: string[] = Array.isArray(data.categories)
        ? data.categories
        : Array.from(new Set(loadedProducts.map((p) => p.category)));

      setProducts(loadedProducts);
      setCategories(loadedCategories);
    } catch (err: any) {
      setCatalogError(
        err?.message ||
          'تعذر الاتصال بمصدر بيانات القائمة حالياً. يرجى الضغط على إعادة المحاولة.'
      );
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const handleSyncSheet = async () => {
    setSyncingSheet(true);
    try {
      const res = await fetch('/api/sync-sheet');
      if (!res.ok) throw new Error('فشلت المزامنة');
      const data = await res.json();
      await fetchCatalog(true);
      setSyncToast(`تمت مزامنة ${data.count ?? products.length} منتج بنجاح من Google Sheet`);
      window.setTimeout(() => setSyncToast(null), 4000);
    } catch {
      await fetchCatalog(true);
      setSyncToast('تم تحديث القائمة مباشرة من Google Sheet');
      window.setTimeout(() => setSyncToast(null), 4000);
    } finally {
      setSyncingSheet(false);
    }
  };

  useEffect(() => {
    fetchCatalog(false);
    // Periodic background revalidation so Google Sheet changes propagate automatically
    const interval = window.setInterval(() => {
      fetch('/api/products')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.products)) {
            setProducts(data.products);
            setCategories(
              Array.isArray(data.categories)
                ? data.categories
                : Array.from(new Set(data.products.map((p: PublicProduct) => p.category)))
            );
          }
        })
        .catch(() => {});
    }, 25000);

    return () => window.clearInterval(interval);
  }, [fetchCatalog]);

  // Keep selectedCategory valid if a category is removed from Google Sheets
  useEffect(() => {
    if (selectedCategory !== 'ALL' && !categories.includes(selectedCategory)) {
      setSelectedCategory('ALL');
    }
  }, [categories, selectedCategory]);

  // Fetch Customer's Orders from backend
  const fetchMyOrders = useCallback(
    async (silent = false) => {
      if (!silent) {
        setMyOrdersLoading(true);
        setMyOrdersError(null);
      }
      try {
        const res = await fetch(
          `/api/my-orders?customerId=${encodeURIComponent(customerId)}`,
          {
            headers: {
              'x-customer-id': customerId,
            },
          }
        );
        if (!res.ok) {
          throw new Error('تعذر تحميل سجل طلباتك');
        }
        const data = await res.json();
        if (Array.isArray(data.orders)) {
          setMyOrders(data.orders);
        }
      } catch (err: any) {
        if (!silent) {
          setMyOrdersError(err?.message || 'حدث خطأ أثناء تحميل طلباتك');
        }
      } finally {
        if (!silent) {
          setMyOrdersLoading(false);
        }
      }
    },
    [customerId]
  );

  useEffect(() => {
    fetchMyOrders(true);
    syncExistingPushSubscription(customerId).then((subbed) => {
      setIsPushSubscribed(subbed);
    });
  }, [customerId, fetchMyOrders]);

  // Listen to Service Worker postMessage when user clicks a Web Push notification
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICKED') {
        setViewMode('customer');
        setIsMyOrdersOpen(true);
        fetchMyOrders(false);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [fetchMyOrders]);

  // Real-time WebSocket + SSE subscription for Customer Order Updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let sse: EventSource | null = null;

    const handleCustomerEvent = (rawData: string) => {
      try {
        const parsed = JSON.parse(rawData);
        if (
          (parsed.type === 'order:updated' ||
            parsed.type === 'order:finished' ||
            parsed.type === 'order:created') &&
          parsed.payload?.order
        ) {
          const incomingOrder: CustomerOrder = parsed.payload.order;
          if (incomingOrder.customerId !== customerId) return;

          setMyOrders((prev) => {
            const exists = prev.some((o) => o.id === incomingOrder.id);
            if (!exists) return [incomingOrder, ...prev];
            return prev.map((o) => (o.id === incomingOrder.id ? incomingOrder : o));
          });

          if (parsed.type === 'order:finished') {
            const exactNotificationMessage =
              incomingOrder.fulfillmentType === 'Delivery'
                ? `Your order (${incomingOrder.orderCode}) is on the way!`
                : `Your order (${incomingOrder.orderCode}) is finished and you can pick it up now!`;
            setLiveBannerMessage(exactNotificationMessage);
          } else if (
            parsed.type === 'order:updated' &&
            incomingOrder.status === 'In Progress'
          ) {
            setLiveBannerMessage(
              `طلبك (${incomingOrder.orderCode}) قيد التنفيذ الآن (In Progress)!`
            );
          }
        } else if (parsed.type === 'catalog:updated') {
          fetchCatalog(true);
        }
      } catch {
        // Ignore malformed event
      }
    };

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(
        `${protocol}//${window.location.host}/ws?role=customer&customerId=${encodeURIComponent(
          customerId
        )}`
      );
      ws.onmessage = (e) => handleCustomerEvent(e.data);
    } catch {
      // Fallback to SSE
    }

    try {
      sse = new EventSource(
        `/api/events?role=customer&customerId=${encodeURIComponent(customerId)}`
      );
      sse.onmessage = (e) => handleCustomerEvent(e.data);
    } catch {
      // Polling fallback below
    }

    const pollTimer = window.setInterval(() => {
      fetchMyOrders(true);
    }, 8000);

    return () => {
      ws?.close();
      sse?.close();
      window.clearInterval(pollTimer);
    };
  }, [customerId, fetchMyOrders, fetchCatalog]);

  // Cart manipulation handlers
  const handleAddToCart = (
    product: PublicProduct,
    quantity = 1,
    customization?: {
      engravingName: string;
      hasLogo: boolean;
      logoUrl?: string;
      logoFileName?: string;
      designerNotes?: string;
    }
  ) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex(
        (i) =>
          i.product.id === product.id &&
          (i.engravingName || '') === (customization?.engravingName || '') &&
          Boolean(i.hasLogo) === Boolean(customization?.hasLogo)
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        };
        return updated;
      }
      return [
        ...prev,
        {
          product,
          quantity,
          engravingName: customization?.engravingName || '',
          hasLogo: Boolean(customization?.hasLogo),
          logoUrl: customization?.logoUrl,
          logoFileName: customization?.logoFileName,
          designerNotes: customization?.designerNotes,
        },
      ];
    });
    setIsCartOpen(true);
  };

  const handleUpdateCartQuantity = (productId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleRemoveCartItem = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  // Print receipt handler for Chef Dashboard
  const handlePrintOrder = (order: ChefOrder) => {
    setPrintingOrder(order);
    window.setTimeout(() => {
      window.print();
    }, 80);
  };

  // Filtered products by search query and selected category
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === 'ALL' || product.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        product.name.toLowerCase().includes(q) ||
        product.description.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategory, searchQuery]);

  // Group filtered products by dynamic category while preserving Google Sheet category order
  const groupedProducts = useMemo(() => {
    const groups: Array<{ category: string; items: PublicProduct[] }> = [];
    const targetCategories =
      selectedCategory === 'ALL' ? categories : [selectedCategory];

    for (const cat of targetCategories) {
      const items = filteredProducts.filter((p) => p.category === cat);
      if (items.length > 0) {
        groups.push({ category: cat, items });
      }
    }
    return groups;
  }, [categories, selectedCategory, filteredProducts]);

  const totalCartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartAmount = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  if (viewMode === 'chef') {
    return (
      <>
        <ChefDashboard
          onBackToMenu={navigateToCustomer}
          onPrintOrder={handlePrintOrder}
        />
        <ReceiptPrintView order={printingOrder} />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F9] text-[#0F2537]">
      {/* Top Bar following the 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3.5 no-print">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
          {/* Zone 1: Single Brand Wordmark */}
          <a
            href="#top"
            className="text-lg sm:text-xl font-extrabold tracking-tight text-[#0D447A] whitespace-nowrap shrink-0 flex items-center gap-2.5"
          >
            <BrandLogo size="sm" />
            <span className="font-luxury-arabic text-xl sm:text-2xl font-bold">عباد الرحمن</span>
          </a>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          <nav
            className="hidden md:flex items-center gap-5 text-sm font-semibold text-slate-600"
            aria-label="Main Navigation"
          >
            <a
              href="#menu-catalog"
              className="hover:text-[#0D447A] transition-colors whitespace-nowrap shrink-0"
            >
              المنتجات · Menu
            </a>
            <button
              type="button"
              onClick={handleSyncSheet}
              disabled={syncingSheet}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-[#0D447A] bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="مزامنة فورية مع Google Sheet"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingSheet ? 'animate-spin text-[#0D447A]' : ''}`} />
              <span>مزامنة Google Sheet</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMyOrdersOpen(true);
                fetchMyOrders(false);
              }}
              className="hover:text-[#0D447A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              طلباتي · My Orders ({myOrders.length})
            </button>
          </nav>

          {/* Zone 3: My Orders (beside Cart) & Primary Cart CTA */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsMyOrdersOpen(true);
                fetchMyOrders(false);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#0D447A] bg-[#0D447A]/8 hover:bg-[#0D447A]/15 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ClipboardList className="w-4 h-4" />
              <span>طلباتي · My Orders</span>
              {myOrders.length > 0 && (
                <span className="font-mono-tabular">({myOrders.length})</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#0D447A] hover:bg-[#082D52] rounded-lg shadow-2xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 text-[#E89125]" />
              <span>سلة الطلب · Cart</span>
              <span className="font-mono-tabular bg-white/15 px-1.5 py-0.5 rounded text-[11px]">
                {totalCartCount}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Sync Feedback Toast Notification */}
      {syncToast && (
        <div className="bg-[#0D447A] text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between gap-4 max-w-7xl w-full mx-auto mt-2 rounded-xl shadow-md no-print animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#E89125] shrink-0" />
            <span>{syncToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            className="p-1 hover:bg-white/10 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Live Order Status Update Notification Banner */}
      {liveBannerMessage && (
        <div className="bg-emerald-700 text-white px-4 py-3 text-xs font-bold flex items-center justify-between gap-4 max-w-7xl w-full mx-auto mt-3 rounded-xl shadow-sm no-print">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 shrink-0" />
            <span>{liveBannerMessage}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsMyOrdersOpen(true);
                fetchMyOrders(false);
              }}
              className="underline whitespace-nowrap cursor-pointer"
            >
              عرض التفاصيل (My Orders)
            </button>
            <button
              type="button"
              onClick={() => setLiveBannerMessage(null)}
              aria-label="إغلاق التنبيه"
              className="p-1 hover:bg-white/10 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Hero Section inspired by the uploaded Calligraphy Emblem & Marble Aesthetic */}
      <section
        id="top"
        className="relative overflow-hidden border-b border-slate-200/80 bg-gradient-to-b from-white via-[#F8FAFC] to-[#F4F6F9] py-10 sm:py-14 px-4 sm:px-8 no-print"
      >
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4 text-right">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#E89125] bg-[#E89125]/10 px-3 py-1 rounded-full w-fit">
              <Sparkles className="w-3.5 h-3.5" />
              <span>خدمة طباعة وحفر الأسماء والشعارات بماكينة الليزر على الخشب</span>
            </div>
            <h1 className="font-luxury-arabic text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0D447A] leading-tight text-balance tracking-tight">
              حفر وتخصيص الليزر والراوتر CNC على الخشب
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
              اختر أي منتج خشبي من الكتالوج، وسجل الاسم المطلوب حفره بالليزر وارفع لوجو شركتك أو مناسبتك مع ملاحظاتك الفنية للمصمم، لتنفيذ أدق التفاصيل فوراً في ورشة عباد الرحمن.
            </p>

            {/* Search Input Bar */}
            <div className="pt-2 max-w-xl">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث باسم المنتج، الوصف، أو القسم... (Search products)"
                  aria-label="ابحث في القائمة"
                  className="w-full pr-10 pl-10 py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0D447A]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="مسح البحث"
                    className="absolute left-3 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Emblem Showcase Card matching the Reference Image */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="bg-white/90 rounded-2xl border border-slate-200/90 shadow-sm p-8 flex flex-col items-center text-center max-w-sm w-full">
              <BrandLogo size="lg" />
              <h2 className="font-luxury-arabic mt-4 text-3xl font-bold text-[#0D447A]">
                عباد الرحمن
              </h2>
              <p className="text-sm font-bold text-slate-700 mt-1">
                راوتر <span className="text-[#E89125]">&amp;</span> ليزر
              </p>
              <p className="text-xs font-extrabold text-slate-600 mt-0.5">
                ورشة <span className="text-[#E89125]">CNC</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Dynamic Category Navigation Bar */}
      <div
        id="menu-catalog"
        className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3 no-print"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div
            className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5"
            role="tablist"
            aria-label="أقسام المنتجات"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === 'ALL'}
              onClick={() => setSelectedCategory('ALL')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'bg-[#0D447A] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
              }`}
            >
              جميع الأقسام · All ({products.length})
            </button>

            {categories.map((category) => {
              const count = products.filter((p) => p.category === category).length;
              if (count === 0) return null;
              const isSelected = selectedCategory === category;

              return (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-[#0D447A] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
                  }`}
                >
                  {category} ({count})
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleSyncSheet}
            disabled={syncingSheet}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-[#0D447A] bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="مزامنة فورية من Google Sheets"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${syncingSheet ? 'animate-spin text-[#0D447A]' : ''}`}
            />
            <span>مزامنة الشيت</span>
          </button>
        </div>
      </div>

      {/* Main Product Grid Section */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-8 flex-1 no-print">
        {catalogError && products.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center max-w-lg mx-auto my-8 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900">
              تعذر تحميل القائمة حالياً
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">{catalogError}</p>
            <button
              type="button"
              onClick={() => fetchCatalog(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0D447A] hover:bg-[#082D52] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة المحاولة · Retry</span>
            </button>
          </div>
        ) : catalogLoading && products.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden animate-pulse"
              >
                <div className="aspect-4/3 bg-slate-200/70" />
                <div className="p-4 space-y-3">
                  <div className="h-3 w-24 bg-slate-200 rounded" />
                  <div className="h-4 w-48 bg-slate-200 rounded" />
                  <div className="h-3 w-full bg-slate-100 rounded" />
                  <div className="pt-2 flex justify-between items-center">
                    <div className="h-5 w-20 bg-slate-200 rounded" />
                    <div className="h-8 w-28 bg-slate-200 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto my-8 space-y-3">
            <Package className="w-10 h-10 text-slate-400 mx-auto" />
            <h2 className="text-base font-bold text-slate-800">
              لا توجد منتجات متاحة في القائمة حالياً
            </h2>
            <p className="text-xs text-slate-500">
              بمجرد إضافة منتجات في جدول Google Sheets ستظهر هنا تلقائياً.
            </p>
          </div>
        ) : groupedProducts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto my-8 space-y-3">
            <Search className="w-10 h-10 text-slate-400 mx-auto" />
            <h2 className="text-base font-bold text-slate-800">
              لا توجد نتائج مطابقة لبحثك "{searchQuery}"
            </h2>
            <p className="text-xs text-slate-500">
              جرب البحث بكلمات أخرى أو استعرض جميع الأقسام المتاحة.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('ALL');
              }}
              className="mt-2 inline-flex items-center px-4 py-2 text-xs font-bold text-[#0D447A] bg-[#0D447A]/10 rounded-xl hover:bg-[#0D447A]/15 transition-colors cursor-pointer"
            >
              عرض جميع المنتجات · Reset Filters
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {groupedProducts.map((group) => (
              <section key={group.category} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <h2 className="font-luxury-arabic text-2xl sm:text-3xl font-bold text-[#0D447A]">
                    {group.category}
                  </h2>
                  <span className="text-xs text-slate-500 font-mono-tabular">
                    {group.items.length} منتج
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {group.items.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onSelectProduct={(p) => setActiveProduct(p)}
                      onAddToCart={handleAddToCart}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Mobile Floating Bottom Cart Bar (respecting <= 15% mobile sticky cap) */}
      {totalCartCount > 0 && !isCartOpen && (
        <div className="sm:hidden fixed bottom-3 inset-x-4 z-30 no-print">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="w-full py-3 px-4 bg-[#0D447A] text-white rounded-xl shadow-lg flex items-center justify-between text-xs font-bold cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="bg-[#E89125] text-white font-mono-tabular px-2 py-0.5 rounded-md">
                {totalCartCount}
              </span>
              <span>عرض سلة الطلب · View Order</span>
            </div>
            <span className="font-mono-tabular text-sm font-extrabold">
              {totalCartAmount.toFixed(2)} ج.م
            </span>
          </button>
        </div>
      )}

      {/* Clean Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 px-4 sm:px-8 text-xs text-slate-500 no-print">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#0D447A]">عباد الرحمن</span>
            <span>·</span>
            <span>راوتر &amp; ليزر · ورشة CNC</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setIsMyOrdersOpen(true);
                fetchMyOrders(false);
              }}
              className="hover:text-[#0D447A] transition-colors cursor-pointer"
            >
              طلباتي (My Orders)
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => setViewMode('chef')}
              className="hover:text-[#0D447A] transition-colors cursor-pointer"
            >
              لوحة تحكم المدير (Boss Dashboard)
            </button>
          </div>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <ProductDetailModal
        product={activeProduct}
        onClose={() => setActiveProduct(null)}
        onAddToCart={handleAddToCart}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        customerId={customerId}
        onOrderCreated={(newOrder) => {
          setMyOrders((prev) => [newOrder, ...prev]);
        }}
      />

      <MyOrdersModal
        isOpen={isMyOrdersOpen}
        onClose={() => setIsMyOrdersOpen(false)}
        orders={myOrders}
        loading={myOrdersLoading}
        error={myOrdersError}
        onRefresh={() => fetchMyOrders(false)}
        customerId={customerId}
        isPushSubscribed={isPushSubscribed}
        onPushSubscribedChange={setIsPushSubscribed}
      />

      <ReceiptPrintView order={printingOrder} />
    </div>
  );
}
