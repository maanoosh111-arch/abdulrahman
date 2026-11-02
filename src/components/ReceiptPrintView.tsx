import React from 'react';
import { ChefOrder } from '../types.ts';

interface ReceiptPrintViewProps {
  order: ChefOrder | null;
}

/**
 * Clean, print-friendly single order receipt and workshop job card.
 * Hidden during normal browsing; exclusively visible during window.print() via @media print CSS.
 */
export const ReceiptPrintView: React.FC<ReceiptPrintViewProps> = ({ order }) => {
  if (!order) return null;

  const formattedDate = new Date(order.createdAt).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const engravingName =
    order.engravingName || order.items.find((i) => i.engravingName)?.engravingName;
  const hasLogo = order.hasLogo || order.items.some((i) => i.hasLogo);
  const designerNotes =
    order.designerNotes || order.items.find((i) => i.designerNotes)?.designerNotes;

  return (
    <div
      id="printable-order-receipt"
      className="hidden print:block bg-white text-black p-4 font-sans text-sm"
      dir="rtl"
    >
      <div className="text-center border-b border-dashed border-black pb-3 mb-3">
        <h1 className="font-luxury-arabic text-xl font-bold">عباد الرحمن — راوتر &amp; ليزر</h1>
        <p className="text-xs">ورشة CNC وماكينة الليزر على الخشب — أمر تشغيل وإيصال طلب</p>
        <p className="text-xs font-mono-tabular mt-1 font-bold">
          Order Code: {order.orderCode}
        </p>
        <p className="text-xs font-mono-tabular">{formattedDate}</p>
      </div>

      <div className="border-b border-dashed border-black pb-3 mb-3 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="font-semibold">نوع الاستلام (Type):</span>
          <span className="font-bold">
            {order.fulfillmentType === 'Delivery'
              ? 'توصيل (Delivery)'
              : 'استلام من الفرع (Pickup)'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="font-semibold">العميل (Customer):</span>
          <span>{order.customerName}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-semibold">الهاتف (Phone):</span>
          <span className="font-mono-tabular">{order.customerPhone}</span>
        </div>
        {order.fulfillmentType === 'Delivery' && order.customerAddress && (
          <div className="pt-1">
            <span className="font-semibold block">العنوان (Address):</span>
            <span>{order.customerAddress}</span>
          </div>
        )}
      </div>

      {/* Laser Wood Machine Engraving Workshop Job Card */}
      <div className="border-b border-dashed border-black pb-3 mb-3 space-y-1.5 text-xs bg-gray-50 p-2 rounded">
        <div className="font-bold border-b border-gray-300 pb-1">
          بيانات حفر وطباعة الليزر للمصمم والورشة (Laser Engraving Job):
        </div>
        <div className="flex justify-between items-center">
          <span className="font-semibold">الاسم المطلوب حفره:</span>
          <strong className="text-sm font-bold font-serif">{engravingName || 'غير محدد'}</strong>
        </div>
        <div className="flex justify-between items-center">
          <span className="font-semibold">طلب لوجو مخصص:</span>
          <span>{hasLogo ? 'نعم (لوجو مرفق بالطلب الإلكتروني)' : 'بدون لوجو (حفر الاسم فقط)'}</span>
        </div>
        {(designerNotes || order.customerNotes) && (
          <div className="pt-1">
            <span className="font-semibold block">ملاحظات للمصمم:</span>
            <span className="text-[11px] block">{designerNotes || order.customerNotes}</span>
          </div>
        )}
      </div>

      <table className="w-full text-xs border-b border-dashed border-black pb-3 mb-3">
        <thead>
          <tr className="border-b border-black text-right">
            <th className="py-1">المنتج (Item)</th>
            <th className="py-1 text-center">الكمية (Qty)</th>
            <th className="py-1 text-left">السعر (Price)</th>
            <th className="py-1 text-left">الإجمالي (Total)</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, idx) => (
            <tr key={`${item.productId}_${idx}`} className="border-b border-dotted border-gray-300">
              <td className="py-1.5 font-medium">
                <div>{item.name}</div>
                {item.engravingName && (
                  <div className="text-[10px] text-gray-600">حفر: {item.engravingName}</div>
                )}
              </td>
              <td className="py-1.5 text-center font-mono-tabular">{item.quantity}</td>
              <td className="py-1.5 text-left font-mono-tabular">
                {item.price.toFixed(2)}
              </td>
              <td className="py-1.5 text-left font-mono-tabular font-semibold">
                {(item.price * item.quantity).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span>المجموع الفرعي (Subtotal):</span>
          <span className="font-mono-tabular">{order.subtotal.toFixed(2)} ج.م</span>
        </div>
        {order.deliveryCharge > 0 && (
          <div className="flex justify-between">
            <span>رسوم التوصيل (Delivery):</span>
            <span className="font-mono-tabular">{order.deliveryCharge.toFixed(2)} ج.م</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm border-t border-black pt-1">
          <span>الإجمالي النهائي (Total):</span>
          <span className="font-mono-tabular">{order.total.toFixed(2)} ج.م</span>
        </div>
      </div>

      <div className="text-center pt-4 text-[10px] text-gray-600">
        شكراً لاختياركم عباد الرحمن — راوتر &amp; ليزر CNC
      </div>
    </div>
  );
};
