import React, { useState } from 'react';
import { ImageOff, PenTool } from 'lucide-react';
import { PublicProduct } from '../types.ts';

interface ProductCardProps {
  product: PublicProduct;
  onSelectProduct: (product: PublicProduct) => void;
  onAddToCart?: (product: PublicProduct, quantity: number) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelectProduct,
}) => {
  const [imgError, setImgError] = useState<boolean>(false);

  const handleOpenCustomize = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectProduct(product);
  };

  return (
    <article
      onClick={() => onSelectProduct(product)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectProduct(product);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${product.name} — ${product.price} ج.م (تخصيص وحفر بالليزر)`}
      className="group bg-white rounded-xl border border-slate-200/90 overflow-hidden flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D447A] cursor-pointer"
    >
      {/* Product Image Area */}
      <div>
        <div className="relative aspect-4/3 w-full bg-[#F4F6F9] border-b border-slate-100 overflow-hidden flex items-center justify-center p-2">
          {product.image && !imgError ? (
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-contain rounded-lg transition-transform duration-200 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
              <ImageOff className="w-8 h-8 mb-1.5 text-[#0D447A]/40" />
              <span className="text-xs font-semibold text-slate-600">
                {product.name}
              </span>
            </div>
          )}
          <div className="absolute top-2 right-2 px-2 py-0.5 bg-white/90 backdrop-blur-xs rounded text-[10px] font-bold text-[#0D447A] shadow-2xs border border-slate-200/60">
            حفر ليزر CNC
          </div>
        </div>

        {/* Text Metadata */}
        <div className="p-4 space-y-1.5">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span>{product.category}</span>
          </div>

          <h3 className="font-luxury-arabic text-lg font-bold text-slate-900 group-hover:text-[#0D447A] transition-colors line-clamp-1">
            {product.name}
          </h3>

          {product.description ? (
            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed min-h-[2.25rem]">
              {product.description}
            </p>
          ) : (
            <p className="text-xs text-slate-400 line-clamp-2 min-h-[2.25rem]">
              طباعة وحفر ليزر على الخشب عالي الدقة — ورشة عباد الرحمن
            </p>
          )}
        </div>
      </div>

      {/* Price & Customize & Order Action */}
      <div className="px-4 pb-4 pt-2 flex items-center justify-between gap-3 border-t border-slate-100">
        <div className="font-mono-tabular text-base font-extrabold text-[#0D447A]">
          {product.price.toFixed(2)}{' '}
          <span className="text-xs font-bold text-slate-600">ج.م</span>
        </div>

        <button
          type="button"
          onClick={handleOpenCustomize}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer bg-[#0D447A] hover:bg-[#082D52] text-white shadow-2xs active:scale-[0.98]"
        >
          <PenTool className="w-3.5 h-3.5 text-[#E89125]" />
          <span>تخصيص وطلب · Customize</span>
        </button>
      </div>
    </article>
  );
};
