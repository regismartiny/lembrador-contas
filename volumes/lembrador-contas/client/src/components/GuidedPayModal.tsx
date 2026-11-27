import React, { useState } from 'react';
import {
  X,
  Zap,
  Copy,
  Check,
  FileText,
  ArrowRight,
  PartyPopper,
  CheckCircle2,
} from 'lucide-react';
import type { ActiveBillItem, ResidentUser } from '../types';
import {
  formatBRL,
  formatFullDate,
  computeBillUrgency,
  getInitials,
  getAvatarGradient,
} from '../lib/format';

interface GuidedPayModalProps {
  bills: ActiveBillItem[];
  users: ResidentUser[];
  scopeUserId: string;
  onClose: () => void;
  onPayBill: (bill: ActiveBillItem) => Promise<void>;
}

export const GuidedPayModal: React.FC<GuidedPayModalProps> = ({
  bills,
  users,
  scopeUserId,
  onClose,
  onPayBill,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paidIds, setPaidIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [busy, setBusy] = useState(false);

  const usersById = new Map(users.map(u => [u._id, u]));
  const totalCount = bills.length;
  const current = bills[currentIndex];
  const finished = currentIndex >= totalCount || totalCount === 0;

  const getScopedAmount = (b: ActiveBillItem) => {
    const val = b.value ?? 0;
    if (scopeUserId === 'ALL') return val;
    const count = Math.max(b.users.length, 1);
    return val / count;
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      navigator.vibrate?.(15);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleConfirmAndNext = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await onPayBill(current);
      navigator.vibrate?.([15, 30, 20]);
      setPaidIds(prev => [...prev, current._id]);
      setShowPdf(false);
      setCurrentIndex(i => i + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-sheet-up w-full max-w-md rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border-strong)] p-6 shadow-2xl space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-violet-400">
            <Zap className="w-4 h-4" />
            Modo Pagamento Guiado
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-[var(--wallet-elevated)] hover:opacity-80 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {finished ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto">
              <PartyPopper className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold">Sessão concluída!</h3>
              <p className="text-sm text-[var(--wallet-muted)] mt-1">
                {paidIds.length > 0
                  ? `Você deu baixa em ${paidIds.length} fatura${paidIds.length > 1 ? 's' : ''} com histórico salvo.`
                  : 'Nenhuma fatura pendente restante nesta fila.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold cursor-pointer"
            >
              Voltar para a Carteira
            </button>
          </div>
        ) : (
          <>
            {/* Progress Pills */}
            <div className="flex items-center gap-1.5">
              {bills.map((b, idx) => (
                <div
                  key={b._id}
                  className={`h-1.5 flex-1 rounded-full transition-all ${
                    idx < currentIndex
                      ? 'bg-emerald-500'
                      : idx === currentIndex
                      ? 'bg-violet-500'
                      : 'bg-[var(--wallet-elevated)]'
                  }`}
                />
              ))}
            </div>

            {/* Active Card */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-violet-600/15 via-fuchsia-600/5 to-[var(--wallet-elevated)] border border-violet-500/30 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-[var(--wallet-muted)]">
                    Conta {currentIndex + 1} de {totalCount} · {current.paymentType}
                  </div>
                  <h3 className="text-lg font-extrabold mt-0.5">{current.name}</h3>
                  {current.company && (
                    <div className="text-xs text-[var(--wallet-muted)]">{current.company}</div>
                  )}
                </div>
                <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                  {computeBillUrgency(current.status, current.dueDate).label}
                </span>
              </div>

              <div>
                <div className="text-xs text-[var(--wallet-muted)]">
                  {scopeUserId === 'ALL' ? 'Valor integral a pagar' : 'Sua cota rateada'}
                </div>
                <div className="text-3xl font-black tabular-nums tracking-tight mt-0.5">
                  R$ {formatBRL(getScopedAmount(current))}
                </div>
                {scopeUserId !== 'ALL' && current.users.length > 1 && (
                  <div className="text-xs text-[var(--wallet-muted)] tabular-nums mt-0.5">
                    1/{current.users.length} do total integral de R$ {formatBRL(current.value)}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--wallet-border)]">
                <span className="text-[var(--wallet-muted)]">
                  Vencimento: <strong className="text-[var(--wallet-text)]">{formatFullDate(current.dueDate)}</strong>
                </span>
                <div className="flex -space-x-1.5">
                  {current.users.map(uid => {
                    const u = usersById.get(uid);
                    const name = u?.name || 'Morador';
                    return (
                      <span
                        key={uid}
                        title={name}
                        className={`w-6 h-6 rounded-full bg-gradient-to-br ${getAvatarGradient(
                          name
                        )} text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[var(--wallet-surface)]`}
                      >
                        {getInitials(name)}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* PIX / Barcode Copy inside Guided Flow */}
              {(current.pixCode || current.barcode) && (
                <button
                  type="button"
                  onClick={() => handleCopy(current.pixCode || current.barcode)}
                  className="w-full py-2.5 px-3.5 rounded-2xl bg-[var(--wallet-surface)] border border-violet-500/40 flex items-center justify-between text-xs font-bold hover:border-violet-400 transition cursor-pointer"
                >
                  <span className="truncate mr-2 font-mono text-[var(--wallet-muted)]">
                    {current.pixCode || current.barcode}
                  </span>
                  <span className="shrink-0 flex items-center gap-1 text-violet-400">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copiado!' : 'Copiar PIX'}
                  </span>
                </button>
              )}

              {/* Optional PDF Toggle inside Guided Flow */}
              {current.hasPdf && current.pdfUrl && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowPdf(v => !v)}
                    className="w-full py-2 px-3 rounded-xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-violet-400" />
                    {showPdf ? 'Ocultar fatura PDF' : 'Conferir fatura em PDF'}
                  </button>
                  {showPdf && (
                    <iframe
                      src={current.pdfUrl}
                      title={current.name}
                      className="w-full h-52 rounded-xl border border-[var(--wallet-border)] bg-black/20"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowPdf(false);
                  setCurrentIndex(i => i + 1);
                }}
                className="px-4 py-3 rounded-2xl bg-[var(--wallet-elevated)] text-xs font-bold text-[var(--wallet-muted)] hover:text-[var(--wallet-text)] cursor-pointer"
              >
                Pular
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmAndNext}
                className="flex-1 py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-extrabold shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {busy ? 'Confirmando...' : 'Já paguei, próxima'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
