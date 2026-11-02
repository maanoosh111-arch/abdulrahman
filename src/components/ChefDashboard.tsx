import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BarChart3,
  Briefcase,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock,
  ClipboardList,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Lock,
  LogOut,
  MapPin,
  Package,
  PenTool,
  Phone,
  Play,
  Printer,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Truck,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ChefOrder, OrderStatus } from '../types.ts';
import { playNewOrderChime } from '../utils/sound.ts';
import { SalesAndProfitsTab } from './SalesAndProfitsTab.tsx';
import { BrandLogo } from './BrandLogo.tsx';

interface ChefDashboardProps {
  onBackToMenu: () => void;
  onPrintOrder: (order: ChefOrder) => void;
}

type DashboardTab = 'active' | 'archived' | 'sales';
type StatusFilter = 'All' | OrderStatus;

interface ConfirmationDialogState {
  mode:
    | 'archive_active'
    | 'delete_single_archived'
    | 'delete_bulk_archived'
    | 'clear_all_archived';
  targetOrder?: ChefOrder;
  selectedIds?: string[];
  title: string;
  message: string;
  warningText?: string;
}

const CHEF_TOKEN_STORAGE_KEY = 'ibad_alrahman_chef_token';
const STAFF_ROLE_STORAGE_KEY = 'ibad_alrahman_staff_role';

export type StaffRole = 'boss' | 'manager' | 'designer';

