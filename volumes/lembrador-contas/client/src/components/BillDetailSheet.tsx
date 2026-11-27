import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Copy,
  Check,
  FileText,
  ExternalLink,
  Upload,
  Trash2,
  Sparkles,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import type { ActiveBillItem, AvailablePdfFile, PaymentType, ResidentUser } from '../types';
import {
  formatBRL,
  formatDateTime,
  getInitials,
  getAvatarGradient,
  currentRefPeriod,
} from '../lib/format';

interface BillDetailSheetProps {
  bill: ActiveBillItem | null;
  isNew?: boolean;
  defaultPeriod?: string;
  users: ResidentUser[];
  availablePdfs: AvailablePdfFile[];
  isAdmin: boolean;
  onClose: () => void;
  onTogglePaid: (bill: ActiveBillItem) => Promise<void>;
  onSave: (payload: Partial<ActiveBillItem> & { name: string }, existingId?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUploadPdf: (id: string, file: File) => Promise<void>;
}

export const BillDetailSheet: React.FC<BillDetailSheetProps> = ({
  bill,
  isNew = false,
  defaultPeriod,
  users,
  availablePdfs,
  isAdmin,
  onClose,
  onTogglePaid,
  onSave,
  onDelete,
  onUploadPdf,
}) => {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [valueStr, setValueStr] = useState('');
  const [dueDateStr, setDueDateStr] = useState('');
  const [referencePeriod, setReferencePeriod] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('PIX');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [pixCode, setPixCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [notes, setNotes] = useState('');
  const [attachmentFilename, setAttachmentFilename] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) {
      const todayIso = new Date().toISOString().slice(0, 10);
      setName('');
      setCompany('');
      setValueStr('');
      setDueDateStr(todayIso);
      setReferencePeriod(defaultPeriod || currentRefPeriod());
      setPaymentType('PIX');
      setSelectedUsers(users.filter(u => u.status === 'ACTIVE').map(u => u._id));
      setPixCode('');
      setBarcode('');
      setNotes('');
      setAttachmentFilename('');
      setError(null);
      setConfirmDelete(false);
      return;
    }
    if (bill) {
      setName(bill.name || '');
      setCompany(bill.company || '');
      setValueStr(bill.value !== null && bill.value !== undefined ? bill.value.toFixed(2).replace('.', ',') : '');
      setDueDateStr(bill.dueDate ? bill.dueDate.slice(0, 10) : '');
      setReferencePeriod(bill.referencePeriod || currentRefPeriod());
      setPaymentType((bill.paymentType as PaymentType) || 'PIX');
      setSelectedUsers(bill.users || []);
      setPixCode(bill.pixCode || '');
      setBarcode(bill.barcode || '');
      setNotes(bill.notes || '');
      setAttachmentFilename(bill.attachmentFilename || '');
      setError(null);
      setConfirmDelete(false);
    }
  }, [bill, isNew, defaultPeriod, users]);

  if (!bill && !isNew) return null;

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      navigator.vibrate?.(12);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // clipboard fallback ignored
    }
  };

  const toggleUser = (uid: string) => {
    if (!isAdmin) return;
    setSelectedUsers(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Informe o nome da fatura.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parsedVal =
        valueStr.trim() === ''
          ? null
          : Number(valueStr.replace(/\./g, '').replace(',', '.'));
      if (parsedVal !== null && Number.isNaN(parsedVal)) {
        setError('Informe um valor numérico válido (ex.: 149,90).');
        setSaving(false);
        return;
      }

      await onSave(
        {
          name: name.trim(),
          company: company.trim(),
          value: parsedVal,
          dueDate: dueDateStr ? `${dueDateStr}T12:00:00.000Z` : null,
          referencePeriod: referencePeriod.trim(),
          paymentType,
          users: selectedUsers,
          pixCode: pixCode.trim(),
          barcode: barcode.trim(),
          notes: notes.trim(),
          attachmentFilename: attachmentFilename.trim(),
        },
        isNew ? undefined : bill?._id
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar fatura.');
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bill?._id) return;
    setUploading(true);
    setError(null);
    try {
      await onUploadPdf(bill._id, file);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao anexar PDF.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const isPaid = bill?.status === 'PAID';
  const shareCount = Math.max(selectedUsers.length, 1);
  const numericPreview =
    valueStr.trim() !== ''
      ? Number(valueStr.replace(/\./g, '').replace(',', '.'))
      : bill?.value ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="animate-sheet-up w-full md:max-w-xl bg-[var(--wallet-surface)] border-t md:border-t-0 md:border-l border-[var(--wallet-border-strong)] rounded-t-3xl md:rounded-none max-h-[92vh] md:max-h-screen flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Grabber (Mobile) + Header */}
        <div className="pt-2.5 px-5 pb-4 border-b border-[var(--wallet-border)] shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--wallet-border-strong)] mx-auto mb-3 md:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                {isNew ? 'Novo Lançamento Mensal' : bill?.company || 'Detalhes da Fatura'}
              </span>
              <h2 className="text-lg font-bold leading-snug mt-0.5">
                {isNew ? 'Adicionar conta na carteira' : bill?.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-[var(--wallet-elevated)] hover:opacity-80 transition"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Payment Status Hero Strip */}
          {!isNew && bill && (
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border)]">
              <div className="flex items-center gap-2.5">
                {isPaid ? (
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                ) : bill.status === 'ERROR' ? (
                  <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                    <Clock className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <div className="text-xs font-bold">
                    {isPaid
                      ? `Quitada${bill.paidBy ? ` por ${bill.paidBy}` : ''}`
                      : bill.status === 'ERROR'
                      ? 'Extração pendente de revisão'
                      : 'Pagamento pendente'}
                  </div>
                  <div className="text-xs text-[var(--wallet-muted)]">
                    {isPaid && bill.paidAt
                      ? `Em ${formatDateTime(bill.paidAt)}`
                      : `Referência ${bill.referencePeriod}`}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onTogglePaid(bill)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isPaid
                      ? 'bg-[var(--wallet-surface)] border border-[var(--wallet-border-strong)] hover:border-amber-400/60'
                      : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400'
                  }`}
                >
                  {isPaid ? 'Estornar baixa' : '✓ Confirmar pagamento'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 font-medium">
              {error}
            </div>
          )}

          {/* Quick PIX / Barcode Action Box */}
          {!isNew && (pixCode || barcode) && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-transparent border border-violet-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5 text-violet-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  Pagamento Rápido ({pixCode ? 'PIX Copia e Cola / Chave' : 'Código de Barras'})
                </span>
                <button
                  type="button"
                  onClick={() => copyText(pixCode || barcode, 'main-code')}
                  className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedKey === 'main-code' ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar código
                    </>
                  )}
                </button>
              </div>
              <div className="p-2.5 rounded-xl bg-black/25 font-mono text-xs break-all text-[var(--wallet-muted)] select-all">
                {pixCode || barcode}
              </div>
            </div>
          )}

          {/* Direct PDF Viewer & Upload Section */}
          {!isNew && bill && (
            <div className="rounded-2xl border border-[var(--wallet-border)] bg-[var(--wallet-elevated)] overflow-hidden">
              <div className="p-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-bold">
                    {bill.hasPdf ? 'Fatura em PDF Anexada' : 'Documento PDF da Fatura'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {bill.hasPdf && bill.pdfUrl && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowPdfPreview(v => !v)}
                        className="px-2.5 py-1 rounded-lg bg-[var(--wallet-surface)] border border-[var(--wallet-border)] text-xs font-medium cursor-pointer"
                      >
                        {showPdfPreview ? 'Ocultar PDF' : 'Visualizar aqui'}
                      </button>
                      <a
                        href={bill.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-violet-600/20 text-violet-300 border border-violet-500/30 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        Abrir <ExternalLink className="w-3 h-3" />
                      </a>
                    </>
                  )}
                  {isAdmin && (
                    <label className="px-2.5 py-1 rounded-lg bg-[var(--wallet-surface)] border border-[var(--wallet-border-strong)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:border-violet-400 transition">
                      <Upload className="w-3.5 h-3.5" />
                      {uploading ? 'Enviando...' : bill.hasPdf ? 'Trocar PDF' : 'Enviar PDF'}
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={uploading}
                      />
                    </label>
                  )}
                </div>
              </div>

              {bill.hasPdf && bill.pdfUrl && showPdfPreview && (
                <div className="border-t border-[var(--wallet-border)] bg-black/20">
                  <iframe
                    src={bill.pdfUrl}
                    title={`PDF ${bill.name}`}
                    className="w-full h-72"
                  />
                </div>
              )}

              {!bill.hasPdf && isAdmin && availablePdfs.length > 0 && (
                <div className="px-3.5 pb-3.5 pt-1 border-t border-[var(--wallet-border)]">
                  <label className="block text-xs text-[var(--wallet-muted)] mb-1.5">
                    Ou vincular PDF já baixado automaticamente em <code className="font-mono">downloads/</code>:
                  </label>
                  <select
                    value={attachmentFilename}
                    onChange={e => setAttachmentFilename(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--wallet-surface)] border border-[var(--wallet-border-strong)] text-xs"
                  >
                    <option value="">— Nenhum arquivo selecionado —</option>
                    {availablePdfs.map(f => (
                      <option key={f.filename} value={f.filename}>
                        {f.filename} ({Math.round(f.sizeBytes / 1024)} KB)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Main Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                Nome da Conta
              </label>
              <input
                type="text"
                value={name}
                disabled={!isAdmin}
                onChange={e => setName(e.target.value)}
                placeholder="Ex.: Energia Elétrica, Água, Condomínio"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm font-medium focus:outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                Valor Integral (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={valueStr}
                disabled={!isAdmin}
                onChange={e => setValueStr(e.target.value)}
                placeholder="0,00"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm font-bold tabular-nums focus:outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                Data de Vencimento
              </label>
              <input
                type="date"
                value={dueDateStr}
                disabled={!isAdmin}
                onChange={e => setDueDateStr(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm tabular-nums focus:outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                Mês de Referência (MM/AAAA)
              </label>
              <input
                type="text"
                value={referencePeriod}
                disabled={!isAdmin}
                onChange={e => setReferencePeriod(e.target.value)}
                placeholder="11/2026"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm tabular-nums focus:outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                Meio de Pagamento
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['PIX', 'DINHEIRO'] as PaymentType[]).map(pt => (
                  <button
                    key={pt}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => setPaymentType(pt)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      paymentType === pt
                        ? 'bg-violet-600/20 border-violet-500 text-violet-300'
                        : 'bg-[var(--wallet-elevated)] border-[var(--wallet-border)] text-[var(--wallet-muted)]'
                    }`}
                  >
                    {pt === 'PIX' ? '⚡ PIX' : '💵 Dinheiro'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Residents Split Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[var(--wallet-muted)]">
                Rateio entre Moradores ({selectedUsers.length} selecionado{selectedUsers.length === 1 ? '' : 's'})
              </label>
              {!Number.isNaN(numericPreview) && numericPreview > 0 && selectedUsers.length > 0 && (
                <span className="text-xs font-bold text-violet-400 tabular-nums">
                  R$ {formatBRL(numericPreview / shareCount)} / pessoa
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {users.map(u => {
                const active = selectedUsers.includes(u._id);
                return (
                  <button
                    key={u._id}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => toggleUser(u._id)}
                    className={`px-3 py-2 rounded-2xl border text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                      active
                        ? 'bg-violet-500/15 border-violet-500 text-[var(--wallet-text)] shadow-xs'
                        : 'bg-[var(--wallet-elevated)] border-[var(--wallet-border)] text-[var(--wallet-muted)] opacity-70'
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
          </div>

          {/* PIX / Barcode / Notes */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                Código PIX Copia e Cola ou Chave PIX
              </label>
              <input
                type="text"
                value={pixCode}
                disabled={!isAdmin}
                onChange={e => setPixCode(e.target.value)}
                placeholder="Cole aqui o PIX Copia e Cola ou chave do favorecido..."
                className="w-full px-3.5 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border)] text-xs font-mono focus:outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                Observações (Opcional)
              </label>
              <input
                type="text"
                value={notes}
                disabled={!isAdmin}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ex.: Conta veio mais alta por bandeira vermelha..."
                className="w-full px-3.5 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border)] text-xs focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          {/* Footer Actions */}
          {isAdmin && (
            <div className="pt-3 border-t border-[var(--wallet-border)] flex items-center justify-between gap-3">
              {!isNew && bill ? (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await onDelete(bill._id);
                        onClose();
                      }}
                      className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                    >
                      Confirmar exclusão
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-2.5 py-2 rounded-xl text-xs text-[var(--wallet-muted)] cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="p-2.5 rounded-xl text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                    title="Excluir lançamento"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-[var(--wallet-elevated)] text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-lg shadow-violet-600/25 transition cursor-pointer"
                >
                  {saving ? 'Salvando...' : isNew ? 'Criar lançamento' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
