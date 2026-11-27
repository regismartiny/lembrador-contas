import React, { useState } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  Mail,
  Globe,
  Table2,
  Layers,
  Play,
  X,
  CalendarPlus,
} from 'lucide-react';
import type {
  ConfiguredBill,
  TableSource,
  EmailSource,
  ApiSource,
  ResidentUser,
  ValueSourceType,
  PaymentType,
  BillType,
  TableEntry,
} from '../types';
import { formatBRL, getInitials, getAvatarGradient } from '../lib/format';
import { apiFetch } from '../lib/api';

interface CatalogAndSourcesViewProps {
  bills: ConfiguredBill[];
  tables: TableSource[];
  emails: EmailSource[];
  apis: ApiSource[];
  users: ResidentUser[];
  dataParsers: Record<string, string>;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}

type SubTab = 'BILLS' | 'TABLES' | 'EMAILS' | 'APIS';

export const CatalogAndSourcesView: React.FC<CatalogAndSourcesViewProps> = ({
  bills,
  tables,
  emails,
  apis,
  users,
  dataParsers,
  isAdmin,
  onRefresh,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('BILLS');
  const [testResult, setTestResult] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Bill modal state
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [billForm, setBillForm] = useState({
    name: '',
    company: '',
    dueDay: 10,
    type: 'RECURRENT_SERVICE' as BillType,
    valueSourceType: 'TABLE' as ValueSourceType,
    valueSourceId: '',
    paymentType: 'PIX' as PaymentType,
    pixKey: '',
    users: [] as string[],
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });

  // Table modal state
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [tableName, setTableName] = useState('');
  const [tableStatus, setTableStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [tableRows, setTableRows] = useState<Array<{ ym: string; value: string }>>([]);

  // Email modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [emailForm, setEmailForm] = useState({
    address: '',
    subject: '',
    dataParser: 'CPFL_EMAIL',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });

  // API modal state
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [editingApiId, setEditingApiId] = useState<string | null>(null);
  const [apiForm, setApiForm] = useState({
    name: '',
    url: '',
    method: 'GET' as 'GET' | 'POST' | 'PUT' | 'DELETE',
    value: '',
    body: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });

  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const usersById = new Map(users.map(u => [u._id, u]));

  const resolveSourceName = (type: ValueSourceType, id: string) => {
    if (type === 'TABLE') return tables.find(t => t._id === id)?.name || 'Tabela';
    if (type === 'EMAIL') return emails.find(e => e._id === id)?.address || 'Gmail';
    return apis.find(a => a._id === id)?.name || 'API';
  };

  // --- Bill Handlers ---
  const openBillModal = (b?: ConfiguredBill) => {
    setModalError(null);
    if (b) {
      setEditingBillId(b._id);
      setBillForm({
        name: b.name,
        company: b.company,
        dueDay: b.dueDay,
        type: b.type,
        valueSourceType: b.valueSourceType,
        valueSourceId: b.valueSourceId,
        paymentType: b.paymentType,
        pixKey: b.pixKey || '',
        users: b.users || [],
        status: b.status || 'ACTIVE',
      });
    } else {
      setEditingBillId(null);
      const firstTable = tables[0]?._id || '';
      setBillForm({
        name: '',
        company: '',
        dueDay: 10,
        type: 'RECURRENT_SERVICE',
        valueSourceType: 'TABLE',
        valueSourceId: firstTable,
        paymentType: 'PIX',
        pixKey: '',
        users: users.filter(u => u.status === 'ACTIVE').map(u => u._id),
        status: 'ACTIVE',
      });
    }
    setBillModalOpen(true);
  };

  const submitBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalError(null);
    try {
      if (editingBillId) {
        await apiFetch(`/api/bills/${editingBillId}`, {
          method: 'PUT',
          body: JSON.stringify(billForm),
        });
      } else {
        await apiFetch('/api/bills', {
          method: 'POST',
          body: JSON.stringify(billForm),
        });
      }
      setBillModalOpen(false);
      await onRefresh();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Erro ao salvar conta.');
    } finally {
      setSaving(false);
    }
  };

  // --- Table Handlers ---
  const openTableModal = (t?: TableSource) => {
    setModalError(null);
    if (t) {
      setEditingTableId(t._id);
      setTableName(t.name);
      setTableStatus(t.status || 'ACTIVE');
      setTableRows(
        (t.data || []).map(entry => ({
          ym: `${entry.period.year}-${String(entry.period.month).padStart(2, '0')}`,
          value: String(entry.value.toFixed(2)).replace('.', ','),
        }))
      );
    } else {
      setEditingTableId(null);
      setTableName('');
      setTableStatus('ACTIVE');
      const now = new Date();
      setTableRows([
        {
          ym: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
          value: '100,00',
        },
      ]);
    }
    setTableModalOpen(true);
  };

  const generateNext12Months = () => {
    const baseVal = tableRows[tableRows.length - 1]?.value || '100,00';
    const now = new Date();
    const generated: Array<{ ym: string; value: string }> = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      generated.push({
        ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        value: baseVal,
      });
    }
    setTableRows(generated);
  };

  const submitTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalError(null);
    try {
      const data: TableEntry[] = tableRows
        .map(r => {
          const [y, m] = r.ym.split('-').map(Number);
          const val = Number(r.value.replace(/\./g, '').replace(',', '.'));
          return { period: { month: m, year: y }, value: val };
        })
        .filter(item => item.period.month && item.period.year && Number.isFinite(item.value));

      const payload = { name: tableName, status: tableStatus, data };
      if (editingTableId) {
        await apiFetch(`/api/tables/${editingTableId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/tables', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setTableModalOpen(false);
      await onRefresh();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Erro ao salvar tabela.');
    } finally {
      setSaving(false);
    }
  };

  // --- Email Handlers ---
  const openEmailModal = (em?: EmailSource) => {
    setModalError(null);
    if (em) {
      setEditingEmailId(em._id);
      setEmailForm({
        address: em.address,
        subject: em.subject,
        dataParser: em.dataParser,
        status: em.status || 'ACTIVE',
      });
    } else {
      setEditingEmailId(null);
      setEmailForm({
        address: '',
        subject: '',
        dataParser: Object.keys(dataParsers)[0] || 'CPFL_EMAIL',
        status: 'ACTIVE',
      });
    }
    setEmailModalOpen(true);
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalError(null);
    try {
      if (editingEmailId) {
        await apiFetch(`/api/emails/${editingEmailId}`, {
          method: 'PUT',
          body: JSON.stringify(emailForm),
        });
      } else {
        await apiFetch('/api/emails', {
          method: 'POST',
          body: JSON.stringify(emailForm),
        });
      }
      setEmailModalOpen(false);
      await onRefresh();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Erro ao salvar conector Gmail.');
    } finally {
      setSaving(false);
    }
  };

  // --- API Handlers ---
  const openApiModal = (ap?: ApiSource) => {
    setModalError(null);
    if (ap) {
      setEditingApiId(ap._id);
      setApiForm({
        name: ap.name,
        url: ap.url,
        method: ap.method || 'GET',
        value: ap.value,
        body: ap.body || '',
        status: ap.status || 'ACTIVE',
      });
    } else {
      setEditingApiId(null);
      setApiForm({
        name: '',
        url: 'https://',
        method: 'GET',
        value: 'data.amount',
        body: '',
        status: 'ACTIVE',
      });
    }
    setApiModalOpen(true);
  };

  const submitApi = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalError(null);
    try {
      if (editingApiId) {
        await apiFetch(`/api/apis/${editingApiId}`, {
          method: 'PUT',
          body: JSON.stringify(apiForm),
        });
      } else {
        await apiFetch('/api/apis', {
          method: 'POST',
          body: JSON.stringify(apiForm),
        });
      }
      setApiModalOpen(false);
      await onRefresh();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Erro ao salvar API.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSource = async (kind: 'emails' | 'apis', id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await apiFetch<{
        success: boolean;
        extractedValue?: unknown;
        parsed?: unknown;
        message?: string;
      }>(`/api/${kind}/${id}/test`, { method: 'POST' });
      setTestResult({
        id,
        ok: res.success,
        text: res.success
          ? `Extração OK: ${JSON.stringify(res.parsed ?? res.extractedValue)}`
          : res.message || 'Nenhum valor retornado.',
      });
    } catch (err: unknown) {
      setTestResult({
        id,
        ok: false,
        text: err instanceof Error ? err.message : 'Falha no teste.',
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteEntity = async (endpoint: string, label: string) => {
    if (!window.confirm(`Deseja realmente excluir "${label}"?`)) return;
    await apiFetch(endpoint, { method: 'DELETE' });
    await onRefresh();
  };

  const sourceOptionsForType = (type: ValueSourceType) => {
    if (type === 'TABLE') return tables.map(t => ({ id: t._id, label: t.name }));
    if (type === 'EMAIL')
      return emails.map(e => ({ id: e._id, label: `${e.address} (${e.subject})` }));
    return apis.map(a => ({ id: a._id, label: `${a.name} (${a.method})` }));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">Catálogo & Fontes de Automação</h2>
          <p className="text-xs text-[var(--wallet-muted)]">
            Configure suas contas recorrentes e de onde cada valor é extraído todo mês
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              if (subTab === 'BILLS') openBillModal();
              else if (subTab === 'TABLES') openTableModal();
              else if (subTab === 'EMAILS') openEmailModal();
              else openApiModal();
            }}
            className="px-4 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-violet-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {subTab === 'BILLS'
              ? 'Nova Conta'
              : subTab === 'TABLES'
              ? 'Nova Tabela'
              : subTab === 'EMAILS'
              ? 'Novo Gmail'
              : 'Nova API'}
          </button>
        )}
      </div>

      {/* Sub-Navigation Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: 'BILLS' as SubTab, label: `Contas (${bills.length})`, icon: Layers },
          { id: 'TABLES' as SubTab, label: `Tabelas (${tables.length})`, icon: Table2 },
          { id: 'EMAILS' as SubTab, label: `Gmail OAuth (${emails.length})`, icon: Mail },
          { id: 'APIS' as SubTab, label: `APIs HTTP (${apis.length})`, icon: Globe },
        ].map(tab => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 shrink-0 transition cursor-pointer ${
                active
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/25'
                  : 'bg-[var(--wallet-surface)] border border-[var(--wallet-border)] text-[var(--wallet-muted)] hover:text-[var(--wallet-text)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SUBTAB 1: CONFIGURED BILLS */}
      {subTab === 'BILLS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {bills.map(b => (
            <div
              key={b._id}
              className="rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] p-4 flex items-center justify-between gap-3"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold truncate">{b.name}</h3>
                  <span className="px-2 py-0.5 rounded-full bg-[var(--wallet-elevated)] text-[10px] font-bold text-[var(--wallet-muted)]">
                    Dia {String(b.dueDay).padStart(2, '0')}
                  </span>
                  {b.status === 'INACTIVE' && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px] font-bold">
                      Inativa
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--wallet-muted)] truncate">
                  {b.company} · {b.paymentType} · Fonte:{' '}
                  <strong className="text-[var(--wallet-text)]">
                    {b.valueSourceType} ({resolveSourceName(b.valueSourceType, b.valueSourceId)})
                  </strong>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  {b.users.map(uid => {
                    const u = usersById.get(uid);
                    const uName = u?.name || 'M';
                    return (
                      <span
                        key={uid}
                        title={uName}
                        className={`w-5 h-5 rounded-full bg-gradient-to-br ${getAvatarGradient(
                          uName
                        )} text-white text-[9px] font-bold flex items-center justify-center`}
                      >
                        {getInitials(uName)}
                      </span>
                    );
                  })}
                </div>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openBillModal(b)}
                    className="p-2 rounded-xl hover:bg-[var(--wallet-elevated)] text-[var(--wallet-muted)] hover:text-[var(--wallet-text)] cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEntity(`/api/bills/${b._id}`, b.name)}
                    className="p-2 rounded-xl hover:bg-rose-500/10 text-[var(--wallet-muted)] hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* SUBTAB 2: TABLES */}
      {subTab === 'TABLES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {tables.map(t => (
            <div
              key={t._id}
              className="rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold">{t.name}</h3>
                  <div className="text-xs text-[var(--wallet-muted)]">
                    {t.data?.length || 0} competência(s) cadastrada(s)
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openTableModal(t)}
                      className="p-2 rounded-xl hover:bg-[var(--wallet-elevated)] cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteEntity(`/api/tables/${t._id}`, t.name)}
                      className="p-2 rounded-xl hover:bg-rose-500/10 text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(t.data || []).slice(-6).map((row, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-xl bg-[var(--wallet-elevated)] text-xs tabular-nums"
                  >
                    {String(row.period.month).padStart(2, '0')}/{row.period.year}:{' '}
                    <strong>R$ {formatBRL(row.value)}</strong>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SUBTAB 3: EMAILS */}
      {subTab === 'EMAILS' && (
        <div className="space-y-3">
          {emails.map(em => (
            <div
              key={em._id}
              className="rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold">{em.address}</h3>
                  <div className="text-xs text-[var(--wallet-muted)]">
                    Assunto: <strong>{em.subject}</strong> · Parser:{' '}
                    <code className="font-mono text-violet-400">{em.dataParser}</code>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={testingId === em._id}
                      onClick={() => handleTestSource('emails', em._id)}
                      className="px-3 py-1.5 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Play className="w-3 h-3" />
                      {testingId === em._id ? 'Testando...' : 'Testar Gmail'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEmailModal(em)}
                      className="p-2 rounded-xl hover:bg-[var(--wallet-elevated)] cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteEntity(`/api/emails/${em._id}`, em.address)}
                      className="p-2 rounded-xl hover:bg-rose-500/10 text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {testResult?.id === em._id && (
                <div
                  className={`p-2.5 rounded-xl text-xs font-mono break-all ${
                    testResult.ok
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-rose-500/15 text-rose-300'
                  }`}
                >
                  {testResult.text}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* SUBTAB 4: APIS */}
      {subTab === 'APIS' && (
        <div className="space-y-3">
          {apis.map(ap => (
            <div
              key={ap._id}
              className="rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 font-mono text-[10px] font-bold">
                      {ap.method}
                    </span>
                    <h3 className="text-sm font-extrabold truncate">{ap.name}</h3>
                  </div>
                  <div className="text-xs text-[var(--wallet-muted)] truncate mt-0.5">
                    {ap.url} → <code className="font-mono text-emerald-400">{ap.value}</code>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={testingId === ap._id}
                      onClick={() => handleTestSource('apis', ap._id)}
                      className="px-3 py-1.5 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Play className="w-3 h-3" />
                      {testingId === ap._id ? 'Consultando...' : 'Testar API'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openApiModal(ap)}
                      className="p-2 rounded-xl hover:bg-[var(--wallet-elevated)] cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteEntity(`/api/apis/${ap._id}`, ap.name)}
                      className="p-2 rounded-xl hover:bg-rose-500/10 text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {testResult?.id === ap._id && (
                <div
                  className={`p-2.5 rounded-xl text-xs font-mono break-all ${
                    testResult.ok
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-rose-500/15 text-rose-300'
                  }`}
                >
                  {testResult.text}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MODAL: BILL */}
      {billModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs"
          onClick={() => setBillModalOpen(false)}
        >
          <form
            onSubmit={submitBill}
            onClick={e => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border-strong)] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">
                {editingBillId ? 'Editar Conta do Catálogo' : 'Nova Conta do Catálogo'}
              </h3>
              <button
                type="button"
                onClick={() => setBillModalOpen(false)}
                className="p-1.5 rounded-full bg-[var(--wallet-elevated)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-2xl bg-rose-500/15 text-xs text-rose-300">{modalError}</div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  Nome da Conta
                </label>
                <input
                  type="text"
                  required
                  value={billForm.name}
                  onChange={e => setBillForm({ ...billForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  Empresa / Concessionária
                </label>
                <input
                  type="text"
                  required
                  value={billForm.company}
                  onChange={e => setBillForm({ ...billForm, company: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  Dia de Vencimento (1–31)
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  required
                  value={billForm.dueDay}
                  onChange={e => setBillForm({ ...billForm, dueDay: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  Natureza
                </label>
                <select
                  value={billForm.type}
                  onChange={e => setBillForm({ ...billForm, type: e.target.value as BillType })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                >
                  <option value="RECURRENT_SERVICE">Serviço Recorrente</option>
                  <option value="PURCHASE">Compra Parcelada</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  Tipo de Fonte de Valor
                </label>
                <select
                  value={billForm.valueSourceType}
                  onChange={e => {
                    const nextType = e.target.value as ValueSourceType;
                    const opts = sourceOptionsForType(nextType);
                    setBillForm({
                      ...billForm,
                      valueSourceType: nextType,
                      valueSourceId: opts[0]?.id || '',
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                >
                  <option value="TABLE">Tabela Manual</option>
                  <option value="EMAIL">Gmail (Leitura Automática)</option>
                  <option value="API">API Externa (JSONPath)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  Conector Vinculado
                </label>
                <select
                  value={billForm.valueSourceId}
                  onChange={e => setBillForm({ ...billForm, valueSourceId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                >
                  <option value="">Selecione...</option>
                  {sourceOptionsForType(billForm.valueSourceType).map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  Forma de Pagamento
                </label>
                <select
                  value={billForm.paymentType}
                  onChange={e =>
                    setBillForm({ ...billForm, paymentType: e.target.value as PaymentType })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                >
                  <option value="PIX">PIX</option>
                  <option value="DINHEIRO">Dinheiro</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  Chave PIX Padrão (Opcional)
                </label>
                <input
                  type="text"
                  value={billForm.pixKey}
                  onChange={e => setBillForm({ ...billForm, pixKey: e.target.value })}
                  placeholder="CNPJ, e-mail, telefone..."
                  className="w-full px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1.5">
                Moradores que dividem esta conta
              </label>
              <div className="flex flex-wrap gap-2">
                {users.map(u => {
                  const selected = billForm.users.includes(u._id);
                  return (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() =>
                        setBillForm(prev => ({
                          ...prev,
                          users: selected
                            ? prev.users.filter(id => id !== u._id)
                            : [...prev.users, u._id],
                        }))
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${
                        selected
                          ? 'bg-violet-600/20 border-violet-500 text-[var(--wallet-text)]'
                          : 'bg-[var(--wallet-elevated)] border-[var(--wallet-border)] text-[var(--wallet-muted)]'
                      }`}
                    >
                      {u.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBillModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-[var(--wallet-elevated)] text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold cursor-pointer"
              >
                {saving ? 'Salvando...' : 'Salvar conta'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: TABLE */}
      {tableModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs"
          onClick={() => setTableModalOpen(false)}
        >
          <form
            onSubmit={submitTable}
            onClick={e => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border-strong)] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">
                {editingTableId ? 'Editar Tabela de Valores' : 'Nova Tabela de Valores'}
              </h3>
              <button
                type="button"
                onClick={() => setTableModalOpen(false)}
                className="p-1.5 rounded-full bg-[var(--wallet-elevated)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-2xl bg-rose-500/15 text-xs text-rose-300">{modalError}</div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                Nome da Tabela
              </label>
              <input
                type="text"
                required
                value={tableName}
                onChange={e => setTableName(e.target.value)}
                placeholder="Ex.: Vivo Fibra 2026"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--wallet-muted)]">
                Competências e Valores
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={generateNext12Months}
                  className="px-2.5 py-1 rounded-xl bg-violet-500/15 text-violet-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <CalendarPlus className="w-3.5 h-3.5" /> Gerar 12 meses
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTableRows(prev => [...prev, { ym: '2026-12', value: '100,00' }])
                  }
                  className="px-2.5 py-1 rounded-xl bg-[var(--wallet-elevated)] text-xs font-bold cursor-pointer"
                >
                  + Mês
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {tableRows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="month"
                    value={row.ym}
                    onChange={e =>
                      setTableRows(prev =>
                        prev.map((item, i) => (i === idx ? { ...item, ym: e.target.value } : item))
                      )
                    }
                    className="flex-1 px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border)] text-xs tabular-nums"
                  />
                  <input
                    type="text"
                    value={row.value}
                    onChange={e =>
                      setTableRows(prev =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, value: e.target.value } : item
                        )
                      )
                    }
                    placeholder="0,00"
                    className="w-32 px-3 py-2 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border)] text-xs font-bold tabular-nums text-right"
                  />
                  <button
                    type="button"
                    onClick={() => setTableRows(prev => prev.filter((_, i) => i !== idx))}
                    className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-xl cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTableModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-[var(--wallet-elevated)] text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold cursor-pointer"
              >
                Salvar tabela
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EMAIL */}
      {emailModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs"
          onClick={() => setEmailModalOpen(false)}
        >
          <form
            onSubmit={submitEmail}
            onClick={e => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-md rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border-strong)] p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-extrabold">
              {editingEmailId ? 'Editar Conector Gmail' : 'Novo Conector Gmail'}
            </h3>
            {modalError && (
              <div className="p-3 rounded-2xl bg-rose-500/15 text-xs text-rose-300">{modalError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  E-mail Remetente
                </label>
                <input
                  type="text"
                  required
                  value={emailForm.address}
                  onChange={e => setEmailForm({ ...emailForm, address: e.target.value })}
                  placeholder="fatura@corsan.com.br"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  Filtro de Assunto
                </label>
                <input
                  type="text"
                  required
                  value={emailForm.subject}
                  onChange={e => setEmailForm({ ...emailForm, subject: e.target.value })}
                  placeholder="Sua fatura chegou"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  Parser Extrator
                </label>
                <select
                  value={emailForm.dataParser}
                  onChange={e => setEmailForm({ ...emailForm, dataParser: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                >
                  {Object.keys(dataParsers).map(k => (
                    <option key={k} value={k}>
                      {k} ({dataParsers[k]})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-[var(--wallet-elevated)] text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold cursor-pointer"
              >
                Salvar conector
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: API */}
      {apiModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs"
          onClick={() => setApiModalOpen(false)}
        >
          <form
            onSubmit={submitApi}
            onClick={e => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-md rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border-strong)] p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-extrabold">
              {editingApiId ? 'Editar Conector API' : 'Novo Conector API'}
            </h3>
            {modalError && (
              <div className="p-3 rounded-2xl bg-rose-500/15 text-xs text-rose-300">{modalError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  required
                  value={apiForm.name}
                  onChange={e => setApiForm({ ...apiForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                  URL HTTPS Externa
                </label>
                <input
                  type="url"
                  required
                  value={apiForm.url}
                  onChange={e => setApiForm({ ...apiForm, url: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                    Método HTTP
                  </label>
                  <select
                    value={apiForm.method}
                    onChange={e =>
                      setApiForm({
                        ...apiForm,
                        method: e.target.value as 'GET' | 'POST' | 'PUT' | 'DELETE',
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
                    Caminho JSONPath
                  </label>
                  <input
                    type="text"
                    required
                    value={apiForm.value}
                    onChange={e => setApiForm({ ...apiForm, value: e.target.value })}
                    placeholder="data.amount"
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm font-mono"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setApiModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-[var(--wallet-elevated)] text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold cursor-pointer"
              >
                Salvar API
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