export const ChefDashboard: React.FC<ChefDashboardProps> = ({
  onBackToMenu,
  onPrintOrder,
}) => {
  const [chefToken, setChefToken] = useState<string>(
    () => localStorage.getItem(CHEF_TOKEN_STORAGE_KEY) || ''
  );
  const [selectedRole, setSelectedRole] = useState<StaffRole>(() => {
    const saved = localStorage.getItem(STAFF_ROLE_STORAGE_KEY);
    return saved === 'manager' || saved === 'designer' ? saved : 'boss';
  });
  const [pinInput, setPinInput] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<DashboardTab>('active');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');

  const [activeOrders, setActiveOrders] = useState<ChefOrder[]>([]);
  const [archivedOrders, setArchivedOrders] = useState<ChefOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [processingOrderIds, setProcessingOrderIds] = useState<Set<string>>(new Set());
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<ConfirmationDialogState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState<boolean>(false);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [salesRefreshSignal, setSalesRefreshSignal] = useState<number>(0);
  const [syncingSheet, setSyncingSheet] = useState<boolean>(false);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [previewLogoUrl, setPreviewLogoUrl] = useState<string | null>(null);

  const handleCopyEngravingName = (text: string, orderId: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedOrderId(orderId);
    window.setTimeout(() => setCopiedOrderId(null), 2500);
  };

  const handleSyncSheet = async () => {
    setSyncingSheet(true);
    try {
      const res = await fetch('/api/sync-sheet');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشلت المزامنة');
      setFeedback({
        type: 'success',
        message: `تمت مزامنة بيانات Google Sheets بنجاح (${data.count} منتج متوفر).`,
      });
      fetchOrders(true);
      setSalesRefreshSignal((prev) => prev + 1);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'تعذر الاتصال بـ Google Sheets.',
      });
    } finally {
      setSyncingSheet(false);
    }
  };

  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef<boolean>(false);
  const soundEnabledRef = useRef<boolean>(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) {
      setAuthError('يرجى كتابة رمز الدخول السري للمتابعة');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/chef/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput.trim(), role: selectedRole }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        throw new Error(data.error || 'رمز الدخول غير صحيح. الدخول مخصص للإدارة والمصممين فقط.');
      }
      localStorage.setItem(CHEF_TOKEN_STORAGE_KEY, data.token);
      localStorage.setItem(STAFF_ROLE_STORAGE_KEY, selectedRole);
      setChefToken(data.token);
      setPinInput('');
      setFeedback({
        type: 'success',
        message: `مرحباً بك! تم التحقق من صلاحيات الدخول بنجاح.`,
      });
    } catch (err: any) {
      setAuthError(err?.message || 'تعذر تسجيل الدخول للوحة التحكم');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(CHEF_TOKEN_STORAGE_KEY);
    setChefToken('');
    setFeedback({
      type: 'success',
      message: 'تم تسجيل الخروج بنجاح وإقفال لوحة التحكم.',
    });
  };

  const fetchOrders = useCallback(
    async (silent = false) => {
      if (!chefToken) return;
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const res = await fetch('/api/chef/orders', {
          headers: {
            'x-chef-token': chefToken,
          },
        });

        if (res.status === 403) {
          localStorage.removeItem(CHEF_TOKEN_STORAGE_KEY);
          setChefToken('');
          return;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'تعذر تحميل الطلبات');
        }

        const data = await res.json();
        const incomingActive: ChefOrder[] = Array.isArray(data.activeOrders)
          ? data.activeOrders
          : [];
        const incomingArchived: ChefOrder[] = Array.isArray(data.archivedOrders)
          ? data.archivedOrders
          : [];

        // Check if any brand new order was added after initial load to trigger the audio alert
        if (initialLoadDoneRef.current) {
          const hasBrandNewOrder = incomingActive.some(
            (o) => !knownOrderIdsRef.current.has(o.id)
          );
          if (hasBrandNewOrder && soundEnabledRef.current) {
            playNewOrderChime();
          }
        }

        const updatedKnown = new Set<string>();
        incomingActive.forEach((o) => updatedKnown.add(o.id));
        incomingArchived.forEach((o) => updatedKnown.add(o.id));
        knownOrderIdsRef.current = updatedKnown;
        initialLoadDoneRef.current = true;

        setActiveOrders(incomingActive);
        setArchivedOrders(incomingArchived);

        // Keep selectedArchivedIds in sync with existing archived orders
        setSelectedArchivedIds((prev) => {
          const validIds = new Set(incomingArchived.map((o) => o.id));
          const next = new Set<string>();
          prev.forEach((id) => {
            if (validIds.has(id)) next.add(id);
          });
          return next;
        });
      } catch (err: any) {
        if (!silent) {
          setError(err?.message || 'حدث خطأ أثناء جلب الطلبات');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [chefToken]
  );

  useEffect(() => {
    if (chefToken) {
      fetchOrders(false);
    }
  }, [chefToken, fetchOrders]);

  // Real-time WebSocket + SSE connection + fallback polling for Chef Dashboard
  useEffect(() => {
    if (!chefToken) return;

    let ws: WebSocket | null = null;
    let sse: EventSource | null = null;

    const handleRealtimeMessage = (rawData: string) => {
      try {
        const parsed = JSON.parse(rawData);
        if (parsed.type === 'order:created' && parsed.payload?.order) {
          const newOrder: ChefOrder = parsed.payload.order;
          const isNew = !knownOrderIdsRef.current.has(newOrder.id);
          knownOrderIdsRef.current.add(newOrder.id);
          if (isNew && soundEnabledRef.current) {
            playNewOrderChime();
          }
          setActiveOrders((prev) => {
            if (prev.some((o) => o.id === newOrder.id)) return prev;
            return [newOrder, ...prev];
          });
          setFeedback({
            type: 'success',
            message: `وصل طلب جديد الآن (${newOrder.orderCode}) من العميل ${newOrder.customerName}!`,
          });
        } else if (
          parsed.type === 'order:updated' ||
          parsed.type === 'order:finished'
        ) {
          const updatedOrder: ChefOrder = parsed.payload?.order;
          if (updatedOrder) {
            setActiveOrders((prev) =>
              prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
            );
            setSalesRefreshSignal((s) => s + 1);
          }
        } else if (
          parsed.type === 'order:archived' ||
          parsed.type === 'archive:deleted' ||
          parsed.type === 'archive:bulk-deleted' ||
          parsed.type === 'archive:cleared'
        ) {
          fetchOrders(true);
        } else if (parsed.type === 'sales:reset') {
          setSalesRefreshSignal((s) => s + 1);
        }
      } catch {
        // Ignore malformed frame
      }
    };

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(
        `${protocol}//${window.location.host}/ws?role=chef&chefToken=${encodeURIComponent(
          chefToken
        )}`
      );
      ws.onmessage = (event) => handleRealtimeMessage(event.data);
    } catch {
      // Fallback to SSE
    }

    try {
      sse = new EventSource(
        `/api/events?role=chef&chefToken=${encodeURIComponent(chefToken)}`
      );
      sse.onmessage = (event) => handleRealtimeMessage(event.data);
    } catch {
      // Fallback polling handles updates
    }

    const pollInterval = window.setInterval(() => {
      fetchOrders(true);
    }, 6000);

    return () => {
      ws?.close();
      sse?.close();
      window.clearInterval(pollInterval);
    };
  }, [chefToken, fetchOrders]);

  // Action: Start Order (Pending -> In Progress)
  const handleStartOrder = async (order: ChefOrder) => {
    if (order.status !== 'Pending' || processingOrderIds.has(order.id)) return;

    setProcessingOrderIds((prev) => new Set(prev).add(order.id));
    setFeedback(null);

    try {
      const res = await fetch(`/api/chef/orders/${order.id}/start`, {
        method: 'POST',
        headers: {
          'x-chef-token': chefToken,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل بدء تنفيذ الطلب');
      }

      setActiveOrders((prev) =>
        prev.map((o) => (o.id === order.id ? data.order : o))
      );
      setFeedback({
        type: 'success',
        message: `تم بدء العمل على الطلب (${order.orderCode}) وتحديث حالته إلى قيد التنفيذ (In Progress).`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'تعذر تحديث حالة الطلب إلى قيد التنفيذ.',
      });
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  // Action: Finish Order (In Progress -> Finished + Capture Profit Snapshot + Web Push)
  const handleFinishOrder = async (order: ChefOrder) => {
    if (order.status !== 'In Progress' || processingOrderIds.has(order.id)) return;

    setProcessingOrderIds((prev) => new Set(prev).add(order.id));
    setFeedback(null);

    try {
      const res = await fetch(`/api/chef/orders/${order.id}/finish`, {
        method: 'POST',
        headers: {
          'x-chef-token': chefToken,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل إنهاء الطلب');
      }

      setActiveOrders((prev) =>
        prev.map((o) => (o.id === order.id ? data.order : o))
      );
      setSalesRefreshSignal((s) => s + 1);

      const notifMsg = data.notification?.message || '';
      setFeedback({
        type: 'success',
        message: `تم إنهاء الطلب (${order.orderCode}) بنجاح وحفظ الربح التاريخي وإرسال الإشعار: "${notifMsg}"`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'تعذر إنهاء الطلب.',
      });
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  // Request confirmation to archive an active order
  const promptArchiveActiveOrder = (order: ChefOrder) => {
    const isStartedOrFinished =
      order.status === 'In Progress' || order.status === 'Finished';

    setConfirmDialog({
      mode: 'archive_active',
      targetOrder: order,
      title: `نقل الطلب (${order.orderCode}) إلى الأرشيف · Archive Order`,
      message: `هل تريد نقل الطلب (${order.orderCode}) الخاص بالعميل "${order.customerName}" إلى تبويب الطلبات المؤرشفة؟`,
      warningText: isStartedOrFinished
        ? `تنبيه: هذا الطلب في حالة "${order.status}". سيتم نقله إلى الأرشيف مع الحفاظ الكامل على السجلات المالية والتاريخية.`
        : undefined,
    });
  };

  // Request confirmation to permanently delete a single archived order
  const promptDeleteSingleArchived = (order: ChefOrder) => {
    setConfirmDialog({
      mode: 'delete_single_archived',
      targetOrder: order,
      title: `حذف الطلب المؤرشف (${order.orderCode}) · Delete Archived Order`,
      message: `هل أنت متأكد من حذف الطلب المؤرشف (${order.orderCode}) نهائياً من قائمة الأرشيف؟ (سيتم الحفاظ على بيانات المبيعات التاريخية في تقارير الأرباح).`,
    });
  };

  // Request confirmation to bulk-delete selected archived orders
  const promptDeleteBulkArchived = () => {
    const ids = Array.from(selectedArchivedIds);
    if (ids.length === 0) return;

    setConfirmDialog({
      mode: 'delete_bulk_archived',
      selectedIds: ids,
      title: `حذف الطلبات المحددة (${ids.length}) · Bulk Delete Archived Orders`,
      message: `هل أنت متأكد من حذف عدد (${ids.length}) من الطلبات المؤرشفة المحددة نهائياً؟ لن يتأثر أي طلب غير محدد، وستظل تقارير المبيعات التاريخية محفوظة.`,
    });
  };

  // Request confirmation to clear all archived orders
  const promptClearAllArchived = () => {
    if (archivedOrders.length === 0) return;

    setConfirmDialog({
      mode: 'clear_all_archived',
      title: `مسح جميع الطلبات المؤرشفة (${archivedOrders.length}) · Clear All Archived Orders`,
      message: `هل أنت متأكد من مسح جميع الطلبات المؤرشفة (${archivedOrders.length} طلب)؟ هذا الإجراء يفرغ قائمة الأرشيف فقط ولا يؤثر إطلاقاً على الطلبات النشطة أو تقارير المبيعات والأرباح التاريخية.`,
    });
  };

  // Execute confirmed archive or delete action
  const handleConfirmDialogAction = async () => {
    if (!confirmDialog) return;
    setConfirmBusy(true);
    setFeedback(null);

    try {
      if (confirmDialog.mode === 'archive_active' && confirmDialog.targetOrder) {
        const order = confirmDialog.targetOrder;
        const res = await fetch(`/api/chef/orders/${order.id}/archive`, {
          method: 'POST',
          headers: { 'x-chef-token': chefToken },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل أرشفة الطلب');

        setActiveOrders((prev) => prev.filter((o) => o.id !== order.id));
        setArchivedOrders((prev) => [data.order, ...prev]);
        setFeedback({
          type: 'success',
          message: `تم نقل الطلب (${order.orderCode}) إلى الأرشيف بنجاح.`,
        });
      } else if (
        confirmDialog.mode === 'delete_single_archived' &&
        confirmDialog.targetOrder
      ) {
        const order = confirmDialog.targetOrder;
        const res = await fetch(`/api/chef/archived-orders/${order.id}`, {
          method: 'DELETE',
          headers: { 'x-chef-token': chefToken },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل حذف الطلب المؤرشف');

        setArchivedOrders(data.archivedOrders || []);
        setSelectedArchivedIds((prev) => {
          const next = new Set(prev);
          next.delete(order.id);
          return next;
        });
        setFeedback({
          type: 'success',
          message: `تم حذف الطلب المؤرشف (${order.orderCode}) بنجاح مع الحفاظ على سجلات المبيعات.`,
        });
      } else if (
        confirmDialog.mode === 'delete_bulk_archived' &&
        confirmDialog.selectedIds
      ) {
        const res = await fetch('/api/chef/archived-orders/bulk-delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-chef-token': chefToken,
          },
          body: JSON.stringify({ orderIds: confirmDialog.selectedIds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل حذف الطلبات المحددة');

        setArchivedOrders(data.archivedOrders || []);
        setSelectedArchivedIds(new Set());
        setFeedback({
          type: 'success',
          message: `تم حذف (${data.deletedCount}) من الطلبات المؤرشفة المحددة بنجاح.`,
        });
      } else if (confirmDialog.mode === 'clear_all_archived') {
        const res = await fetch('/api/chef/archived-orders', {
          method: 'DELETE',
          headers: { 'x-chef-token': chefToken },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل مسح الأرشيف');

        setArchivedOrders(data.archivedOrders || []);
        setSelectedArchivedIds(new Set());
        setFeedback({
          type: 'success',
          message: `تم مسح جميع الطلبات المؤرشفة (${data.deletedCount}) بنجاح.`,
        });
      }

      setConfirmDialog(null);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'حدث خطأ أثناء تنفيذ العملية.',
      });
    } finally {
      setConfirmBusy(false);
    }
  };

  // Toggle selection of a single archived order
  const toggleSelectArchivedOrder = (orderId: string) => {
    setSelectedArchivedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  // Toggle Select All archived orders
  const toggleSelectAllArchived = () => {
    if (
      archivedOrders.length > 0 &&
      selectedArchivedIds.size === archivedOrders.length
    ) {
      setSelectedArchivedIds(new Set());
    } else {
      setSelectedArchivedIds(new Set(archivedOrders.map((o) => o.id)));
    }
  };

  const filteredActiveOrders =
    statusFilter === 'All'
      ? activeOrders
      : activeOrders.filter((o) => o.status === statusFilter);

  const roleLabels: Record<StaffRole, string> = {
    boss: 'المدير العام (Boss)',
    manager: 'المشرف الإداري (Manager)',
    designer: 'مصمم ومشغل الليزر (Laser Designer)',
  };

  if (!chefToken) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col justify-center items-center p-4 no-print">
        <div className="bg-white w-full max-w-lg rounded-2xl border border-slate-200/90 shadow-lg p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <BrandLogo size="sm" showSubtitle />
            <button
              type="button"
              onClick={onBackToMenu}
              className="text-xs font-bold text-slate-600 hover:text-[#0D447A] flex items-center gap-1.5 transition-colors cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200"
            >
              <span>متجر العملاء</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[#0D447A]/10 text-[#0D447A] flex items-center justify-center mx-auto shadow-2xs">
              <Lock className="w-6 h-6 text-[#0D447A]" />
            </div>
            <h2 className="font-luxury-arabic text-xl sm:text-2xl font-bold text-[#0D447A]">
              بوابة الإدارة وفريق تشغيل الليزر
            </h2>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              هذه الصفحة مخصصة فقط للمدير العام، المشرفين، ومصممي ورشة ماكينات الليزر والراوتر CNC لمتابعة أوامر التشغيل والمبيعات.
            </p>
          </div>

          {/* Role Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              اختر صفتك في فريق العمل (Select Your Role):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedRole('boss')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  selectedRole === 'boss'
                    ? 'border-[#0D447A] bg-[#0D447A]/5 text-[#0D447A] ring-1 ring-[#0D447A]'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-[#E89125]" />
                <span>المدير العام</span>
                <span className="text-[10px] text-slate-400 font-normal">Boss &amp; Owner</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedRole('manager')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  selectedRole === 'manager'
                    ? 'border-[#0D447A] bg-[#0D447A]/5 text-[#0D447A] ring-1 ring-[#0D447A]'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Briefcase className="w-4 h-4 text-[#0D447A]" />
                <span>المشرف العام</span>
                <span className="text-[10px] text-slate-400 font-normal">Store Manager</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedRole('designer')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  selectedRole === 'designer'
                    ? 'border-[#0D447A] bg-[#0D447A]/5 text-[#0D447A] ring-1 ring-[#0D447A]'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <PenTool className="w-4 h-4 text-[#E89125]" />
                <span>المصمم والورشة</span>
                <span className="text-[10px] text-slate-400 font-normal">Laser Operator</span>
              </button>
            </div>
          </div>

          {authError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleManualLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="chef-pin-input"
                className="block text-xs font-bold text-slate-700"
              >
                رمز الدخول السري (Access PIN)
              </label>
              <div className="relative">
                <input
                  id="chef-pin-input"
                  type={showPin ? 'text' : 'password'}
                  required
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    if (authError) setAuthError(null);
                  }}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D447A] font-mono-tabular"
                  placeholder="أدخل الرمز السري..."
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPin ? 'إخفاء الرمز' : 'إظهار الرمز'}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>رمز الدخول المعتمد للإدارة والمصممين: <strong>1234</strong></span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" /> وصول مشفر
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 px-4 bg-[#0D447A] hover:bg-[#082D52] text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              <Lock className="w-4 h-4" />
              <span>
                {authLoading ? 'جاري التحقق من الصلاحيات...' : `دخول لوحة التحكم بصفة [${roleLabels[selectedRole]}]`}
              </span>
            </button>
          </form>

          <div className="text-center pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onBackToMenu}
              className="text-xs text-slate-500 hover:text-[#0D447A] transition-colors cursor-pointer"
            >
              العودة إلى الصفحة الرئيسية لمتجر العملاء
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col no-print">
      {/* Top Bar following the 3-zone contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Zone 1: Brand Title & Staff Role Badge */}
          <div className="flex items-center gap-3 shrink-0">
            <BrandLogo size="sm" />
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="font-luxury-arabic text-lg sm:text-xl font-bold tracking-tight text-[#0D447A] whitespace-nowrap shrink-0">
                لوحة تحكم الإدارة والمصممين
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0D447A]/10 text-[#0D447A] text-[10px] sm:text-xs font-bold border border-[#0D447A]/15 w-fit">
                <ShieldCheck className="w-3 h-3 text-[#E89125]" />
                <span>{roleLabels[selectedRole]}</span>
              </span>
            </div>
          </div>

          {/* Zone 2: Main Dashboard Section Tabs */}
          <nav
            className="hidden md:flex items-center gap-6 text-sm font-bold"
            aria-label="Boss Dashboard Sections"
          >
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'active'
                  ? 'border-[#0D447A] text-[#0D447A]'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Active Orders · الطلبات النشطة ({activeOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('archived')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'archived'
                  ? 'border-[#0D447A] text-[#0D447A]'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Archived Orders · الأرشيف ({archivedOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sales')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'sales'
                  ? 'border-[#0D447A] text-[#0D447A]'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Sales &amp; Profits · المبيعات والأرباح
            </button>
          </nav>

          {/* Zone 3: Return to Store & Secure Logout */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onBackToMenu}
              className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              متجر العملاء · Store
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200/80 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="تسجيل الخروج وإغلاق لوحة التحكم"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج · Logout</span>
            </button>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex md:hidden items-center gap-1 mt-3 p-1 bg-slate-100 rounded-lg overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-md whitespace-nowrap shrink-0 ${
              activeTab === 'active'
                ? 'bg-white text-[#0D447A] shadow-2xs'
                : 'text-slate-600'
            }`}
          >
            Active Orders ({activeOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('archived')}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-md whitespace-nowrap shrink-0 ${
              activeTab === 'archived'
                ? 'bg-white text-[#0D447A] shadow-2xs'
                : 'text-slate-600'
            }`}
          >
            Archived Orders ({archivedOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sales')}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-md whitespace-nowrap shrink-0 ${
              activeTab === 'sales'
                ? 'bg-white text-[#0D447A] shadow-2xs'
                : 'text-slate-600'
            }`}
          >
            Sales &amp; Profits
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 flex-1 space-y-6">
        {/* Audio Notification & Refresh Toolbar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setSoundEnabled((prev) => !prev)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                soundEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="w-4 h-4 text-emerald-600" />
                  <span>الجرس الصوتي للطلبات الجديدة: مفعل (Sound On)</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4 text-slate-500" />
                  <span>الجرس الصوتي: صامت (Muted)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => playNewOrderChime()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0D447A] bg-[#0D447A]/5 hover:bg-[#0D447A]/10 rounded-lg transition-colors cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>تجربة صوت الطلب · Test Sound</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSyncSheet}
              disabled={syncingSheet}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0D447A] bg-[#0D447A]/10 border border-[#0D447A]/20 rounded-lg hover:bg-[#0D447A]/15 transition-colors cursor-pointer"
              title="مزامنة فورية مع Google Sheet"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingSheet ? 'animate-spin' : ''}`} />
              <span>مزامنة Google Sheet</span>
            </button>

            <button
              type="button"
              onClick={() => fetchOrders(false)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث الطلبات · Refresh</span>
            </button>
          </div>
        </div>

        {/* Global Feedback Toast / Alert */}
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

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => fetchOrders(false)}
              className="px-3 py-1.5 bg-white border border-red-200 rounded-md font-semibold hover:bg-red-50 cursor-pointer"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* TAB 1: ACTIVE ORDERS */}
        {activeTab === 'active' && (
          <div className="space-y-5">
            {/* Status Filter Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[#0D447A]" />
                <h2 className="text-base font-bold text-slate-900">
                  إدارة الطلبات النشطة · Active Orders Management
                </h2>
              </div>

              <div className="inline-flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl">
                {(['All', 'Pending', 'In Progress', 'Finished'] as StatusFilter[]).map(
                  (st) => {
                    const count =
                      st === 'All'
                        ? activeOrders.length
                        : activeOrders.filter((o) => o.status === st).length;
                    const labelAr =
                      st === 'All'
                        ? 'الكل · All'
                        : st === 'Pending'
                        ? 'Pending · انتظار'
                        : st === 'In Progress'
                        ? 'In Progress · تحضير'
                        : 'Finished · مكتمل';
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          statusFilter === st
                            ? 'bg-[#0D447A] text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {labelAr} ({count})
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {loading && activeOrders.length === 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[1, 2].map((n) => (
                  <div
                    key={n}
                    className="h-56 bg-white rounded-xl border border-slate-200 animate-pulse p-5"
                  />
                ))}
              </div>
            ) : filteredActiveOrders.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <ClipboardList className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800 mb-1">
                  لا توجد طلبات نشطة في هذا التصنيف · No Active Orders
                </h3>
                <p className="text-xs text-slate-500">
                  عندما يرسل العميل طلباً جديداً، سيظهر هنا فوراً مع تنبيه صوتي مباشر.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {filteredActiveOrders.map((order) => {
                  const isBusy = processingOrderIds.has(order.id);
                  const createdFormatted = new Date(order.createdAt).toLocaleString(
                    'ar-EG',
                    {
                      year: 'numeric',
                      month: 'short',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    }
                  );

                  const statusStyle =
                    order.status === 'Finished'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : order.status === 'In Progress'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-slate-100 text-slate-800 border-slate-200';

                  return (
                    <div
                      key={order.id}
                      data-testid={`order-card-${order.orderCode}`}
                      className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between shadow-2xs"
                    >
                      <div>
                        {/* Card Header: Order Code, Timestamp, Status, Compact Print & Archive Buttons */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono-tabular text-base font-extrabold text-[#0D447A]">
                              {order.orderCode}
                            </span>
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            <span className="text-xs text-slate-500 font-mono-tabular">
                              {createdFormatted}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-1 rounded-md border text-xs font-bold ${statusStyle}`}
                            >
                              {order.status}
                            </span>

                            {/* Compact Print Receipt Icon Button */}
                            <button
                              type="button"
                              onClick={() => onPrintOrder(order)}
                              className="p-2 text-slate-600 hover:text-[#0D447A] hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                              title={`Print Receipt (${order.orderCode})`}
                              aria-label={`Print Receipt for ${order.orderCode}`}
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            {/* Compact Delete/Archive Icon Button */}
                            <button
                              type="button"
                              onClick={() => promptArchiveActiveOrder(order)}
                              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                              title={`Archive / Delete Order (${order.orderCode})`}
                              aria-label={`Archive or Delete Order ${order.orderCode}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Customer & Fulfillment Metadata */}
                        <div className="py-3 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-2 text-slate-700">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold">{order.customerName}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-700">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono-tabular">
                              {order.customerPhone}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-700">
                            {order.fulfillmentType === 'Delivery' ? (
                              <>
                                <Truck className="w-3.5 h-3.5 text-[#0D447A] shrink-0" />
                                <span className="font-bold text-[#0D447A]">
                                  توصيل · Delivery
                                </span>
                              </>
                            ) : (
                              <>
                                <Package className="w-3.5 h-3.5 text-[#E89125] shrink-0" />
                                <span className="font-bold text-[#E89125]">
                                  استلام · Pickup
                                </span>
                              </>
                            )}
                          </div>
                          {order.fulfillmentType === 'Delivery' &&
                            order.customerAddress && (
                              <div className="flex items-center gap-2 text-slate-600 sm:col-span-2">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>العنوان: {order.customerAddress}</span>
                              </div>
                            )}
                        </div>

                        {/* Ordered Items List */}
                        <div className="py-3 divide-y divide-slate-100">
                          {order.items.map((item, idx) => (
                            <div
                              key={`${item.productId}_${idx}`}
                              className="py-1.5 flex flex-col gap-1 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono-tabular font-bold text-[#0D447A]">
                                    {item.quantity}x
                                  </span>
                                  <span className="font-semibold text-slate-900">
                                    {item.name}
                                  </span>
                                  <span className="text-slate-400">·</span>
                                  <span className="font-mono-tabular text-slate-500">
                                    ({item.price.toFixed(2)} ج.م/وحدة)
                                  </span>
                                </div>
                                <span className="font-mono-tabular font-bold text-slate-900">
                                  {(item.price * item.quantity).toFixed(2)} ج.م
                                </span>
                              </div>
                              {item.engravingName && (
                                <div className="text-[11px] text-[#0D447A] bg-[#0D447A]/5 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
                                  <PenTool className="w-3 h-3 text-[#E89125]" />
                                  <span>حفر مخصص للمنتج: <strong>{item.engravingName}</strong></span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* =========================================================================
                            DESIGNER & WOOD LASER MACHINE WORKSHOP MODULE
                            ========================================================================= */}
                        {(() => {
                          const displayEngraving =
                            order.engravingName ||
                            order.items.find((i) => i.engravingName)?.engravingName;
                          const displayHasLogo =
                            order.hasLogo || order.items.some((i) => i.hasLogo);
                          const displayLogoUrl =
                            order.logoUrl ||
                            order.items.find((i) => i.logoUrl)?.logoUrl;
                          const displayLogoFileName =
                            order.logoFileName ||
                            order.items.find((i) => i.logoFileName)?.logoFileName;
                          const displayDesignerNotes =
                            order.designerNotes ||
                            order.items.find((i) => i.designerNotes)?.designerNotes;

                          return (
                            <div className="my-3 p-3.5 bg-[#FAFBFD] rounded-xl border border-[#0D447A]/25 space-y-3 shadow-2xs">
                              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                                <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#0D447A]">
                                  <PenTool className="w-3.5 h-3.5 text-[#E89125]" />
                                  <span>بيانات حفر وطباعة الليزر للمصمم (Laser Job)</span>
                                </div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#0D447A]/10 text-[#0D447A]">
                                  أمر تشغيل الورشة
                                </span>
                              </div>

                              {/* 1. Name to be laser engraved */}
                              <div className="p-2.5 bg-amber-50/80 rounded-lg border border-amber-200/90">
                                <div className="flex items-center justify-between text-[11px] text-amber-900 font-bold mb-1">
                                  <span className="flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-[#E89125]" />
                                    <span>الاسم المطلوب حفره على الخشب (Engraving Name):</span>
                                  </span>
                                  {displayEngraving && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyEngravingName(displayEngraving, order.id)
                                      }
                                      className="px-2 py-0.5 bg-white border border-amber-300 rounded text-[10px] font-bold text-amber-900 hover:bg-amber-100 flex items-center gap-1 transition-colors cursor-pointer"
                                      title="نسخ الاسم إلى الحافظة"
                                    >
                                      {copiedOrderId === order.id ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-600" />
                                          <span>تم النسخ!</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3" />
                                          <span>نسخ الاسم</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                                <div className="font-luxury-arabic text-base sm:text-lg font-bold text-slate-900 select-all leading-normal">
                                  {displayEngraving || 'لم يُدخل العميل اسماً محدداً'}
                                </div>
                              </div>

                              {/* 2. Customer Uploaded Logo */}
                              <div className="space-y-1">
                                <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                                  <ImageIcon className="w-3.5 h-3.5 text-[#0D447A]" />
                                  <span>شعار / لوجو العميل للحفر والطباعة:</span>
                                </div>

                                {displayLogoUrl ? (
                                  <div className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between gap-3 shadow-2xs">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <img
                                        src={displayLogoUrl}
                                        alt="Customer uploaded logo"
                                        onClick={() => setPreviewLogoUrl(displayLogoUrl)}
                                        className="w-12 h-12 object-contain bg-slate-50 rounded border border-slate-200 p-1 shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                                        title="انقر لتكبير اللوجو"
                                      />
                                      <div className="min-w-0">
                                        <div className="text-xs font-bold text-slate-800 truncate">
                                          {displayLogoFileName || 'شعار العميل المرفق'}
                                        </div>
                                        <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                                          <Check className="w-3 h-3 text-emerald-600" />
                                          مرفق وجاهز للتجهيز لماكينة الليزر
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => setPreviewLogoUrl(displayLogoUrl)}
                                        className="px-2 py-1 text-xs font-semibold text-[#0D447A] bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                                      >
                                        معاينة
                                      </button>
                                      <a
                                        href={displayLogoUrl}
                                        download={`${order.orderCode}-logo.png`}
                                        className="px-2.5 py-1 text-xs font-bold text-white bg-[#0D447A] hover:bg-[#082D52] rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                                      >
                                        <Download className="w-3 h-3" />
                                        <span>تحميل</span>
                                      </a>
                                    </div>
                                  </div>
                                ) : displayHasLogo ? (
                                  <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
                                    طلب العميل إضافة لوجو (لم يتم إرفاق ملف صورة بالطلب)
                                  </div>
                                ) : (
                                  <div className="p-2 bg-slate-100/70 rounded-lg text-[11px] text-slate-500 font-medium">
                                    بدون لوجو (حفر الاسم والعبارة فقط)
                                  </div>
                                )}
                              </div>

                              {/* 3. Designer Notes */}
                              {(displayDesignerNotes || order.customerNotes) && (
                                <div className="p-2.5 bg-blue-50/70 rounded-lg border border-blue-200/80 text-xs space-y-1">
                                  <div className="font-bold text-[#0D447A] flex items-center gap-1 text-[11px]">
                                    <FileText className="w-3.5 h-3.5" />
                                    <span>ملاحظات وتوجيهات العميل للمصمم:</span>
                                  </div>
                                  <p className="text-slate-800 whitespace-pre-wrap leading-relaxed pr-4 text-xs font-medium">
                                    {displayDesignerNotes || order.customerNotes}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Footer Totals & Status Lifecycle Actions */}
                      <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs space-y-0.5">
                          <div className="text-slate-500">
                            المجموع الفرعي:{' '}
                            <span className="font-mono-tabular">
                              {order.subtotal.toFixed(2)} ج.م
                            </span>
                            {order.deliveryCharge > 0 && (
                              <>
                                {' '}
                                · التوصيل:{' '}
                                <span className="font-mono-tabular">
                                  {order.deliveryCharge.toFixed(2)} ج.م
                                </span>
                              </>
                            )}
                          </div>
                          <div className="text-sm font-extrabold text-[#0D447A] font-mono-tabular">
                            الإجمالي: {order.total.toFixed(2)} ج.م
                          </div>
                        </div>

                        {/* Lifecycle Action Button: Pending -> Start | In Progress -> Finish | Finished -> Completed State */}
                        <div>
                          {order.status === 'Pending' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleStartOrder(order)}
                              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#0D447A] hover:bg-[#082D52] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>{isBusy ? 'جاري البدء...' : 'Start · بدء التحضير'}</span>
                            </button>
                          )}

                          {order.status === 'In Progress' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleFinishOrder(order)}
                              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>
                                {isBusy ? 'جاري الإنهاء...' : 'Finish · إنهاء الطلب'}
                              </span>
                            </button>
                          )}

                          {order.status === 'Finished' && (
                            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>مكتمل · Finished</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ARCHIVED ORDERS MANAGEMENT */}
        {activeTab === 'archived' && (
          <div className="space-y-5">
            {/* Archived Orders Header & Bulk Action Bar */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Archive className="w-5 h-5 text-[#0D447A]" />
                  <h2 className="text-base font-bold text-slate-900">
                    إدارة الطلبات المؤرشفة · Archived Orders ({archivedOrders.length})
                  </h2>
                </div>

                {archivedOrders.length > 0 && (
                  <div className="flex items-center gap-3 border-r border-slate-200 pr-4">
                    <button
                      type="button"
                      onClick={toggleSelectAllArchived}
                      className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-[#0D447A] cursor-pointer"
                    >
                      {selectedArchivedIds.size === archivedOrders.length &&
                      archivedOrders.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-[#0D447A]" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                      <span>Select All · تحديد الكل</span>
                    </button>

                    <span className="text-xs text-slate-500 font-mono-tabular">
                      Selected: <strong>{selectedArchivedIds.size}</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Bulk Delete & Clear All Actions */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={selectedArchivedIds.size === 0}
                  onClick={promptDeleteBulkArchived}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    Delete Selected · حذف المحدد ({selectedArchivedIds.size})
                  </span>
                </button>

                <button
                  type="button"
                  disabled={archivedOrders.length === 0}
                  onClick={promptClearAllArchived}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All · مسح الكل</span>
                </button>
              </div>
            </div>

            {archivedOrders.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <Archive className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800 mb-1">
                  لا توجد طلبات في الأرشيف · Archive is Empty
                </h3>
                <p className="text-xs text-slate-500">
                  الطلبات التي يتم نقلها إلى الأرشيف من القائمة النشطة تظهر هنا مع إمكانية
                  الحذف الفردي أو الجماعي دون التأثير على تقارير المبيعات التاريخية.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {archivedOrders.map((order) => {
                  const isSelected = selectedArchivedIds.has(order.id);
                  const createdFormatted = new Date(order.createdAt).toLocaleString(
                    'ar-EG',
                    {
                      year: 'numeric',
                      month: 'short',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    }
                  );

                  return (
                    <div
                      key={order.id}
                      data-testid={`archived-order-${order.orderCode}`}
                      className={`bg-white rounded-xl border p-4 transition-colors flex flex-wrap items-center justify-between gap-4 ${
                        isSelected
                          ? 'border-[#0D447A] bg-[#0D447A]/[0.02]'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectArchivedOrder(order.id)}
                          aria-label={`Select archived order ${order.orderCode}`}
                          className="w-4 h-4 rounded border-slate-300 text-[#0D447A] focus:ring-[#0D447A] mt-1 sm:mt-0 cursor-pointer"
                        />

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono-tabular text-sm font-extrabold text-[#0D447A]">
                              {order.orderCode}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs font-semibold text-slate-800">
                              {order.customerName}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs text-slate-500 font-mono-tabular">
                              {createdFormatted}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs font-semibold text-slate-600">
                              الحالة عند الأرشفة: {order.status}
                            </span>
                          </div>

                          <div className="text-xs text-slate-500 mt-1">
                            {order.items
                              .map((i) => `${i.quantity}x ${i.name}`)
                              .join(' ، ')}{' '}
                            —{' '}
                            <strong className="font-mono-tabular text-slate-800">
                              {order.total.toFixed(2)} ج.م
                            </strong>
                          </div>

                          {/* Laser Wood Customization Summary */}
                          {(order.engravingName || order.hasLogo) && (
                            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px]">
                              {order.engravingName && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 font-bold">
                                  <PenTool className="w-3 h-3 text-[#E89125]" />
                                  <span>الاسم المحفور: {order.engravingName}</span>
                                </span>
                              )}
                              {order.hasLogo && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                                  <ImageIcon className="w-3 h-3 text-emerald-600" />
                                  <span>لوجو مخصص مرفق</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onPrintOrder(order)}
                          className="p-2 text-slate-600 hover:text-[#0D447A] hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                          title={`Print Receipt (${order.orderCode})`}
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        {/* Individual small delete button */}
                        <button
                          type="button"
                          onClick={() => promptDeleteSingleArchived(order)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors cursor-pointer"
                          title={`Delete archived order ${order.orderCode}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete · حذف</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SALES & PROFITS */}
        {activeTab === 'sales' && (
          <SalesAndProfitsTab
            chefToken={chefToken}
            refreshSignal={salesRefreshSignal}
          />
        )}
      </main>

      {/* Confirmation Modal for Archive / Delete Operations */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3
                id="confirm-dialog-title"
                className="text-base font-bold text-slate-900"
              >
                {confirmDialog.title}
              </h3>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              {confirmDialog.message}
            </p>

            {confirmDialog.warningText && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-semibold">
                {confirmDialog.warningText}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel · إلغاء
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={handleConfirmDialogAction}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer"
              >
                {confirmBusy ? 'جاري التنفيذ...' : 'Confirm · تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Zoom Modal for Customer Uploaded Logo */}
      {previewLogoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-4"
          onClick={() => setPreviewLogoUrl(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full space-y-4 border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-[#0D447A]" />
                <h3 className="font-luxury-arabic text-base font-bold text-slate-900">
                  معاينة لوجو العميل لماكينة الليزر
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewLogoUrl(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="aspect-square w-full bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-center overflow-hidden">
              <img
                src={previewLogoUrl}
                alt="Enlarged customer logo"
                className="max-w-full max-h-full object-contain"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setPreviewLogoUrl(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                إغلاق
              </button>
              <a
                href={previewLogoUrl}
                download="customer-laser-logo.png"
                className="px-4 py-2 text-xs font-bold text-white bg-[#0D447A] hover:bg-[#082D52] rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>تحميل اللوجو الأصلي (Download)</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
