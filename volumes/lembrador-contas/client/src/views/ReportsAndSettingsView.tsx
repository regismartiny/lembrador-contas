import React, { useEffect, useState, useCallback } from 'react';
import {
  Download,
  Printer,
  Database,
  Upload,
  Bell,
  BellRing,
  CheckCircle2,
  BarChart3,
} from 'lucide-react';
import type { ReportSummaryResponse, ResidentUser } from '../types';
import { formatBRL } from '../lib/format';
import { apiFetch } from '../lib/api';

interface ReportsAndSettingsViewProps {
  users: ResidentUser[];
  isAdmin: boolean;
  vapidPublicKey: string | null | undefined;
  onRefreshBootstrap: () => Promise<void>;
}

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const ReportsAndSettingsView: React.FC<ReportsAndSettingsViewProps> = ({
  users,
  isAdmin,
  vapidPublicKey,
  onRefreshBootstrap,
}) => {
  const [userId, setUserId] = useState('ALL');
  const [startPeriod, setStartPeriod] = useState('');
  const [endPeriod, setEndPeriod] = useState('');
  const [reportData, setReportData] = useState<ReportSummaryResponse | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Backup state
  const [dbStats, setDbStats] = useState<{
    totalDocuments: number;
    collections: Array<{ key: string; label: string; count: number }>;
  } | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [backupMessage, setBackupMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [importing, setImporting] = useState(false);

  // Push Notification state
  const [pushStatus, setPushStatus] = useState<string>('');

  const loadReport = useCallback(async () => {
    setLoadingReport(true);
    try {
      const qs = new URLSearchParams();
      if (userId) qs.set('userId', userId);
      if (startPeriod) qs.set('startPeriod', startPeriod);
      if (endPeriod) qs.set('endPeriod', endPeriod);
      const data = await apiFetch<ReportSummaryResponse>(`/api/reports?${qs.toString()}`);
      setReportData(data);
    } finally {
      setLoadingReport(false);
    }
  }, [userId, startPeriod, endPeriod]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (isAdmin) {
      apiFetch<{
        stats: {
          totalDocuments: number;
          collections: Array<{ key: string; label: string; count: number }>;
        };
      }>('/api/backup/stats')
        .then(res => setDbStats(res.stats))
        .catch(() => {});
    }
  }, [isAdmin]);

  const applyPreset = (preset: 'current' | '3m' | '6m' | 'year' | 'all') => {
    const now = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    if (preset === 'current') {
      const cur = fmt(now);
      setStartPeriod(cur);
      setEndPeriod(cur);
    } else if (preset === '3m') {
      setStartPeriod(fmt(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
      setEndPeriod(fmt(now));
    } else if (preset === '6m') {
      setStartPeriod(fmt(new Date(now.getFullYear(), now.getMonth() - 5, 1)));
      setEndPeriod(fmt(now));
    } else if (preset === 'year') {
      setStartPeriod(`${now.getFullYear()}-01`);
      setEndPeriod(`${now.getFullYear()}-12`);
    } else {
      setStartPeriod('');
      setEndPeriod('');
    }
  };

  const handleSubscribePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('Este navegador não suporta Web Push.');
      return;
    }
    if (!vapidPublicKey) {
      setPushStatus('Chave VAPID_PUBLIC_KEY não configurada no servidor.');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setPushStatus('Permissão de notificação negada.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const appKey = urlB64ToUint8Array(vapidPublicKey);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey as unknown as BufferSource,
      });
      await apiFetch('/notifications/push/register', {
        method: 'POST',
        body: JSON.stringify({ subscription: sub }),
      });
      setPushStatus('Notificações ativadas neste dispositivo!');
    } catch (err: unknown) {
      setPushStatus(err instanceof Error ? err.message : 'Falha ao ativar notificações.');
    }
  };

  const handleSendTestPush = async () => {
    try {
      await apiFetch('/notifications/push/send', { method: 'POST' });
      setPushStatus('Verificação de lembretes disparada com sucesso!');
    } catch (err: unknown) {
      setPushStatus(err instanceof Error ? err.message : 'Erro ao disparar push.');
    }
  };

  const handleBackupImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setBackupMessage(null);
    try {
      const fd = new FormData();
      fd.append('backupFile', file);
      fd.append('mode', importMode);
      const res = await apiFetch<{ message: string; stats: typeof dbStats }>('/backup/import', {
        method: 'POST',
        body: fd,
      });
      setBackupMessage({ text: res.message, ok: true });
      if (res.stats) setDbStats(res.stats);
      await onRefreshBootstrap();
      await loadReport();
    } catch (err: unknown) {
      setBackupMessage({
        text: err instanceof Error ? err.message : 'Falha ao importar backup.',
        ok: false,
      });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const report = reportData?.report;
  const maxMonthTotal = Math.max(
    1,
    ...(report?.months.map(m => m.totalValue) || [1])
  );

  return (
    <div className="space-y-6">
      {/* Header & Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">Relatórios, Alertas & Backup</h2>
          <p className="text-xs text-[var(--wallet-muted)]">
            Histórico analítico de despesas, notificações push e segurança dos dados
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          {reportData?.exportCsvUrl && (
            <a
              href={reportData.exportCsvUrl}
              className="px-3.5 py-2 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Exportar CSV
            </a>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-2xl bg-violet-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] p-4 space-y-3 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
              Escopo
            </label>
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border)] text-xs font-semibold"
            >
              <option value="ALL">Casa Inteira (Consolidado)</option>
              {users.map(u => (
                <option key={u._id} value={u._id}>
                  Cota de {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
              Mês Inicial
            </label>
            <input
              type="month"
              value={startPeriod}
              onChange={e => setStartPeriod(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border)] text-xs tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
              Mês Final
            </label>
            <input
              type="month"
              value={endPeriod}
              onChange={e => setEndPeriod(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border)] text-xs tabular-nums"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-[var(--wallet-muted)] mr-1">Períodos rápidos:</span>
          {[
            { id: 'current', label: 'Mês atual' },
            { id: '3m', label: 'Últimos 3m' },
            { id: '6m', label: 'Últimos 6m' },
            { id: 'year', label: 'Este ano' },
            { id: 'all', label: 'Tudo' },
          ].map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id as 'current' | '3m' | '6m' | 'year' | 'all')}
              className="px-3 py-1 rounded-full bg-[var(--wallet-elevated)] hover:border-violet-400 border border-[var(--wallet-border)] text-xs font-semibold cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Summary + Monthly Visual Evolution Chart */}
      {loadingReport ? (
        <div className="p-8 text-center text-xs text-[var(--wallet-muted)]">
          Calculando relatório...
        </div>
      ) : report ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)]">
              <div className="text-xs text-[var(--wallet-muted)]">Total no Período</div>
              <div className="text-2xl font-black tabular-nums mt-1">
                R$ {formatBRL(report.summary.totalValue)}
              </div>
              <div className="text-xs text-[var(--wallet-muted)] mt-0.5">
                {report.summary.totalBills} fatura(s) em {report.summary.monthsCount} mês(es)
              </div>
            </div>
            <div className="p-4 rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)]">
              <div className="text-xs text-[var(--wallet-muted)]">Total Quitado</div>
              <div className="text-2xl font-black tabular-nums text-emerald-400 mt-1">
                R$ {formatBRL(report.summary.paidValue)}
              </div>
              <div className="text-xs text-[var(--wallet-muted)] mt-0.5">
                {report.summary.paidCount} conta(s) pagas
              </div>
            </div>
            <div className="p-4 rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)]">
              <div className="text-xs text-[var(--wallet-muted)]">Pendente</div>
              <div className="text-2xl font-black tabular-nums text-amber-400 mt-1">
                R$ {formatBRL(report.summary.unpaidValue)}
              </div>
              <div className="text-xs text-[var(--wallet-muted)] mt-0.5">
                {report.summary.unpaidCount} em aberto
              </div>
            </div>
          </div>

          {/* Interactive Monthly Bar Chart */}
          {report.months.length > 0 && (
            <div className="rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-extrabold">
                  <BarChart3 className="w-4 h-4 text-violet-400" />
                  Evolução Mensal (Pago vs. Aberto)
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--wallet-muted)]">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" /> Pago
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-violet-500 inline-block" /> Aberto
                  </span>
                </div>
              </div>

              <div className="flex items-end gap-3 overflow-x-auto pt-4 pb-1 min-h-44">
                {report.months.map(m => {
                  const totalPct = Math.max(8, Math.round((m.totalValue / maxMonthTotal) * 120));
                  const paidRatio = m.totalValue > 0 ? (m.paidValue / m.totalValue) * 100 : 0;
                  return (
                    <div
                      key={m.month}
                      className="flex flex-col items-center gap-2 min-w-16 flex-1"
                    >
                      <span className="text-[10px] font-bold tabular-nums text-[var(--wallet-muted)]">
                        R$ {formatBRL(m.totalValue)}
                      </span>
                      <div
                        style={{ height: `${totalPct}px` }}
                        className="w-9 rounded-2xl bg-violet-500/35 overflow-hidden flex flex-col justify-end border border-violet-500/30"
                      >
                        <div
                          style={{ height: `${paidRatio}%` }}
                          className="w-full bg-emerald-500 transition-all"
                        />
                      </div>
                      <span className="text-xs font-bold tabular-nums">{m.formattedMonth}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Device Push Notifications & Admin Database Backup */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
        {/* Web Push Card */}
        <div className="rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-violet-500/15 text-violet-400 flex items-center justify-center">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold">Alertas de Vencimento (Web Push)</h3>
              <p className="text-xs text-[var(--wallet-muted)]">
                Receba avisos no celular ou navegador antes de cada conta vencer
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSubscribePush}
              className="px-4 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5" /> Ativar neste aparelho
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={handleSendTestPush}
                className="px-3.5 py-2.5 rounded-2xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-xs font-bold cursor-pointer"
              >
                Disparar verificação agora
              </button>
            )}
          </div>

          {pushStatus && (
            <div className="text-xs text-violet-300 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> {pushStatus}
            </div>
          )}
        </div>

        {/* Backup & Restore Card */}
        {isAdmin && (
          <div className="rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold">Backup & Restauração (.zip)</h3>
                  <p className="text-xs text-[var(--wallet-muted)]">
                    {dbStats
                      ? `${dbStats.totalDocuments} documentos salvos no MongoDB`
                      : 'Exporte ou restaure todas as coleções'}
                  </p>
                </div>
              </div>
              <a
                href="/backup/download"
                className="px-3.5 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Baixar ZIP
              </a>
            </div>

            <div className="pt-2 border-t border-[var(--wallet-border)] flex flex-wrap items-center justify-between gap-2">
              <select
                value={importMode}
                onChange={e => setImportMode(e.target.value as 'merge' | 'replace')}
                className="px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border)] text-xs font-semibold"
              >
                <option value="merge">Mesclar por ID (Seguro)</option>
                <option value="replace">Substituir banco inteiro</option>
              </select>

              <label className="px-3.5 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] hover:border-violet-400 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                {importing ? 'Restaurando...' : 'Importar ZIP'}
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="hidden"
                  onChange={handleBackupImport}
                  disabled={importing}
                />
              </label>
            </div>

            {backupMessage && (
              <div
                className={`p-2.5 rounded-xl text-xs font-medium ${
                  backupMessage.ok
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-rose-500/15 text-rose-300'
                }`}
              >
                {backupMessage.text}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
