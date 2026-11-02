import React, { useState, useRef } from 'react';
import {
  AlertCircle,
  Check,
  FileText,
  Image as ImageIcon,
  ImageOff,
  Minus,
  PenTool,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { PublicProduct } from '../types.ts';

export interface LaserCustomizationData {
  engravingName: string;
  hasLogo: boolean;
  logoUrl?: string;
  logoFileName?: string;
  designerNotes?: string;
}

interface ProductDetailModalProps {
  product: PublicProduct | null;
  onClose: () => void;
  onAddToCart: (
    product: PublicProduct,
    quantity: number,
    customization?: LaserCustomizationData
  ) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
}) => {
  const [quantity, setQuantity] = useState<number>(1);
  const [imgError, setImgError] = useState<boolean>(false);

  // 3 Laser Wood Printing Customization Sections
  const [engravingName, setEngravingName] = useState<string>('');
  const [hasLogo, setHasLogo] = useState<boolean>(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState<string>('');
  const [designerNotes, setDesignerNotes] = useState<string>('');

  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  if (!product) return null;

  // Handle Logo Upload via File Reader
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setValidationError('يرجى اختيار ملف صورة صالح (PNG, JPG, SVG, WEBP)');
      return;
    }

    setLogoFileName(file.name);
    setValidationError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        // Optional client-side image compression if image is gigantic (> 3MB)
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

  const handleAdd = () => {
    setValidationError(null);

    // Section 1 Validation: Name is required before buying
    const trimmedName = engravingName.trim();
    if (!trimmedName) {
      setValidationError('يرجى إدخال الاسم المطلوب حفره بالليزر على المنتج للمتابعة.');
      nameInputRef.current?.focus();
      return;
    }

    onAddToCart(product, quantity, {
      engravingName: trimmedName,
      hasLogo,
      logoUrl: hasLogo && logoUrl ? logoUrl : undefined,
      logoFileName: hasLogo && logoFileName ? logoFileName : undefined,
      designerNotes: designerNotes.trim() || undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 no-print overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-detail-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-[#0D447A]">{product.category}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="flex items-center gap-1 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-[#E89125]" />
              خدمة حفر وطباعة الليزر على الخشب
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="إغلاق تفاصيل المنتج"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto p-6 space-y-6">
          {/* Top Grid: Image + Core Product Info */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Large Product Image */}
            <div className="md:col-span-5 relative aspect-square w-full rounded-xl bg-[#F4F6F9] border border-slate-200 overflow-hidden flex items-center justify-center p-3">
              {product.image && !imgError ? (
                <img
                  src={product.image}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-contain rounded-lg"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                  <ImageOff className="w-10 h-10 mb-2 text-[#0D447A]/40" />
                  <span className="text-xs font-semibold text-slate-600">
                    {product.name}
                  </span>
                </div>
              )}
              <div className="absolute bottom-2 right-2 px-2.5 py-1 bg-white/90 backdrop-blur-xs rounded-md border border-slate-200/80 text-[10px] font-bold text-[#0D447A] shadow-2xs">
                خشب طبيعي · ليزر CNC
              </div>
            </div>

            {/* Product Meta */}
            <div className="md:col-span-7 space-y-3">
              <div className="text-xs font-bold text-[#E89125] uppercase tracking-wider">
                {product.category}
              </div>
              <h2
                id="product-detail-title"
                className="font-luxury-arabic text-2xl sm:text-3xl font-bold text-slate-900 leading-snug"
              >
                {product.name}
              </h2>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-[#0D447A] font-mono-tabular">
                  {product.price.toFixed(2)}
                </span>
                <span className="text-sm font-bold text-slate-600">ج.م (EGP)</span>
              </div>
              {product.description ? (
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {product.description}
                </p>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  منتج خشبي عالي الجودة مصمم خصيصاً للحفر بماكينة الليزر والراوتر CNC لدى ورشة عباد الرحمن.
                </p>
              )}
            </div>
          </div>

          {/* =========================================================================
              THE 3 MANDATORY LASER CUSTOMIZATION SECTIONS FOR WOOD PRINTING
              ========================================================================= */}
          <div className="bg-[#FAFBFD] rounded-2xl border-2 border-[#0D447A]/15 p-5 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#0D447A] text-white flex items-center justify-center">
                  <PenTool className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-luxury-arabic text-base font-bold text-slate-900">
                    بيانات حفر وطباعة الليزر على الخشب
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    يرجى تعبئة بيانات التخصيص حتى يبدأ المصمم والورشة بالعمل على طلبك
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-[#0D447A] bg-[#0D447A]/10 px-2.5 py-1 rounded-md">
                تخصيص فوري
              </span>
            </div>

            {/* Validation Error Banner */}
            {validationError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            {/* SECTION 1: The Name to be Printed on the Product */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="laser-engraving-name"
                  className="text-xs font-bold text-slate-800 flex items-center gap-1.5"
                >
                  <span className="w-5 h-5 rounded-full bg-[#0D447A] text-white text-[11px] flex items-center justify-center font-bold">
                    1
                  </span>
                  <span>الاسم المطلوب كتابته / حفره بالليزر على المنتج *</span>
                </label>
                <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                  مطلوب للتنفيذ
                </span>
              </div>
              <input
                ref={nameInputRef}
                id="laser-engraving-name"
                type="text"
                required
                value={engravingName}
                onChange={(e) => {
                  setEngravingName(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder="اكتب الاسم المطلوب حفره (مثال: عائلة المهندس أحمد، نور & كريم، د. محمود...)"
                className="w-full px-4 py-2.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-[#0D447A] focus:border-[#0D447A] transition-all"
              />
              <p className="text-[11px] text-slate-500">
                سيتم تنفيذ الاسم بدقة فائقة على ماكينة الليزر بأجمل الخطوط العربية المناسبة للتصميم.
              </p>
            </div>

            {/* SECTION 2: Upload Logo Section (With Button Toggle) */}
            <div className="space-y-2.5 pt-2 border-t border-slate-200/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#0D447A] text-white text-[11px] flex items-center justify-center font-bold">
                    2
                  </span>
                  <span>اللوجو المطلوب طباعته/حفره على المنتج (إذا وُجد)</span>
                </label>
                <span className="text-[10px] font-semibold text-slate-500">
                  حسب الرغبة
                </span>
              </div>

              {/* Yes / No Button Toggle */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setHasLogo(false);
                    handleRemoveLogo();
                  }}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    !hasLogo
                      ? 'bg-white border-slate-400 text-slate-800 shadow-2xs font-extrabold ring-1 ring-slate-300'
                      : 'bg-slate-100/70 border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <span>بدون لوجو (حفر الاسم فقط)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setHasLogo(true);
                  }}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    hasLogo
                      ? 'bg-[#0D447A] border-[#0D447A] text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-[#0D447A]/50'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>نعم، أريد إضافة لوجو خاص · Add Logo</span>
                </button>
              </div>

              {/* Logo File Upload Box (Shown when hasLogo === true) */}
              {hasLogo && (
                <div className="p-3.5 bg-white rounded-xl border border-dashed border-[#0D447A]/40 space-y-3 transition-all animate-fadeIn">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.png,.jpg,.jpeg,.svg,.webp"
                    onChange={handleLogoFileChange}
                    className="hidden"
                    id="laser-logo-file-input"
                  />

                  {!logoUrl ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center justify-center py-5 px-3 border border-slate-200 rounded-lg bg-slate-50/60 hover:bg-[#0D447A]/5 hover:border-[#0D447A] transition-colors cursor-pointer text-center group"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#0D447A]/10 text-[#0D447A] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div className="text-xs font-bold text-slate-800">
                        اضغط هنا لاختيار ملف اللوجو أو الشعار
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        صيغ مدعومة: PNG, JPG, SVG, WEBP (يفضل خلفية شفافة أو عالية الوضوح)
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center p-1 shrink-0">
                          <img
                            src={logoUrl}
                            alt="Uploaded customer logo preview"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">
                            {logoFileName || 'تم رفع اللوجو بنجاح'}
                          </div>
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold mt-0.5">
                            <Check className="w-3 h-3 text-emerald-600" />
                            جاهز للإرسال للمصمم
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1.5 text-[11px] font-bold text-[#0D447A] bg-[#0D447A]/10 hover:bg-[#0D447A]/15 rounded-md transition-colors cursor-pointer"
                        >
                          تغيير الملف
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                          title="حذف اللوجو"
                          aria-label="حذف اللوجو"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SECTION 3: Optional Notes for the Designer */}
            <div className="space-y-1.5 pt-2 border-t border-slate-200/80">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="designer-notes"
                  className="text-xs font-bold text-slate-800 flex items-center gap-1.5"
                >
                  <span className="w-5 h-5 rounded-full bg-[#0D447A] text-white text-[11px] flex items-center justify-center font-bold">
                    3
                  </span>
                  <span>ملاحظات للمصمم (Notes for the Designer)</span>
                </label>
                <span className="text-[10px] font-semibold text-slate-400">
                  اختياري · Optional
                </span>
              </div>
              <textarea
                id="designer-notes"
                rows={2}
                value={designerNotes}
                onChange={(e) => setDesignerNotes(e.target.value)}
                placeholder="أخبر المصمم بأي تفاصيل تفضلها (مثل: موضع اللوجو، نوع الخط العربي المفضل، أبعاد الحفر، أو أي رغبة خاصة)..."
                className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D447A] focus:border-[#0D447A] transition-all"
              />
            </div>
          </div>

          {/* Bottom Actions: Quantity + Add To Order */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-700">
                الكمية المطلوبة (Quantity):
              </span>
              <div className="inline-flex items-center gap-3 bg-white rounded-lg p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-7 h-7 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="تقليل الكمية"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center font-mono-tabular font-bold text-sm text-slate-900">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-7 h-7 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="زيادة الكمية"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAdd}
              className="w-full py-3.5 px-5 bg-[#0D447A] hover:bg-[#082D52] text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>
                أضف إلى الطلب · Add to Order ({(product.price * quantity).toFixed(2)}{' '}
                ج.م)
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
