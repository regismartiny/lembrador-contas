const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCurrencyFull(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'R$ —';
  return `R$ ${formatBRL(value)}`;
}

export function parseRefPeriod(ref: string): { month: number; year: number; key: number } | null {
  if (!ref) return null;
  const parts = ref.split('/');
  if (parts.length !== 2) return null;
  const month = Number(parts[0]);
  const year = Number(parts[1]);
  if (!month || !year || month < 1 || month > 12) return null;
  return { month, year, key: year * 12 + (month - 1) };
}

export function formatPeriodShort(ref: string): string {
  const p = parseRefPeriod(ref);
  if (!p) return ref;
  return `${MONTH_SHORT[p.month - 1]}/${String(p.year).slice(-2)}`;
}

export function formatPeriodLong(ref: string): string {
  const p = parseRefPeriod(ref);
  if (!p) return ref || 'Período';
  return `${MONTH_FULL[p.month - 1]} ${p.year}`;
}

export function currentRefPeriod(): string {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
}

export function formatDueDayMonth(isoDate: string | null): string {
  if (!isoDate) return 'Sem data';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'Sem data';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

export function formatFullDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function formatDateTime(isoDate: string | null): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type UrgencyKind = 'paid' | 'error' | 'overdue' | 'today' | 'soon' | 'upcoming';

export function computeBillUrgency(
  status: string,
  dueDateIso: string | null
): { kind: UrgencyKind; label: string; daysDiff: number | null } {
  if (status === 'PAID') {
    return { kind: 'paid', label: 'Pago', daysDiff: null };
  }
  if (status === 'ERROR') {
    return { kind: 'error', label: 'Revisar valor', daysDiff: null };
  }
  if (!dueDateIso) {
    return { kind: 'upcoming', label: 'A vencer', daysDiff: null };
  }

  const due = new Date(dueDateIso);
  if (Number.isNaN(due.getTime())) {
    return { kind: 'upcoming', label: 'A vencer', daysDiff: null };
  }

  const now = new Date();
  const todayMidnight = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dueMidnight = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const diffDays = Math.round((dueMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const late = Math.abs(diffDays);
    return {
      kind: 'overdue',
      label: late === 1 ? 'Atrasada há 1d' : `Atrasada há ${late}d`,
      daysDiff: diffDays,
    };
  }
  if (diffDays === 0) {
    return { kind: 'today', label: 'Vence hoje', daysDiff: 0 };
  }
  if (diffDays === 1) {
    return { kind: 'soon', label: 'Vence amanhã', daysDiff: 1 };
  }
  if (diffDays <= 4) {
    return { kind: 'soon', label: `Em ${diffDays} dias`, daysDiff: diffDays };
  }
  return { kind: 'upcoming', label: `Dia ${String(due.getUTCDate()).padStart(2, '0')}`, daysDiff: diffDays };
}

export function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const AVATAR_GRADIENTS = [
  'from-violet-500 to-fuchsia-500',
  'from-emerald-500 to-teal-500',
  'from-sky-500 to-indigo-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-cyan-500 to-blue-500',
];

export function getAvatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}
