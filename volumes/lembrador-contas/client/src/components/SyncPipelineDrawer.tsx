import React from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, FileText, X } from 'lucide-react';
import type { SyncProgressEvent } from '../types';
import { formatBRL } from '../lib/format';

interface SyncPipelineDrawerProps {
  open: boolean;
  running: boolean;
  events: SyncProgressEvent[];
  onClose: () => void;
}

export const SyncPipelineDrawer: React.FC<SyncPipelineDrawerProps> = ({
  open,
  running,
  events,
  onClose,
}) => {
  if (!open) return null;

  const doneSources = new Set(
    events.filter(e => e.stage === 'source_done').map(e => e.source)
  );
  const savedBills = events.filter(e => e.stage === 'bill_saved');
  const completedEvt = events.find(e => e.stage === 'completed');
  const errorEvt = events.find(e => e.stage === 'error');

  return (
    <div className="mb-5 p-4 rounded-3xl bg-[var(--wallet-surface)] border border-violet-500/35 shadow-xl space-y-3 animate-sheet-up">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <RefreshCw
            className={`w-4 h-4 text-violet-400 ${running ? 'animate-spin' : ''}`}
          />
          <span className="text-xs font-bold">
            {running
              ? 'Sincronizando faturas em tempo real...'
              : errorEvt
              ? 'Sincronização finalizada com alerta'
              : `Sincronização concluída (${completedEvt?.processedCount ?? savedBills.length} faturas verificadas)`}
          </span>
        </div>
        {!running && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--wallet-muted)] hover:text-[var(--wallet-text)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        {[
          { key: 'TABLE', label: 'Tabelas Fixas' },
          { key: 'EMAIL', label: 'Gmail (CPFL/CORSAN)' },
          { key: 'API', label: 'APIs Externas' },
        ].map(item => {
          const isDone = doneSources.has(item.key as 'TABLE' | 'EMAIL' | 'API');
          return (
            <div
              key={item.key}
              className={`p-2.5 rounded-2xl border flex items-center justify-between gap-1.5 ${
                isDone
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-[var(--wallet-elevated)] border-[var(--wallet-border)] text-[var(--wallet-muted)]'
              }`}
            >
              <span className="truncate font-semibold">{item.label}</span>
              {isDone && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
            </div>
          );
        })}
      </div>

      {savedBills.length > 0 && (
        <div className="max-h-32 overflow-y-auto space-y-1 pt-1">
          {savedBills.map((ev, idx) => (
            <div
              key={`${ev.name}-${ev.referencePeriod}-${idx}`}
              className="px-3 py-1.5 rounded-xl bg-[var(--wallet-elevated)] text-xs flex items-center justify-between"
            >
              <span className="font-medium truncate flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                {ev.name} <span className="text-[var(--wallet-muted)]">({ev.referencePeriod})</span>
                {ev.hasPdf && <FileText className="w-3 h-3 text-violet-400" />}
              </span>
              <span className="font-mono font-bold tabular-nums">
                R$ {formatBRL(ev.value ?? null)}
              </span>
            </div>
          ))}
        </div>
      )}

      {errorEvt && (
        <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorEvt.message}
        </div>
      )}
    </div>
  );
};
