import React, { useState } from 'react';
import {
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  RefreshCw,
  ShoppingBag,
  Truck,
  X,
} from 'lucide-react';
import { CustomerOrder } from '../types.ts';
import {
  getCurrentPushPermission,
  isPushSupported,
  subscribeCustomerToPush,
} from '../utils/pushNotifications.ts';

interface MyOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: CustomerOrder[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  customerId: string;
  isPushSubscribed: boolean;
  onPushSubscribedChange: (subscribed: boolean) => void;
}

export const MyOrdersModal: React.FC<MyOrdersModalProps> = ({
  isOpen,
  onClose,
  orders,
  loading,
  error,
  onRefresh,
  customerId,
  isPushSubscribed,
  onPushSubscribedChange,
}) => {
  const [pushLoading, setPushLoading] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const pushSupported = isPushSupported();
  const permission = getCurrentPushPermission();

  const handleEnableNotifications = async () => {
    setPushLoading(true);
    setPushFeedback(null);
    const result = await subscribeCustomerToPush(customerId);
    setPushLoading(false);
    if (result.success) {
      onPushSubscribedChange(true);
      setPushFeedback(
        'تم تفعيل الإشعارات الفورية بنجاح! ستصلك رسالة فور انتهاء طلبك (Web Push Enabled).'
      );
    } else {
      setPushFeedback(result.error || 'تعذر تفعيل الإشعارات الفورية.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-orders-title"
    >
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0D447A]/10 text-[#0D447A] flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="my-orders-title"
                className="font-luxury-arabic text-xl font-bold text-slate-900"
              >
                طلباتي · My Orders
              </h2>
              <p className="text-xs text-slate-500">
                متابعة حية ومباشرة لحالة طلباتك لحظة بلحظة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              title="Refresh Orders"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              aria-label="إغلاق نافذة طلباتي"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Web Push Notification Banner */}
        <div className="px-6 py-3.5 bg-[#0D447A]/5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 text-xs text-slate-700">
            {isPushSubscribed && permission === 'granted' ? (
              <>
                <Bell className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  <strong>الإشعارات الفورية مفعلة (Web Push Active):</strong> ستصلك رسالة
                  فورية على جهازك فور اكتمال تحضير طلبك حتى لو كان الموقع مغلقاً.
                </span>
              </>
            ) : !pushSupported ? (
              <>
                <BellOff className="w-4 h-4 text-slate-500 shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  متصفحك الحالي لا يدعم إشعارات الخلفية، لكن يمكنك متابعة حالة طلباتك هنا
                  مباشرة.
                </span>
              </>
            ) : permission === 'denied' ? (
              <>
                <BellOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  تم إيقاف إذن الإشعارات من إعدادات المتصفح. ستستمر حالة الطلب بالتحديث
                  تلقائياً داخل هذه الصفحة.
                </span>
              </>
            ) : (
              <>
                <Bell className="w-4 h-4 text-[#0D447A] shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  فعّل الإشعارات الفورية ليصلك تنبيه فور انتهاء طلبك وجاهزيته للاستلام أو
                  التوصيل.
                </span>
              </>
            )}
          </div>

          {pushSupported && permission !== 'denied' && !isPushSubscribed && (
            <button
              type="button"
              onClick={handleEnableNotifications}
              disabled={pushLoading}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0D447A] hover:bg-[#082D52] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {pushLoading ? 'جاري التفعيل...' : 'تفعيل الإشعارات · Enable Push'}
            </button>
          )}
        </div>

        {pushFeedback && (
          <div className="px-6 py-2.5 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-800">
            {pushFeedback}
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={onRefresh}
                className="px-3 py-1 bg-white border border-red-200 rounded-md font-semibold hover:bg-red-50"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {loading && orders.length === 0 ? (
            <div className="space-y-3 py-8">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="h-32 rounded-xl bg-slate-100 animate-pulse border border-slate-200"
                />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <ShoppingBag className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">
                لا توجد طلبات سابقة حتى الآن · No Orders Yet
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                عند إتمام أي طلب من القائمة، سيظهر هنا فوراً مع كود الطلب وحالته المباشرة.
              </p>
            </div>
          ) : (
            orders.map((order) => {
              const createdDate = new Date(order.createdAt).toLocaleString('ar-EG', {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              });

              const statusColor =
                order.status === 'Finished'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : order.status === 'In Progress'
                  ? 'text-amber-800 bg-amber-50 border-amber-200'
                  : 'text-slate-700 bg-slate-100 border-slate-200';

              const statusAr =
                order.status === 'Finished'
                  ? 'مكتمل · Finished'
                  : order.status === 'In Progress'
                  ? 'قيد التنفيذ · In Progress'
                  : 'قيد الانتظار · Pending';

              return (
                <div
                  key={order.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs transition-all"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className="font-mono-tabular text-sm font-bold text-[#0D447A]">
                        {order.orderCode}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="text-xs text-slate-500 font-mono-tabular">
                        {createdDate}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                        {order.fulfillmentType === 'Delivery' ? (
                          <>
                            <Truck className="w-3.5 h-3.5 text-[#0D447A]" />
                            <span>توصيل · Delivery</span>
                          </>
                        ) : (
                          <>
                            <Package className="w-3.5 h-3.5 text-[#E89125]" />
                            <span>استلام · Pickup</span>
                          </>
                        )}
                      </span>
                    </div>

                    <div
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-bold ${statusColor}`}
                    >
                      {order.status === 'Finished' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                      <span>{statusAr}</span>
                    </div>
                  </div>

                  {/* Completion Status Banner if Finished */}
                  {order.status === 'Finished' && (
                    <div className="mt-3 p-3 rounded-lg bg-emerald-50/80 border border-emerald-200 text-xs font-semibold text-emerald-900">
                      {order.fulfillmentType === 'Delivery'
                        ? `Your order (${order.orderCode}) is on the way!`
                        : `Your order (${order.orderCode}) is finished and you can pick it up now!`}
                    </div>
                  )}

                  {/* Order Items */}
                  <div className="mt-3 divide-y divide-slate-100">
                    {order.items.map((item, idx) => (
                      <div
                        key={`${item.productId}_${idx}`}
                        className="py-2 flex flex-col gap-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono-tabular font-bold text-slate-800">
                              {item.quantity}x
                            </span>
                            <span className="font-semibold text-slate-800">{item.name}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500">{item.category}</span>
                          </div>
                          <span className="font-mono-tabular font-semibold text-slate-900">
                            {(item.price * item.quantity).toFixed(2)} ج.م
                          </span>
                        </div>
                        {item.engravingName && (
                          <div className="text-[11px] text-[#0D447A] bg-[#0D447A]/5 px-2 py-0.5 rounded w-fit">
                            الاسم المطلوب حفره: <strong>{item.engravingName}</strong>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Laser Printing & Engraving Summary */}
                  {(order.engravingName || order.hasLogo || order.designerNotes) && (
                    <div className="mt-2.5 p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs space-y-1">
                      {order.engravingName && (
                        <div className="text-slate-900 font-bold">
                          الاسم المطلوب حفره بالليزر: <span className="font-luxury-arabic text-sm text-[#0D447A]">{order.engravingName}</span>
                        </div>
                      )}
                      {order.hasLogo && (
                        <div className="text-emerald-800 font-semibold text-[11px]">
                          ✓ تم إرفاق لوجو خاص لتنفيذه بماكينة الليزر
                        </div>
                      )}
                      {order.designerNotes && (
                        <div className="text-slate-600 text-[11px] italic">
                          ملاحظاتك للمصمم: {order.designerNotes}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Delivery Info & Total */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="text-slate-500 flex items-center gap-1.5">
                      {order.fulfillmentType === 'Delivery' && order.customerAddress ? (
                        <>
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>العنوان: {order.customerAddress}</span>
                        </>
                      ) : (
                        <span>الاستلام من مقر الورشة / الفرع</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">الإجمالي النهائي:</span>
                      <span className="font-mono-tabular text-sm font-extrabold text-[#0D447A]">
                        {order.total.toFixed(2)} ج.م
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
