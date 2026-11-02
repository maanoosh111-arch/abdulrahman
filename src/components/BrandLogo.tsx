import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  className?: string;
}

/**
 * Authentic brand logo of "عباد الرحمن — راوتر & ليزر | ورشة CNC"
 * Sourced directly from the official brand logo.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showSubtitle = false,
  className = '',
}) => {
  const dimensions =
    size === 'sm'
      ? 'w-10 h-10'
      : size === 'lg'
      ? 'w-24 h-24 sm:w-28 sm:h-28'
      : 'w-12 h-12';

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <div
        className={`relative flex items-center justify-center shrink-0 rounded-2xl bg-white shadow-xs border border-slate-200/90 p-0.5 overflow-hidden ${dimensions}`}
      >
        <img
          src="/logo.png"
          alt="عباد الرحمن — راوتر & ليزر ورشة CNC"
          className="w-full h-full object-contain drop-shadow-2xs"
          loading="eager"
          onError={(e) => {
            // Fallback if png is unavailable
            const target = e.currentTarget;
            if (target.src.endsWith('/logo.png')) {
              target.src = '/logo.svg';
            }
          }}
        />
      </div>

      {showSubtitle && (
        <div className="flex flex-col text-right">
          <span className="text-xl font-bold tracking-tight text-[#0D447A] leading-tight whitespace-nowrap font-luxury-arabic">
            عباد الرحمن
          </span>
          <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
            راوتر <span className="text-[#E89125] font-bold">&amp;</span> ليزر · ورشة{' '}
            <span className="text-[#E89125] font-bold">CNC</span>
          </span>
        </div>
      )}
    </div>
  );
};
