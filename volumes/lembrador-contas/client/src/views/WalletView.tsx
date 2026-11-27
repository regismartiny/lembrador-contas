import React, { useMemo, useState, useRef } from 'react';
import {
  Zap,
  Plus,
  RefreshCw,
  FileText,
  Copy,
  Check,
  CheckCircle2,
  Calendar,
  TrendingUp,
  TrendingDown,
  Search,
  Sparkles,
  AlertTriangle,
  Home,
} from 'lucide-react';
import type { ActiveBillItem, ResidentUser } from '../types';
import {
  formatBRL,
  parseRefPeriod,
  formatPeriodShort,
  formatPeriodLong,
  formatDueDayMonth,
  formatDateTime,
  computeBillUrgency,
  getInitials,
  getAvatarGradient,
  currentRefPeriod,
} from '../lib/format';

interface WalletViewProps {
  activeBills: ActiveBillItem[];
  users: ResidentUser[];
  configuredCount: number;
  selectedPeriod: string;
  onSelectPeriod: (period: string) => void;
  scopeUserId: string;
  onSelectScopeUser: (uid: string) => void;
  isAdmin: boolean;
  syncing: boolean;
  onSync: () => void;
  onTogglePaid: (bill: ActiveBillItem) => Promise<void>;
  onOpenBill: (bill: ActiveBillItem) => void;
  onNewBill: () => void;
  onStartGuidedPay: (bills: ActiveBillItem[]) => void;
}

