import React, { useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Image as ImageIcon,
  Minus,
  Package,
  PenTool,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { CustomerOrder, FulfillmentType, PublicProduct } from '../types.ts';

export interface CartItem {
  product: PublicProduct;
  quantity: number;
  engravingName?: string;
  hasLogo?: boolean;
  logoUrl?: string;
  logoFileName?: string;
  designerNotes?: string;
}

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  customerId: string;
  onOrderCreated: (order: CustomerOrder) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  customerId,
  onOrderCreated,
}) => {
  const [customerName, setCustomerName] = useState<string>(
    () => localStorage.getItem('ibad_customer_name') || ''
  );
  const [customerPhone, setCustomerPhone] = useState<string>(
    () => localStorage.getItem('ibad_customer_phone') || ''
  );
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('Delivery');
  const [customerAddress, setCustomerAddress] = useState<string>(
    () => localStorage.getItem('ibad_customer_address') || ''
  );
  const [customerNotes, setCustomerNotes] = useState<string>('');

  // 3 Laser Printing Sections for Wood Machine
  const [engravingName, setEngravingName] = useState<string>('');
  const [hasLogo, setHasLogo] = useState<boolean>(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState<string>('');
  const [designerNotes, setDesignerNotes] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<CustomerOrder | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const engravingInputRef = useRef<HTMLInputElement>(null);

  // Sync state from items if items already had customization set from the detail modal
  useEffect(() => {
    if (items.length > 0) {
      const firstWithCustom = items.find((i) => i.engravingName);
      if (firstWithCustom) {
        if (!engravingName) setEngravingName(firstWithCustom.engravingName || '');
        if (firstWithCustom.hasLogo !== undefined) setHasLogo(Boolean(firstWithCustom.hasLogo));
        if (firstWithCustom.logoUrl && !logoUrl) setLogoUrl(firstWithCustom.logoUrl);
        if (firstWithCustom.logoFileName && !logoFileName) setLogoFileName(firstWithCustom.logoFileName);
        if (firstWithCustom.designerNotes && !designerNotes) setDesignerNotes(firstWithCustom.designerNotes);
      }
    }
  }, [items]);

  if (!isOpen) return null;

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const deliveryCharge = fulfillmentType === 'Delivery' && items.length > 0 ? 0 : 0;
  const finalTotal = subtotal + deliveryCharge;

  // Handle Logo Upload via File Reader
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSubmitError('يرجى اختيار ملف صورة صالح للوجو (PNG, JPG, SVG, WEBP)');
      return;
    }

    setLogoFileName(file.name);
    setSubmitError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        if (file.size > 3 * 1024 * 1024) {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 1200;
            let width = img.width;
            let height = img.height;
            if (width > height && width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            setLogoUrl(canvas.toDataURL('image/png', 0.88));
          };
          img.src = result;
        } else {
          setLogoUrl(result);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
    setLogoFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0 || submitting) return;

    setSubmitError(null);

    // Section 1: Name to be printed validation
    const finalEngraving = (engravingName || items[0]?.engravingName || '').trim();
    if (!finalEngraving) {
      setSubmitError('يرجى كتابة الاسم المراد حفره/طباعته بالليزر على المنتج (Name is required).');
      engravingInputRef.current?.focus();
      return;
    }

    if (!customerName.trim()) {
      setSubmitError('يرجى إدخال اسم العميل (Customer name is required)');
      return;
    }
    if (!customerPhone.trim()) {
      setSubmitError('يرجى إدخال رقم الهاتف (Phone number is required)');
      return;
    }
    if (fulfillmentType === 'Delivery' && !customerAddress.trim()) {
      setSubmitError('يرجى إدخال عنوان التوصيل (Delivery address is required)');
      return;
    }

    setSubmitting(true);
    try {
      localStorage.setItem('ibad_customer_name', customerName.trim());
      localStorage.setItem('ibad_customer_phone', customerPhone.trim());
      if (customerAddress.trim()) {
        localStorage.setItem('ibad_customer_address', customerAddress.trim());
      }

      const effectiveHasLogo = Boolean(hasLogo || items.some((i) => i.hasLogo));
      const effectiveLogoUrl = hasLogo && logoUrl ? logoUrl : items.find((i) => i.logoUrl)?.logoUrl;
      const effectiveLogoFileName = hasLogo && logoFileName ? logoFileName : items.find((i) => i.logoFileName)?.logoFileName;
      const effectiveDesignerNotes = designerNotes.trim() || items.find((i) => i.designerNotes)?.designerNotes || '';

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-customer-id': customerId,
        },
        body: JSON.stringify({
          customerId,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerAddress:
            fulfillmentType === 'Delivery' ? customerAddress.trim() : '',
          customerNotes: customerNotes.trim(),
          fulfillmentType,
          engravingName: finalEngraving,
          hasLogo: effectiveHasLogo,
          logoUrl: effectiveLogoUrl || undefined,
          logoFileName: effectiveLogoFileName || undefined,
          designerNotes: effectiveDesignerNotes || undefined,
          items: items.map((i) => ({
            productId: i.product.id,
            name: i.product.name,
            quantity: i.quantity,
            engravingName: i.engravingName || finalEngraving,
            hasLogo: i.hasLogo ?? effectiveHasLogo,
            logoUrl: i.logoUrl || effectiveLogoUrl,
            logoFileName: i.logoFileName || effectiveLogoFileName,
            designerNotes: i.designerNotes || effectiveDesignerNotes,
          })),
          deliveryCharge,
          discount: 0,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.order) {
        throw new Error(data.error || 'تعذر إرسال الطلب، يرجى المحاولة مرة أخرى.');
      }

      setConfirmedOrder(data.order);
      onClearCart();
      onOrderCreated(data.order);
    } catch (err: any) {
      setSubmitError(err?.message || 'حدث خطأ أثناء تأكيد الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg h-full shadow-2xl border-r border-slate-200 flex flex-col justify-between overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0D447A] text-white flex items-center justify-center shadow-xs">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="cart-drawer-title"
                className="font-luxury-arabic text-lg font-bold text-slate-900"
              >
                سلة طلبات الليزر · Your Order ({totalQuantity})
              </h2>
              <p className="text-[11px] text-slate-500">
                حفر وطباعة على الخشب بماكينة الليزر والراوتر CNC
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {items.length > 0 && !confirmedOrder && (
              <button
                type="button"
                onClick={onClearCart}
                className="px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                إفراغ السلة
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setConfirmedOrder(null);
                onClose();
              }}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              aria-label="إغلاق السلة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {confirmedOrder ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200 shadow-xs">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <h3 className="font-luxury-arabic text-xl font-extrabold text-slate-900">
                  تم استلام طلب الحفر بنجاح!
                </h3>
                <p className="text-xs text-slate-600">
                  كود الطلب الخاص بك:{' '}
                  <strong className="font-mono-tabular text-[#0D447A] text-sm">
                    {confirmedOrder.orderCode}
                  </strong>
                </p>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 text-right space-y-1 mt-3">
                  <div className="font-bold text-[#0D447A] flex items-center gap-1.5">
                    <PenTool className="w-3.5 h-3.5 text-[#E89125]" />
                    <span>الاسم المحفور: {confirmedOrder.engravingName || 'تم التسجيل'}</span>
                  </div>
                  {confirmedOrder.hasLogo && (
                    <div className="text-emerald-700 font-semibold flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>تم إرفاق اللوجو المطلوب للمصمم</span>
                    </div>
                  )}
                  {confirmedOrder.designerNotes && (
                    <div className="text-slate-600 italic">
                      ملاحظات للمصمم: {confirmedOrder.designerNotes}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 pt-2">
                  وصلت بياناتك كاملة إلى لوحة المدير والمصمم (Boss Dashboard) للبدء في تنفيذ الحفر على ماكينة الليزر فوراً.
                </p>
              </div>
              <div className="pt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmedOrder(null);
                    onClose();
                  }}
                  className="w-full py-2.5 px-4 bg-[#0D447A] hover:bg-[#082D52] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  متابعة التصفح · Continue Browsing
                </button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <ShoppingBag className="w-7 h-7" />
              </div>
              <h3 className="font-luxury-arabic text-base font-bold text-slate-800">
                سلة الطلبات فارغة حالياً · Cart is Empty
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                تصفح المنتجات الخشبية وأضف ما يناسبك لتخصيص الاسم واللوجو قبل الطلب.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 inline-flex items-center justify-center px-4 py-2 text-xs font-bold text-[#0D447A] bg-[#0D447A]/10 hover:bg-[#0D447A]/15 rounded-xl transition-colors cursor-pointer"
              >
                متابعة التصفح · Continue Browsing
              </button>
            </div>
          ) : (
            <>
              {/* Cart Items List */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>المنتجات المطلوبة ({items.length})</span>
                  <span className="text-[11px] text-slate-400">راجع التخصيص</span>
                </div>
                {items.map((item) => (
                  <div
                    key={item.product.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col gap-2.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-slate-900 truncate">
                          {item.product.name}
                        </h4>
                        <div className="text-xs text-slate-500 font-mono-tabular mt-0.5">
                          {item.product.price.toFixed(2)} ج.م × {item.quantity} ={' '}
                          <strong className="text-[#0D447A]">
                            {(item.product.price * item.quantity).toFixed(2)} ج.م
                          </strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.product.id, -1)}
                          className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                          aria-label={`Decrease quantity of ${item.product.name}`}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 text-center font-mono-tabular text-xs font-bold">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.product.id, 1)}
                          className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                          aria-label={`Increase quantity of ${item.product.name}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.product.id)}
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer"
                          aria-label={`Remove ${item.product.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Customization Badges if provided */}
                    {(item.engravingName || item.hasLogo) && (
                      <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-2 text-[11px]">
                        {item.engravingName && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0D447A]/10 text-[#0D447A] font-bold">
                            <PenTool className="w-3 h-3 text-[#E89125]" />
                            <span>الاسم المحفور: {item.engravingName}</span>
                          </span>
                        )}
                        {item.hasLogo && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200/60">
                            <ImageIcon className="w-3 h-3 text-emerald-600" />
                            <span>لوجو مخصص مرفق</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Checkout Form */}
              <form
                id="checkout-order-form"
                onSubmit={handleCheckoutSubmit}
                className="space-y-4 pt-4 border-t border-slate-200"
              >
                {submitError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* ===============================================================
                    THE 3 REQUIRED WOOD LASER MACHINE CUSTOMIZATION SECTIONS
                    =============================================================== */}
                <div className="p-4 bg-[#FAFBFD] rounded-xl border border-[#0D447A]/20 space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                    <Sparkles className="w-4 h-4 text-[#E89125]" />
                    <h4 className="font-luxury-arabic text-sm font-bold text-slate-900">
                      تأكيد بيانات حفر وطباعة الليزر على الخشب
                    </h4>
                  </div>

                  {/* SECTION 1: Name to be printed on product */}
                  <div>
                    <label
                      htmlFor="drawer-engraving-name"
                      className="block text-xs font-bold text-slate-800 mb-1"
                    >
                      1. الاسم المطلوب كتابته/حفره بالليزر على المنتج *
                    </label>
                    <input
                      ref={engravingInputRef}
                      id="drawer-engraving-name"
                      type="text"
                      required
                      value={engravingName}
                      onChange={(e) => setEngravingName(e.target.value)}
                      placeholder="اكتب الاسم المطلوب حفره على الخشب (مثال: عائلة المهندس أحمد)"
                      className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D447A]"
                    />
                  </div>

                  {/* SECTION 2: Logo section with Yes/No toggle button and upload */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-800">
                      2. اللوجو المطلوب طباعته/حفره (إذا وُجد)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setHasLogo(false);
                          handleRemoveLogo();
                        }}
                        className={`py-1.5 px-2.5 rounded-lg border text-xs font-bold flex items-center justify-center transition-colors cursor-pointer ${
                          !hasLogo
                            ? 'bg-white border-slate-400 text-slate-800 font-extrabold shadow-2xs'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        بدون لوجو (الاسم فقط)
                      </button>

                      <button
                        type="button"
                        onClick={() => setHasLogo(true)}
                        className={`py-1.5 px-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                          hasLogo
                            ? 'bg-[#0D447A] border-[#0D447A] text-white'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        <Upload className="w-3 h-3" />
                        <span>نعم، أريد إضافة لوجو</span>
                      </button>
                    </div>

                    {hasLogo && (
                      <div className="p-3 bg-white rounded-xl border border-dashed border-[#0D447A]/30 space-y-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,.png,.jpg,.jpeg,.svg,.webp"
                          onChange={handleLogoFileChange}
                          className="hidden"
                          id="drawer-logo-file-input"
                        />

                        {!logoUrl ? (
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className="flex flex-col items-center justify-center py-3 px-2 border border-slate-200 rounded-lg bg-slate-50 hover:bg-[#0D447A]/5 transition-colors cursor-pointer text-center"
                          >
                            <Upload className="w-4 h-4 text-[#0D447A] mb-1" />
                            <span className="text-[11px] font-bold text-slate-800">
                              اضغط هنا لرفع ملف اللوجو
                            </span>
                            <span className="text-[10px] text-slate-400">
                              PNG, JPG, SVG
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200 gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <img
                                src={logoUrl}
                                alt="Logo thumbnail"
                                className="w-8 h-8 object-contain rounded bg-white border border-slate-200 p-0.5 shrink-0"
                              />
                              <span className="text-xs font-bold text-slate-800 truncate">
                                {logoFileName || 'تم رفع اللوجو'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-2 py-1 text-[10px] font-bold text-[#0D447A] bg-[#0D447A]/10 rounded cursor-pointer"
                              >
                                تغيير
                              </button>
                              <button
                                type="button"
                                onClick={handleRemoveLogo}
                                className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* SECTION 3: Notes for the designer */}
                  <div>
                    <label
                      htmlFor="drawer-designer-notes"
                      className="block text-xs font-bold text-slate-800 mb-1"
                    >
                      3. ملاحظات إضافية للمصمم (اختياري)
                    </label>
                    <textarea
                      id="drawer-designer-notes"
                      rows={2}
                      value={designerNotes}
                      onChange={(e) => setDesignerNotes(e.target.value)}
                      placeholder="أي تفاصيل خاصة ترغب بإبلاغ المصمم بها (مثل موضع الحفر، حجم اللوجو)..."
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D447A]"
                    />
                  </div>
                </div>

                {/* Customer Contact & Delivery Info */}
                <h3 className="text-sm font-extrabold text-slate-900 pt-2">
                  بيانات العميل والاستلام · Contact &amp; Delivery
                </h3>

                {/* Fulfillment Type Selector: Delivery vs Pickup */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    طريقة الاستلام (Fulfillment Type)
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setFulfillmentType('Delivery')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                        fulfillmentType === 'Delivery'
                          ? 'bg-[#0D447A] text-white border-[#0D447A]'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Truck className="w-4 h-4" />
                      <span>توصيل · Delivery</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFulfillmentType('Pickup')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                        fulfillmentType === 'Pickup'
                          ? 'bg-[#0D447A] text-white border-[#0D447A]'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Package className="w-4 h-4" />
                      <span>استلام · Pickup</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="customer-name"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    اسم العميل (Name) *
                  </label>
                  <input
                    id="customer-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="أدخل اسمك الكريم"
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D447A]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="customer-phone"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    رقم الهاتف (Phone) *
                  </label>
                  <input
                    id="customer-phone"
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="010XXXXXXXX"
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D447A] font-mono-tabular"
                  />
                </div>

                {fulfillmentType === 'Delivery' && (
                  <div>
                    <label
                      htmlFor="customer-address"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      عنوان التوصيل بالتفصيل (Delivery Address) *
                    </label>
                    <input
                      id="customer-address"
                      type="text"
                      required
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="المدينة، الشارع، رقم العقار"
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D447A]"
                    />
                  </div>
                )}
              </form>
            </>
          )}
        </div>

        {/* Footer Totals & Submit CTA */}
        {items.length > 0 && !confirmedOrder && (
          <div className="p-6 border-t border-slate-200 bg-slate-50 space-y-3 shrink-0">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>إجمالي عدد الوحدات (Total Qty):</span>
                <span className="font-mono-tabular font-bold">{totalQuantity}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي (Subtotal):</span>
                <span className="font-mono-tabular font-bold">
                  {subtotal.toFixed(2)} ج.م
                </span>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-[#0D447A] pt-1 border-t border-slate-200">
                <span>الإجمالي النهائي (Total):</span>
                <span className="font-mono-tabular">{finalTotal.toFixed(2)} ج.م</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                متابعة التصفح
              </button>
              <button
                type="submit"
                form="checkout-order-form"
                disabled={submitting}
                className="flex-1 py-2.5 px-4 bg-[#0D447A] hover:bg-[#082D52] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting
                  ? 'جاري تأكيد الطلب وإرسال البيانات...'
                  : 'تأكيد وإرسال طلب الحفر · Place Order'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
