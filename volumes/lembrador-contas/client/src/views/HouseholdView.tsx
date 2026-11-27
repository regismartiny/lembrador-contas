import React, { useMemo, useState } from 'react';
import {
  Share2,
  Copy,
  Check,
  UserPlus,
  Shield,
  Edit3,
  Trash2,
  X,
  MessageCircle,
} from 'lucide-react';
import type { ActiveBillItem, ResidentUser } from '../types';
import {
  formatBRL,
  formatPeriodLong,
  getInitials,
  getAvatarGradient,
} from '../lib/format';

interface HouseholdViewProps {
  activeBills: ActiveBillItem[];
  users: ResidentUser[];
  selectedPeriod: string;
  isAdmin: boolean;
  onSaveUser: (
    payload: { name: string; email: string; admin: boolean; status: 'ACTIVE' | 'INACTIVE' },
    id?: string
  ) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  onSelectScopeAndGoWallet: (userId: string) => void;
}

export const HouseholdView: React.FC<HouseholdViewProps> = ({
  activeBills,
  users,
  selectedPeriod,
  isAdmin,
  onSaveUser,
  onDeleteUser,
  onSelectScopeAndGoWallet,
}) => {
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<ResidentUser | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [admin, setAdmin] = useState(false);
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const periodBills = useMemo(
    () =>
      activeBills.filter(b =>
        selectedPeriod === 'ALL' ? true : b.referencePeriod === selectedPeriod
      ),
    [activeBills, selectedPeriod]
  );

  const cards = useMemo(() => {
    return users.map(u => {
      const myBills = periodBills.filter(b => b.users.includes(u._id));
      let totalShare = 0;
      let paidShare = 0;
      let pendingShare = 0;
      let pixPending = 0;
      let cashPending = 0;
      const lines: Array<{ name: string; share: number; split: number; paid: boolean; paymentType: string }> = [];

      for (const b of myBills) {
        const split = Math.max(b.users.length, 1);
        const share = (b.value ?? 0) / split;
        totalShare += share;
        const paid = b.status === 'PAID';
        if (paid) paidShare += share;
        else {
          pendingShare += share;
          if (b.paymentType === 'DINHEIRO') cashPending += share;
          else pixPending += share;
        }
        lines.push({
          name: b.name,
          share,
          split,
          paid,
          paymentType: b.paymentType,
        });
      }

      return {
        user: u,
        billCount: myBills.length,
        totalShare,
        paidShare,
        pendingShare,
        pixPending,
        cashPending,
        lines,
      };
    });
  }, [users, periodBills]);

  const buildWhatsAppText = (card: (typeof cards)[number]) => {
    const periodTitle =
      selectedPeriod === 'ALL' ? 'Consolidado' : formatPeriodLong(selectedPeriod);
    const header = `*Resumo de Contas — ${periodTitle} (${card.user.name})*`;
    const items = card.lines
      .map(
        l =>
          `${l.paid ? '✅' : '⏳'} ${l.name}${
            l.split > 1 ? ` (1/${l.split})` : ''
          }: R$ ${formatBRL(l.share)} [${l.paymentType}]`
      )
      .join('\n');

    const footer = [
      '',
      `*Total da cota:* R$ ${formatBRL(card.totalShare)}`,
      `*Já quitado:* R$ ${formatBRL(card.paidShare)}`,
      `*Falta pagar:* R$ ${formatBRL(card.pendingShare)} (PIX: R$ ${formatBRL(
        card.pixPending
      )} · Dinheiro: R$ ${formatBRL(card.cashPending)})`,
    ].join('\n');

    return `${header}\n\n${items || 'Nenhuma fatura neste período.'}\n${footer}`;
  };

  const copySummary = async (card: (typeof cards)[number]) => {
    const text = buildWhatsAppText(card);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUserId(card.user._id);
      navigator.vibrate?.(15);
      setTimeout(() => setCopiedUserId(null), 2000);
    } catch {
      // ignore
    }
  };

  const openWhatsApp = (card: (typeof cards)[number]) => {
    const text = buildWhatsAppText(card);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const openEditor = (u?: ResidentUser) => {
    setFormError(null);
    if (u) {
      setEditingUser(u);
      setCreatingUser(false);
      setName(u.name);
      setEmail(u.email);
      setAdmin(u.admin);
      setStatus(u.status || 'ACTIVE');
    } else {
      setEditingUser(null);
      setCreatingUser(true);
      setName('');
      setEmail('');
      setAdmin(false);
      setStatus('ACTIVE');
    }
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await onSaveUser(
        { name: name.trim(), email: email.trim(), admin, status },
        editingUser?._id
      );
      setEditingUser(null);
      setCreatingUser(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar morador.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: ResidentUser) => {
    try {
      await onDeleteUser(u._id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível remover o morador.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">Casa & Divisão por Morador</h2>
          <p className="text-xs text-[var(--wallet-muted)]">
            {selectedPeriod === 'ALL'
              ? 'Rateio acumulado de todos os períodos'
              : `Cotas calculadas para ${formatPeriodLong(selectedPeriod)}`}{' '}
            · Compartilhe o fechamento em 1 toque
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => openEditor()}
            className="px-4 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-violet-600/20 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            Adicionar Morador
          </button>
        )}
      </div>

      {/* Resident Split Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(card => {
          const pct =
            card.totalShare > 0 ? Math.round((card.paidShare / card.totalShare) * 100) : 0;

          return (
            <div
              key={card.user._id}
              className="rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] p-5 space-y-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${getAvatarGradient(
                      card.user.name
                    )} text-white font-extrabold text-sm flex items-center justify-center shadow-md`}
                  >
                    {getInitials(card.user.name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-extrabold">{card.user.name}</h3>
                      {card.user.admin && (
                        <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 text-[10px] font-bold inline-flex items-center gap-1">
                          <Shield className="w-3 h-3" /> Admin
                        </span>
                      )}
                      {card.user.status === 'INACTIVE' && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 text-[10px] font-bold">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--wallet-muted)]">{card.user.email}</div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditor(card.user)}
                      className="p-2 rounded-xl hover:bg-[var(--wallet-elevated)] text-[var(--wallet-muted)] hover:text-[var(--wallet-text)] cursor-pointer"
                      title="Editar morador"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(card.user)}
                      className="p-2 rounded-xl hover:bg-rose-500/10 text-[var(--wallet-muted)] hover:text-rose-400 cursor-pointer"
                      title="Excluir morador"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Financial Split Summary */}
              <div className="p-4 rounded-2xl bg-[var(--wallet-elevated)] space-y-3">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-xs text-[var(--wallet-muted)]">Falta pagar</div>
                    <div className="text-2xl font-black tabular-nums">
                      R$ {formatBRL(card.pendingShare)}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-[var(--wallet-muted)]">
                      Cota total: <strong className="tabular-nums">R$ {formatBRL(card.totalShare)}</strong>
                    </div>
                    <div className="text-emerald-400 font-semibold tabular-nums">
                      ✓ R$ {formatBRL(card.paidShare)} ({pct}%)
                    </div>
                  </div>
                </div>

                <div className="w-full h-2 rounded-full bg-black/20 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-[var(--wallet-muted)] pt-1">
                  <span>⚡ PIX: R$ {formatBRL(card.pixPending)}</span>
                  <span>💵 Dinheiro: R$ {formatBRL(card.cashPending)}</span>
                  <span>{card.billCount} conta(s)</span>
                </div>
              </div>

              {/* Actions: WhatsApp Share + Copy + Filter Wallet */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => copySummary(card)}
                  className="py-2.5 px-3 rounded-2xl bg-[var(--wallet-elevated)] hover:border-violet-400 border border-[var(--wallet-border)] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedUserId === card.user._id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => openWhatsApp(card)}
                  className="py-2.5 px-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </button>

                <button
                  type="button"
                  onClick={() => onSelectScopeAndGoWallet(card.user._id)}
                  className="py-2.5 px-3 rounded-2xl bg-violet-500/15 border border-violet-500/30 text-violet-300 hover:bg-violet-500/25 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" /> Ver Carteira
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit User Modal */}
      {(creatingUser || editingUser) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs"
          onClick={() => {
            setCreatingUser(false);
            setEditingUser(null);
          }}
        >
          <form
            onSubmit={handleUserSubmit}
            onClick={e => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-md rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border-strong)] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">
                {editingUser ? 'Editar Morador' : 'Novo Morador da Casa'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setCreatingUser(false);
                  setEditingUser(null);
                }}
                className="p-1.5 rounded-full bg-[var(--wallet-elevated)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex.: Ana Clara"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  E-mail (usado no login / Cloudflare Access)
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="ana@exemplo.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--wallet-elevated)]">
                <div>
                  <div className="text-xs font-bold">Permissão de Administrador</div>
                  <div className="text-[11px] text-[var(--wallet-muted)]">
                    Pode sincronizar, editar contas e dar baixa
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={admin}
                  onChange={e => setAdmin(e.target.checked)}
                  className="w-4 h-4 accent-violet-600"
                />
              </div>

              {editingUser && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                    Situação
                  </label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                  >
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCreatingUser(false);
                  setEditingUser(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-[var(--wallet-elevated)] text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold cursor-pointer"
              >
                {saving ? 'Salvando...' : 'Salvar morador'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