export const WalletView: React.FC<WalletViewProps> = ({
  activeBills,
  users,
  configuredCount,
  selectedPeriod,
  onSelectPeriod,
  scopeUserId,
  onSelectScopeUser,
  isAdmin,
  syncing,
  onSync,
  onTogglePaid,
  onOpenBill,
  onNewBill,
  onStartGuidedPay,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [swipeState, setSwipeState] = useState<{ id: string; dx: number } | null>(null);
  const touchStartX = useRef<number | null>(null);

  const usersById = useMemo(() => new Map(users.map(u => [u._id, u])), [users]);
  const activeResidents = useMemo(
    () => users.filter(u => u.status === 'ACTIVE' || u.hasAssignedBills),
    [users]
  );

  // Build ordered list of available periods (plus current month if none)
  const periods = useMemo(() => {
    const map = new Map<string, { ref: string; key: number; unpaid: number; total: number }>();
    const cur = currentRefPeriod();
    const curParsed = parseRefPeriod(cur)!;
    map.set(cur, { ref: cur, key: curParsed.key, unpaid: 0, total: 0 });

    for (const b of activeBills) {
      if (scopeUserId !== 'ALL' && !b.users.includes(scopeUserId)) continue;
      const p = parseRefPeriod(b.referencePeriod);
      if (!p) continue;
      if (!map.has(b.referencePeriod)) {
        map.set(b.referencePeriod, { ref: b.referencePeriod, key: p.key, unpaid: 0, total: 0 });
      }
      const entry = map.get(b.referencePeriod)!;
      const share =
        scopeUserId === 'ALL'
          ? b.value ?? 0
          : (b.value ?? 0) / Math.max(b.users.length, 1);
      entry.total += share;
      if (b.status !== 'PAID') entry.unpaid += share;
    }

    return Array.from(map.values()).sort((a, b) => a.key - b.key);
  }, [activeBills, scopeUserId]);

  const effectiveAmount = (bill: ActiveBillItem): number => {
    const raw = bill.value ?? 0;
    if (scopeUserId === 'ALL') return raw;
    if (!bill.users.includes(scopeUserId)) return 0;
    return raw / Math.max(bill.users.length, 1);
  };

  // Scoped bills for selected period
  const periodBills = useMemo(() => {
    return activeBills
      .filter(b => {
        if (selectedPeriod !== 'ALL' && b.referencePeriod !== selectedPeriod) return false;
        if (scopeUserId !== 'ALL' && !b.users.includes(scopeUserId)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.status === 'PAID' && b.status !== 'PAID') return 1;
        if (a.status !== 'PAID' && b.status === 'PAID') return -1;
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const dbTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return da - dbTime || a.name.localeCompare(b.name);
      });
  }, [activeBills, selectedPeriod, scopeUserId]);

  // Metrics for Atmospheric Hero
  const metrics = useMemo(() => {
    let total = 0;
    let paid = 0;
    let pending = 0;
    let pixPending = 0;
    let cashPending = 0;
    let urgentCount = 0;
    let errorCount = 0;
    const unpaidList: ActiveBillItem[] = [];

    for (const b of periodBills) {
      const amt = effectiveAmount(b);
      total += amt;
      if (b.status === 'PAID') {
        paid += amt;
      } else {
        pending += amt;
        unpaidList.push(b);
        if (b.paymentType === 'DINHEIRO') cashPending += amt;
        else pixPending += amt;

        const urg = computeBillUrgency(b.status, b.dueDate);
        if (urg.kind === 'overdue' || urg.kind === 'today' || urg.kind === 'soon') {
          urgentCount++;
        }
        if (b.status === 'ERROR') errorCount++;
      }
    }

    const pct = total > 0 ? Math.round((paid / total) * 100) : periodBills.length > 0 ? 100 : 0;
    return {
      total,
      paid,
      pending,
      pixPending,
      cashPending,
      urgentCount,
      errorCount,
      pct,
      unpaidList,
    };
  }, [periodBills, scopeUserId]);

  // Calendar Heatmap days in current selectedPeriod
  const dueDaysSummary = useMemo(() => {
    if (selectedPeriod === 'ALL') return [];
    const byDay = new Map<number, { day: number; count: number; allPaid: boolean; total: number }>();
    for (const b of periodBills) {
      if (!b.dueDate) continue;
      const d = new Date(b.dueDate);
      if (Number.isNaN(d.getTime())) continue;
      const day = d.getUTCDate();
      const cur = byDay.get(day) || { day, count: 0, allPaid: true, total: 0 };
      cur.count += 1;
      cur.total += effectiveAmount(b);
      if (b.status !== 'PAID') cur.allPaid = false;
      byDay.set(day, cur);
    }
    return Array.from(byDay.values()).sort((a, b) => a.day - b.day);
  }, [periodBills, selectedPeriod, scopeUserId]);

  const visibleBills = useMemo(() => {
    return periodBills.filter(b => {
      if (statusFilter === 'UNPAID' && b.status === 'PAID') return false;
      if (statusFilter === 'PAID' && b.status !== 'PAID') return false;
      if (selectedDay !== null && b.dueDate) {
        const d = new Date(b.dueDate).getUTCDate();
        if (d !== selectedDay) return false;
      } else if (selectedDay !== null && !b.dueDate) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          b.name.toLowerCase().includes(q) ||
          (b.company || '').toLowerCase().includes(q) ||
          b.paymentType.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [periodBills, statusFilter, selectedDay, searchQuery]);

  const copyQuickPix = async (e: React.MouseEvent, bill: ActiveBillItem) => {
    e.stopPropagation();
    const code = bill.pixCode || bill.barcode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(bill._id);
      navigator.vibrate?.(12);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore
    }
  };

  // Atmospheric gradient based on financial health
  const heroGradient =
    metrics.errorCount > 0
      ? 'from-rose-600/25 via-violet-600/15 to-[var(--wallet-surface)] border-rose-500/30'
      : metrics.pending === 0 && periodBills.length > 0
      ? 'from-emerald-600/25 via-teal-600/10 to-[var(--wallet-surface)] border-emerald-500/30'
      : metrics.urgentCount > 0
      ? 'from-amber-500/20 via-violet-600/15 to-[var(--wallet-surface)] border-amber-500/30'
      : 'from-violet-600/25 via-fuchsia-600/10 to-[var(--wallet-surface)] border-violet-500/30';

  return (
    <div className="space-y-5">
      {/* Scope Avatar Bar (Casa Inteira vs Moradores) */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => onSelectScopeUser('ALL')}
            className={`px-3.5 py-2 rounded-full text-xs font-bold flex items-center gap-2 shrink-0 transition cursor-pointer ${
              scopeUserId === 'ALL'
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
                : 'bg-[var(--wallet-surface)] border border-[var(--wallet-border)] text-[var(--wallet-muted)] hover:text-[var(--wallet-text)]'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            Casa Inteira
          </button>

          {activeResidents.map(u => {
            const selected = scopeUserId === u._id;
            return (
              <button
                key={u._id}
                type="button"
                onClick={() => onSelectScopeUser(u._id)}
                className={`pl-1.5 pr-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shrink-0 transition cursor-pointer ${
                  selected
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
                    : 'bg-[var(--wallet-surface)] border border-[var(--wallet-border)] text-[var(--wallet-muted)] hover:text-[var(--wallet-text)]'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full bg-gradient-to-br ${getAvatarGradient(
                    u.name
                  )} text-white text-[10px] font-bold flex items-center justify-center`}
                >
                  {getInitials(u.name)}
                </span>
                {u.name}
              </button>
            );
          })}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="px-3.5 py-2 rounded-full bg-[var(--wallet-surface)] border border-[var(--wallet-border-strong)] hover:border-violet-400 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="Sincronizar faturas (Gmail, APIs e Tabelas)"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-violet-400 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Atualizar'}</span>
            </button>
            <button
              type="button"
              onClick={onNewBill}
              className="p-2 sm:px-3.5 sm:py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-violet-600/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Lançar</span>
            </button>
          </div>
        )}
      </div>

      {/* Atmospheric Wallet Hero Card + Time Scrubber */}
      <div
        className={`rounded-3xl bg-gradient-to-br ${heroGradient} border p-5 md:p-6 shadow-xl space-y-5 transition-colors duration-500`}
      >
        {/* Horizontal Month Scrubber */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {periods.map(p => {
            const active = selectedPeriod === p.ref;
            const isAllPaid = p.total > 0 && p.unpaid <= 0.009;
            return (
              <button
                key={p.ref}
                type="button"
                onClick={() => {
                  onSelectPeriod(p.ref);
                  setSelectedDay(null);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shrink-0 transition cursor-pointer ${
                  active
                    ? 'bg-[var(--wallet-text)] text-[var(--wallet-bg)] shadow-md'
                    : 'bg-[var(--wallet-surface)]/80 border border-[var(--wallet-border)] text-[var(--wallet-muted)] hover:text-[var(--wallet-text)]'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isAllPaid
                      ? 'bg-emerald-400'
                      : p.total === 0
                      ? 'bg-slate-400/50'
                      : 'bg-violet-400'
                  }`}
                />
                {formatPeriodShort(p.ref)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              onSelectPeriod('ALL');
              setSelectedDay(null);
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition cursor-pointer ${
              selectedPeriod === 'ALL'
                ? 'bg-[var(--wallet-text)] text-[var(--wallet-bg)] shadow-md'
                : 'bg-[var(--wallet-surface)]/80 border border-[var(--wallet-border)] text-[var(--wallet-muted)] hover:text-[var(--wallet-text)]'
            }`}
          >
            Todos
          </button>
        </div>

        {/* Main Balance & Guided Pay CTA */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[var(--wallet-muted)] flex items-center gap-2">
              <span>
                {selectedPeriod === 'ALL'
                  ? 'Acumulado em aberto'
                  : `Falta quitar em ${formatPeriodLong(selectedPeriod)}`}
              </span>
              {scopeUserId !== 'ALL' && (
                <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-[11px] font-bold">
                  Sua cota
                </span>
              )}
            </div>
            <div className="text-3xl sm:text-4xl font-black tabular-nums tracking-tight">
              R$ {formatBRL(metrics.pending)}
            </div>
            <div className="text-xs text-[var(--wallet-muted)] tabular-nums">
              de <strong>R$ {formatBRL(metrics.total)}</strong> no período ·{' '}
              <span className="text-emerald-400 font-semibold">
                R$ {formatBRL(metrics.paid)} pagos ({metrics.pct}%)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isAdmin && metrics.unpaidList.length > 0 ? (
              <button
                type="button"
                onClick={() => onStartGuidedPay(metrics.unpaidList)}
                className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-extrabold shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                Quitar {metrics.unpaidList.length} fatura{metrics.unpaidList.length > 1 ? 's' : ''} agora
              </button>
            ) : periodBills.length > 0 ? (
              <div className="px-4 py-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Tudo em dia neste período!
              </div>
            ) : null}
          </div>
        </div>

        {/* Progress Bar + PIX vs Dinheiro Split Pills */}
        <div className="space-y-3">
          <div className="w-full h-2.5 rounded-full bg-black/20 overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, metrics.pct))}%` }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-0.5">
            <div className="px-3.5 py-2.5 rounded-2xl bg-[var(--wallet-surface)]/80 border border-[var(--wallet-border)] flex items-center justify-between">
              <span className="text-xs text-[var(--wallet-muted)] font-medium">⚡ PIX aberto</span>
              <strong className="text-xs font-extrabold tabular-nums">
                R$ {formatBRL(metrics.pixPending)}
              </strong>
            </div>
            <div className="px-3.5 py-2.5 rounded-2xl bg-[var(--wallet-surface)]/80 border border-[var(--wallet-border)] flex items-center justify-between">
              <span className="text-xs text-[var(--wallet-muted)] font-medium">💵 Dinheiro</span>
              <strong className="text-xs font-extrabold tabular-nums">
                R$ {formatBRL(metrics.cashPending)}
              </strong>
            </div>
            <div className="col-span-2 sm:col-span-1 px-3.5 py-2.5 rounded-2xl bg-[var(--wallet-surface)]/80 border border-[var(--wallet-border)] flex items-center justify-between">
              <span className="text-xs text-[var(--wallet-muted)] font-medium">Urgentes (≤4d)</span>
              <strong
                className={`text-xs font-extrabold tabular-nums ${
                  metrics.urgentCount > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {metrics.urgentCount === 0 ? 'Nenhuma' : `${metrics.urgentCount} conta(s)`}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Mini Due-Date Calendar Heatmap Strip */}
      {dueDaysSummary.length > 0 && (
        <div className="px-4 py-3 rounded-2xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] flex items-center gap-3 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--wallet-muted)] shrink-0">
            <Calendar className="w-3.5 h-3.5 text-violet-400" />
            Dias de saída:
          </div>
          <div className="flex items-center gap-2">
            {dueDaysSummary.map(d => {
              const isSelected = selectedDay === d.day;
              return (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => setSelectedDay(isSelected ? null : d.day)}
                  title={`Dia ${d.day}: R$ ${formatBRL(d.total)} (${d.count} conta${d.count > 1 ? 's' : ''})`}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold tabular-nums flex items-center gap-1.5 border transition cursor-pointer ${
                    isSelected
                      ? 'bg-violet-600 text-white border-violet-500'
                      : d.allPaid
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                      : 'bg-[var(--wallet-elevated)] border-[var(--wallet-border)] text-[var(--wallet-text)] hover:border-violet-400'
                  }`}
                >
                  <span>Dia {String(d.day).padStart(2, '0')}</span>
                  <span className="text-[10px] opacity-75">({d.count})</span>
                </button>
              );
            })}
            {selectedDay !== null && (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="text-xs text-violet-400 font-semibold px-2 cursor-pointer"
              >
                Limpar dia
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search & Status Filter Pills */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 bg-[var(--wallet-surface)] border border-[var(--wallet-border)] p-1 rounded-2xl self-start">
          {(
            [
              { id: 'ALL', label: `Todas (${periodBills.length})` },
              { id: 'UNPAID', label: `Abertas (${metrics.unpaidList.length})` },
              { id: 'PAID', label: `Pagas (${periodBills.length - metrics.unpaidList.length})` },
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-[var(--wallet-elevated)] text-[var(--wallet-text)] shadow-xs'
                  : 'text-[var(--wallet-muted)] hover:text-[var(--wallet-text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-3.5 h-3.5 text-[var(--wallet-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filtrar conta ou empresa..."
            className="w-full pl-9 pr-3.5 py-2 rounded-2xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] text-xs focus:outline-none focus:border-violet-500"
          />
        </div>
      </div>

      {/* Empty States or Tactile Bill Feed */}
      {visibleBills.length === 0 ? (
        <div className="p-10 rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/15 text-violet-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold">
            {configuredCount === 0
              ? 'Comece cadastrando suas contas recorrentes'
              : periodBills.length === 0
              ? 'Nenhuma fatura processada neste período'
              : 'Nenhuma fatura corresponde ao filtro atual'}
          </h3>
          <p className="text-xs text-[var(--wallet-muted)] max-w-md mx-auto">
            {configuredCount === 0
              ? 'Adicione suas contas de luz, água, internet ou compras parceladas na aba Catálogo ou crie um lançamento avulso agora.'
              : 'Clique em Atualizar para buscar automaticamente valores das Tabelas, Gmail (CPFL/CORSAN) e APIs.'}
          </p>
          {isAdmin && (
            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={onSync}
                className="px-4 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold cursor-pointer"
              >
                ↻ Processar faturas agora
              </button>
              <button
                type="button"
                onClick={onNewBill}
                className="px-4 py-2.5 rounded-2xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-xs font-bold cursor-pointer"
              >
                + Lançamento manual
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleBills.map(bill => {
            const isPaid = bill.status === 'PAID';
            const urg = computeBillUrgency(bill.status, bill.dueDate);
            const shareVal = effectiveAmount(bill);
            const hasQuickCode = Boolean(bill.pixCode || bill.barcode);
            const delta =
              bill.prevValue && bill.value !== null && bill.prevValue > 0
                ? Math.round(((bill.value - bill.prevValue) / bill.prevValue) * 100)
                : null;
            const currentDx = swipeState?.id === bill._id ? swipeState.dx : 0;

            const urgencyChipClass =
              urg.kind === 'paid'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : urg.kind === 'overdue' || urg.kind === 'error'
                ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                : urg.kind === 'today' || urg.kind === 'soon'
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : 'bg-[var(--wallet-elevated)] text-[var(--wallet-muted)] border-[var(--wallet-border)]';

            return (
              <div
                key={bill._id}
                onClick={() => onOpenBill(bill)}
                onTouchStart={e => {
                  touchStartX.current = e.touches[0].clientX;
                }}
                onTouchMove={e => {
                  if (touchStartX.current === null) return;
                  const dx = Math.max(-90, Math.min(90, e.touches[0].clientX - touchStartX.current));
                  setSwipeState({ id: bill._id, dx });
                }}
                onTouchEnd={() => {
                  if (swipeState?.id === bill._id) {
                    if (swipeState.dx >= 65 && isAdmin) {
                      navigator.vibrate?.(15);
                      onTogglePaid(bill);
                    } else if (swipeState.dx <= -65) {
                      onOpenBill(bill);
                    }
                  }
                  touchStartX.current = null;
                  setSwipeState(null);
                }}
                style={
                  currentDx !== 0
                    ? { transform: `translateX(${currentDx}px)` }
                    : undefined
                }
                className={`group rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] hover:border-violet-500/50 p-4 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-xs ${
                  isPaid ? 'opacity-70' : ''
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* 1-Click Tactile Check Circle */}
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={e => {
                      e.stopPropagation();
                      if (!isAdmin) return;
                      navigator.vibrate?.(12);
                      onTogglePaid(bill);
                    }}
                    title={isPaid ? 'Clique para reabrir fatura' : 'Marcar como paga'}
                    className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center transition cursor-pointer ${
                      isPaid
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                        : bill.status === 'ERROR'
                        ? 'border-2 border-rose-400 text-rose-400 hover:bg-rose-500/10'
                        : 'border-2 border-[var(--wallet-border-strong)] hover:border-emerald-400 hover:bg-emerald-500/10'
                    }`}
                  >
                    {isPaid ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : bill.status === 'ERROR' ? (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    ) : null}
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-bold truncate ${
                          isPaid ? 'line-through text-[var(--wallet-muted)]' : ''
                        }`}
                      >
                        {bill.name}
                      </span>

                      {bill.hasPdf && (
                        <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[10px] font-bold inline-flex items-center gap-1">
                          <FileText className="w-3 h-3" /> PDF
                        </span>
                      )}

                      {hasQuickCode && !isPaid && (
                        <button
                          type="button"
                          onClick={e => copyQuickPix(e, bill)}
                          className="px-2 py-0.5 rounded-full bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-500/25 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === bill._id ? (
                            <>
                              <Check className="w-3 h-3" /> Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> PIX
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Always-visible Due Date on Mobile + Desktop + History */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--wallet-muted)] mt-1">
                      <span className="font-semibold text-[var(--wallet-text)] tabular-nums">
                        Venc. {formatDueDayMonth(bill.dueDate)}
                      </span>
                      <span>·</span>
                      <span>{bill.paymentType === 'DINHEIRO' ? '💵 Dinheiro' : '⚡ PIX'}</span>
                      {selectedPeriod === 'ALL' && (
                        <>
                          <span>·</span>
                          <span className="tabular-nums">{bill.referencePeriod}</span>
                        </>
                      )}
                      {isPaid && bill.paidBy && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-400 font-medium">
                            Pago por {bill.paidBy}
                            {bill.paidAt ? ` (${formatDateTime(bill.paidAt)})` : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Side: Avatars + Value + Urgency Pill */}
                <div className="flex items-center gap-3 shrink-0">
                  {bill.users.length > 0 && (
                    <div className="hidden sm:flex -space-x-1.5">
                      {bill.users.slice(0, 4).map(uid => {
                        const u = usersById.get(uid);
                        const uName = u?.name || 'M';
                        return (
                          <span
                            key={uid}
                            title={uName}
                            className={`w-6 h-6 rounded-full bg-gradient-to-br ${getAvatarGradient(
                              uName
                            )} text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[var(--wallet-surface)]`}
                          >
                            {getInitials(uName)}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="text-right">
                    <div className="text-sm font-extrabold tabular-nums">
                      R$ {formatBRL(bill.value !== null ? shareVal : null)}
                    </div>
                    <div className="flex items-center justify-end gap-1.5 mt-0.5">
                      {delta !== null && Math.abs(delta) >= 2 && !isPaid && (
                        <span
                          className={`text-[10px] font-bold tabular-nums inline-flex items-center ${
                            delta > 0 ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                          title="Variação vs. mês anterior"
                        >
                          {delta > 0 ? (
                            <TrendingUp className="w-3 h-3 mr-0.5" />
                          ) : (
                            <TrendingDown className="w-3 h-3 mr-0.5" />
                          )}
                          {delta > 0 ? `+${delta}%` : `${delta}%`}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${urgencyChipClass}`}
                      >
                        {urg.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
