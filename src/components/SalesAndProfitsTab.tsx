import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  DollarSign,
  Package,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import {
  InternalProduct,
  ReportingPeriod,
  SalesAndProfitsReport,
} from '../types.ts';

interface SalesAndProfitsTabProps {
  chefToken: string;
  refreshSignal: number;
}

export const SalesAndProfitsTab: React.FC<SalesAndProfitsTabProps> = ({
  chefToken,
  refreshSignal,
}) => {
  const [period, setPeriod] = useState<ReportingPeriod>('today');
  const [report, setReport] = useState<SalesAndProfitsReport | null>(null);
  const [catalogWithProfit, setCatalogWithProfit] = useState<InternalProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState<boolean>(false);
  const [resetLoading, setResetLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fetchReport = useCallback(
    async (selectedPeriod: ReportingPeriod, forceSheetRefresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/chef/sales-profits?period=${selectedPeriod}${
            forceSheetRefresh ? '&refresh=1' : ''
          }`,
          {
            headers: {
              'x-chef-token': chefToken,
            },
          }
        );

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            errData.error || 'فشل تحميل تقرير المبيعات والأرباح (Failed to load report)'
          );
        }

        const data = await res.json();
        setReport(data.report);
        setCatalogWithProfit(
          Array.isArray(data.catalogProductsWithProfit)
            ? data.catalogProductsWithProfit
            : []
        );
      } catch (err: any) {
        setError(err?.message || 'حدث خطأ أثناء حساب المبيعات والأرباح');
      } finally {
        setLoading(false);
      }
    },
    [chefToken]
  );

  useEffect(() => {
    fetchReport(period, false);
  }, [period, refreshSignal, fetchReport]);

  const handleConfirmReset = async () => {
    setResetLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/chef/sales-profits/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chef-token': chefToken,
        },
        body: JSON.stringify({ period }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'فشل إعادة ضبط المبيعات والأرباح');
      }

      const data = await res.json();
      setReport(data.report);
      setConfirmResetOpen(false);
      setFeedback({
        type: 'success',
        message:
          'تمت إعادة ضبط نقطة بداية تقارير المبيعات والأرباح بنجاح (Sales & Profits baseline reset successfully). تم الاحتفاظ بكافة الطلبات والسجلات التاريخية دون حذف.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'تعذر إعادة ضبط تقارير المبيعات والأرباح.',
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Bar: Period Filters + Reset Sales & Profits Button */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Calendar className="w-4 h-4 text-[#0D447A]" />
            <span>الفترة الزمنية · Reporting Period:</span>
          </div>

          <div
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            role="group"
            aria-label="Reporting period filter"
          >
            <button
              type="button"
              onClick={() => setPeriod('today')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                period === 'today'
                  ? 'bg-[#0D447A] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today · اليوم
            </button>
            <button
              type="button"
              onClick={() => setPeriod('week')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                period === 'week'
                  ? 'bg-[#0D447A] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Week · هذا الأسبوع
            </button>
            <button
              type="button"
              onClick={() => setPeriod('month')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                period === 'month'
                  ? 'bg-[#0D447A] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month · هذا الشهر
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fetchReport(period, true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث البيانات</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmResetOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Sales &amp; Profits</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline px-2 cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Active Reset Baseline Notice */}
      {report?.salesResetAt && (
        <div className="px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
          <span>
            نقطة بداية التقارير الحالية (Active Reporting Baseline): يتم احتساب المبيعات
            المكتملة بدءاً من{' '}
            <strong className="font-mono-tabular text-slate-800">
              {new Date(report.salesResetAt).toLocaleString('ar-EG')}
            </strong>
          </span>
          <span className="text-slate-500">
            (السجلات التاريخية والطلبات السابقة محفوظة بالكامل)
          </span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchReport(period, true)}
            className="px-3 py-1.5 bg-white border border-red-200 rounded-md font-semibold hover:bg-red-50 cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Summary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Completed & Paid Orders */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>الطلبات المكتملة · Completed Orders</span>
            <ShoppingBag className="w-4 h-4 text-[#0D447A]" />
          </div>
          <div
            data-testid="metric-completed-orders"
            className="text-2xl font-extrabold text-slate-900 font-mono-tabular"
          >
            {loading && !report ? '...' : report?.summary.completedPaidOrdersCount ?? 0}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            إجمالي الطلبات المكتملة والمدفوعة فقط
          </p>
        </div>

        {/* 2. Total Quantity of Products Sold */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>الكميات المباعة · Products Sold Qty</span>
            <Package className="w-4 h-4 text-[#E89125]" />
          </div>
          <div
            data-testid="metric-total-quantity"
            className="text-2xl font-extrabold text-slate-900 font-mono-tabular"
          >
            {loading && !report ? '...' : report?.summary.totalProductsSoldQuantity ?? 0}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            مجموع وحدات المنتجات المباعة خلال الفترة
          </p>
        </div>

        {/* 3. Total Sales Revenue */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>إجمالي المبيعات · Total Sales Revenue</span>
            <DollarSign className="w-4 h-4 text-[#0D447A]" />
          </div>
          <div
            data-testid="metric-total-revenue"
            className="text-2xl font-extrabold text-[#0D447A] font-mono-tabular"
          >
            {loading && !report
              ? '...'
              : `${(report?.summary.totalSalesRevenue ?? 0).toFixed(2)} ج.م`}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            صافي إيرادات المنتجات المباعة بأسعار البيع الفعلية
          </p>
        </div>

        {/* 4. Total Profit */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>إجمالي الأرباح · Total Profit</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div
            data-testid="metric-total-profit"
            className="text-2xl font-extrabold text-emerald-700 font-mono-tabular"
          >
            {loading && !report
              ? '...'
              : `${(report?.summary.totalProfit ?? 0).toFixed(2)} ج.م`}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            محسوب من قيمة الربح المحفوظة لحظة إتمام كل بيعة
          </p>
        </div>
      </div>

      {/* Warning if any historical records lacked a saved profit snapshot */}
      {report && report.summary.itemsWithUnavailableProfit > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>تنبيه حول السجلات التاريخية (Historical Profit Snapshot Notice):</strong>{' '}
            يوجد عدد ({report.summary.itemsWithUnavailableProfit}) من عناصر الطلبات
            التاريخية لم يكن مسجلاً لها قيمة ربح وقت البيع. التزاماً بدقة التقارير، لم يتم
            افتراض ربح اليوم لتلك المبيعات السابقة وتم استثناء قيمها غير المعروفة من
            إجمالي الأرباح المؤكدة.
          </div>
        </div>
      )}

      {/* Detailed Product-Level Sales Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#0D447A]" />
            <h3 className="text-sm font-bold text-slate-900">
              تفاصيل مبيعات وأرباح المنتجات · Detailed Product Sales Table
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            يتم احتساب كل عملية بيع بقيمة السعر والربح المسجلة وقت إتمامها
          </span>
        </div>

        {loading && !report ? (
          <div className="p-8 text-center text-xs text-slate-500">
            جاري تحميل جدول المبيعات والأرباح...
          </div>
        ) : !report || report.products.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-bold text-slate-700 mb-1">
              لا توجد مبيعات مكتملة خلال هذه الفترة · No Completed Sales in Period
            </p>
            <p className="text-xs text-slate-500">
              بمجرد إنهاء الطلبات (Finished) ستظهر تفاصيل الكميات والإيرادات والأرباح لكل
              منتج هنا تلقائياً.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4 text-right">Product Name · اسم المنتج</th>
                  <th className="py-3 px-4 text-center">
                    Total Quantity Sold · الكمية المباعة
                  </th>
                  <th className="py-3 px-4 text-left">
                    Unit Selling Price · سعر بيع الوحدة
                  </th>
                  <th className="py-3 px-4 text-left">Unit Profit · ربح الوحدة</th>
                  <th className="py-3 px-4 text-left">
                    Total Sales Revenue · إجمالي المبيعات
                  </th>
                  <th className="py-3 px-4 text-left">Total Profit · إجمالي الربح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.products.map((row) => {
                  const priceLabel =
                    row.distinctUnitPrices.length > 1
                      ? row.distinctUnitPrices.map((p) => p.toFixed(2)).join(' / ')
                      : row.unitSellingPrice.toFixed(2);

                  const profitLabel =
                    row.distinctUnitProfits.length > 1
                      ? row.distinctUnitProfits.map((p) => p.toFixed(2)).join(' → ')
                      : row.unitProfit !== null
                      ? row.unitProfit.toFixed(2)
                      : 'Unavailable (غير متوفر)';

                  return (
                    <tr
                      key={row.productKey}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div>{row.productName}</div>
                        <div className="text-[11px] font-normal text-slate-500">
                          {row.category}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono-tabular font-bold text-slate-800">
                        {row.totalQuantitySold}
                      </td>
                      <td className="py-3.5 px-4 text-left font-mono-tabular text-slate-700">
                        {priceLabel} ج.م
                      </td>
                      <td className="py-3.5 px-4 text-left font-mono-tabular text-emerald-700 font-semibold">
                        {row.unitProfit !== null ? `${profitLabel} ج.م` : profitLabel}
                        {row.hasUnavailableProfitRecords && (
                          <span className="block text-[10px] text-amber-700 font-normal">
                            ({row.unavailableProfitQuantity} وحدة بدون سجل ربح تاريخي)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-left font-mono-tabular font-bold text-[#0D447A]">
                        {row.totalSalesRevenue.toFixed(2)} ج.م
                      </td>
                      <td className="py-3.5 px-4 text-left font-mono-tabular font-extrabold text-emerald-700">
                        {row.totalProfit !== null
                          ? `${row.totalProfit.toFixed(2)} ج.م`
                          : 'Unavailable'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live Google Sheets Price & Profit Reference (Visible only in Boss Dashboard) */}
      {catalogWithProfit.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-3.5 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-800">
              قيم السعر والربح الحالية في Google Sheets (للمبيعات الجديدة القادمة فقط)
            </h4>
            <span className="text-[11px] text-slate-500">
              مخفية تماماً عن واجهة العميل (Protected from Customer UI &amp; Public APIs)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-4">المنتج (Product Name)</th>
                  <th className="py-2.5 px-4">القسم (Category)</th>
                  <th className="py-2.5 px-4 text-left">السعر الحالي (Price)</th>
                  <th className="py-2.5 px-4 text-left">الربح الحالي للوحدة (Profit)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalogWithProfit.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-semibold text-slate-800">
                      {item.name}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">{item.category}</td>
                    <td className="py-2.5 px-4 text-left font-mono-tabular font-semibold text-slate-800">
                      {item.price.toFixed(2)} ج.م
                    </td>
                    <td className="py-2.5 px-4 text-left font-mono-tabular font-bold text-emerald-700">
                      {item.profit !== null && item.profit !== undefined
                        ? `${item.profit.toFixed(2)} ج.م`
                        : 'غير محدد (Unavailable)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Reset Sales & Profits */}
      {confirmResetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-sales-dialog-title"
        >
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3
                  id="reset-sales-dialog-title"
                  className="text-base font-bold text-slate-900"
                >
                  تأكيد إعادة ضبط المبيعات والأرباح · Reset Sales &amp; Profits
                </h3>
                <p className="text-xs text-slate-500">إجراء إداري لبداية فترة حساب جديدة</p>
              </div>
            </div>

            <div className="text-xs text-slate-700 space-y-2 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <p>
                هل أنت متأكد من رغبتك في إعادة ضبط تقارير المبيعات والأرباح للبدء من الصفر
                اعتباراً من هذه اللحظة؟
              </p>
              <p className="text-slate-600">
                <strong>ملاحظة هامة:</strong> سيتم تعيين نقطة بداية جديدة لحساب التقارير،
                بينما ستظل جميع الطلبات الأصلية، والطلبات المؤرشفة، وبيانات Google Sheets،
                ولقطات الأرباح التاريخية محفوظة بالكامل دون حذف.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                disabled={resetLoading}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel · إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={resetLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer"
              >
                {resetLoading ? 'جاري التنفيذ...' : 'Confirm · تأكيد إعادة الضبط'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
