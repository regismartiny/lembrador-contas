import React, { useEffect, useState, useCallback } from 'react';
import {
  Wallet,
  Users,
  Layers,
  BarChart3,
  Sun,
  Moon,
  LogOut,
  CheckCircle2,
} from 'lucide-react';
import type {
  ActiveBillItem,
  BootstrapPayload,
  SessionInfo,
  SyncProgressEvent,
} from './types';
import { apiFetch, setCsrfToken, ApiError } from './lib/api';
import { currentRefPeriod, parseRefPeriod } from './lib/format';
import { WalletView } from './views/WalletView';
import { HouseholdView } from './views/HouseholdView';
import { CatalogAndSourcesView } from './views/CatalogAndSourcesView';
import { ReportsAndSettingsView } from './views/ReportsAndSettingsView';
import { LoginView } from './views/LoginView';
import { BillDetailSheet } from './components/BillDetailSheet';
import { GuidedPayModal } from './components/GuidedPayModal';
import { SyncPipelineDrawer } from './components/SyncPipelineDrawer';

type MainTab = 'WALLET' | 'HOUSEHOLD' | 'CATALOG' | 'REPORTS';

function tabFromPathname(pathname: string): MainTab {
  if (pathname.startsWith('/users') || pathname.startsWith('/rateio')) return 'HOUSEHOLD';
  if (
    pathname.startsWith('/bills') ||
    pathname.startsWith('/tables') ||
    pathname.startsWith('/emails') ||
    pathname.startsWith('/apis') ||
    pathname.startsWith('/catalogo')
  ) {
    return 'CATALOG';
  }
  if (pathname.startsWith('/reports') || pathname.startsWith('/backup')) return 'REPORTS';
  return 'WALLET';
}

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('wallet-theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MainTab>(() =>
    tabFromPathname(window.location.pathname)
  );
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => currentRefPeriod());
  const [scopeUserId, setScopeUserId] = useState<string>('ALL');

  // Interactive modals / drawers
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [creatingBill, setCreatingBill] = useState(false);
  const [guidedQueue, setGuidedQueue] = useState<ActiveBillItem[] | null>(null);

  // Sync SSE state
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncEvents, setSyncEvents] = useState<SyncProgressEvent[]>([]);

  // Toast feedback
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('wallet-theme', theme);
  }, [theme]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast(cur => (cur === msg ? null : cur));
    }, 2800);
  };

  const loadBootstrap = useCallback(async () => {
    try {
      const sess = await apiFetch<SessionInfo>('/api/session');
      setCsrfToken(sess.csrfToken);
      setSession(sess);

      if (!sess.authenticated) {
        setData(null);
        setLoading(false);
        return;
      }

      const payload = await apiFetch<BootstrapPayload>('/api/bootstrap');
      setData(payload);

      // Pick best initial period if current month has no bills yet but another month does
      if (payload.activeBills.length > 0) {
        const cur = currentRefPeriod();
        const hasCur = payload.activeBills.some(b => b.referencePeriod === cur);
        if (!hasCur) {
          const sorted = [...payload.activeBills]
            .filter(b => parseRefPeriod(b.referencePeriod))
            .sort(
              (a, b) =>
                (parseRefPeriod(b.referencePeriod)?.key ?? 0) -
                (parseRefPeriod(a.referencePeriod)?.key ?? 0)
            );
          if (sorted[0]) {
            setSelectedPeriod(sorted[0].referencePeriod);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        setSession({
          authRequired: true,
          authDisabled: false,
          authenticated: false,
          user: null,
          isAdmin: false,
          actorName: '',
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, [loadBootstrap]);

  // Optimistic 1-click Pay / Unpay
  const handleTogglePaid = async (bill: ActiveBillItem) => {
    if (!data) return;
    const nextPaid = bill.status !== 'PAID';
    const optimisticNow = new Date().toISOString();
    const actor = session?.actorName || 'Admin';

    const prevBills = data.activeBills;
    setData({
      ...data,
      activeBills: data.activeBills.map(b =>
        b._id === bill._id
          ? {
              ...b,
              status: nextPaid ? 'PAID' : 'UNPAID',
              paidAt: nextPaid ? optimisticNow : null,
              paidBy: nextPaid ? actor : '',
            }
          : b
      ),
    });

    try {
      const res = await apiFetch<{ activeBill: ActiveBillItem }>(
        `/api/active-bills/${bill._id}/toggle-paid`,
        {
          method: 'POST',
          body: JSON.stringify({ paid: nextPaid }),
        }
      );
      setData(cur =>
        cur
          ? {
              ...cur,
              activeBills: cur.activeBills.map(b =>
                b._id === bill._id ? { ...b, ...res.activeBill } : b
              ),
            }
          : cur
      );
      showToast(
        nextPaid ? `✓ "${bill.name}" marcada como paga!` : `"${bill.name}" reaberta como pendente.`
      );
    } catch (err: unknown) {
      setData(cur => (cur ? { ...cur, activeBills: prevBills } : cur));
      showToast(err instanceof Error ? err.message : 'Erro ao atualizar pagamento.');
    }
  };

  const handleSaveActiveBill = async (
    payload: Partial<ActiveBillItem> & { name: string },
    existingId?: string
  ) => {
    if (existingId) {
      await apiFetch(`/api/active-bills/${existingId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      showToast('Fatura atualizada!');
    } else {
      await apiFetch('/api/active-bills', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (payload.referencePeriod) setSelectedPeriod(payload.referencePeriod);
      showToast('Nova fatura adicionada na carteira!');
    }
    await loadBootstrap();
  };

  const handleDeleteActiveBill = async (id: string) => {
    await apiFetch(`/api/active-bills/${id}`, { method: 'DELETE' });
    showToast('Lançamento removido.');
    await loadBootstrap();
  };

  const handleUploadPdf = async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('pdfFile', file);
    await apiFetch(`/api/active-bills/${id}/pdf`, {
      method: 'POST',
      body: fd,
    });
    showToast('Fatura PDF anexada com sucesso!');
    await loadBootstrap();
  };

  const handleTriggerSync = () => {
    if (syncRunning) return;
    setSyncOpen(true);
    setSyncRunning(true);
    setSyncEvents([]);

    if (typeof EventSource !== 'undefined') {
      const es = new EventSource('/api/sync/stream');
      es.onmessage = ev => {
        try {
          const parsed = JSON.parse(ev.data) as SyncProgressEvent;
          setSyncEvents(prev => [...prev, parsed]);
          if (parsed.stage === 'completed' || parsed.stage === 'error') {
            es.close();
            setSyncRunning(false);
            loadBootstrap();
          }
        } catch {
          // ignore malformed chunk
        }
      };
      es.onerror = () => {
        es.close();
        setSyncRunning(false);
        loadBootstrap();
      };
    } else {
      apiFetch('/api/sync', { method: 'POST' })
        .then(() => {
          setSyncEvents([{ stage: 'completed', processedCount: 0 }]);
        })
        .catch(err => {
          setSyncEvents([{ stage: 'error', message: err.message }]);
        })
        .finally(() => {
          setSyncRunning(false);
          loadBootstrap();
        });
    }
  };

  const handleSaveUser = async (
    payload: { name: string; email: string; admin: boolean; status: 'ACTIVE' | 'INACTIVE' },
    id?: string
  ) => {
    if (id) {
      await apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(payload) });
    }
    showToast('Morador salvo!');
    await loadBootstrap();
  };

  const handleDeleteUser = async (id: string) => {
    await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
    if (scopeUserId === id) setScopeUserId('ALL');
    showToast('Morador removido.');
    await loadBootstrap();
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    await loadBootstrap();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--wallet-bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center animate-pulse">
            <Wallet className="w-6 h-6 text-violet-400" />
          </div>
          <span className="text-xs font-semibold text-[var(--wallet-muted)]">
            Carregando sua carteira...
          </span>
        </div>
      </div>
    );
  }

  if (session?.authRequired && !session.authenticated) {
    return (
      <LoginView
        onLoggedIn={sess => {
          setCsrfToken(sess.csrfToken);
          setSession(sess);
          setLoading(true);
          loadBootstrap();
        }}
      />
    );
  }

  const activeBills = data?.activeBills || [];
  const users = data?.users || [];
  const bills = data?.bills || [];
  const isAdmin = Boolean(data?.session?.isAdmin ?? session?.isAdmin);
  const selectedBill = selectedBillId
    ? activeBills.find(b => b._id === selectedBillId) || null
    : null;

  const navItems: Array<{ id: MainTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'WALLET', label: 'Carteira', icon: Wallet },
    { id: 'HOUSEHOLD', label: 'Casa & Rateio', icon: Users },
    { id: 'CATALOG', label: 'Catálogo & Fontes', icon: Layers },
    { id: 'REPORTS', label: 'Relatórios', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen pb-24 md:pb-10 bg-[var(--wallet-bg)] text-[var(--wallet-text)]">
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[var(--wallet-bg)]/80 border-b border-[var(--wallet-border)] no-print">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white flex items-center justify-center shadow-md shadow-violet-600/25">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-black tracking-tight leading-none">
                Lembrador de Contas
              </div>
              <div className="text-[11px] text-[var(--wallet-muted)] mt-0.5">
                {session?.authDisabled
                  ? 'Modo local · Acesso liberado'
                  : session?.user?.name || session?.user?.email}
              </div>
            </div>
          </div>

          {/* Desktop Navigation Pills */}
          <nav className="hidden md:flex items-center gap-1 bg-[var(--wallet-surface)] border border-[var(--wallet-border)] p-1 rounded-2xl">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                    active
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'text-[var(--wallet-muted)] hover:text-[var(--wallet-text)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Theme + Logout Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
              className="p-2.5 rounded-2xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] hover:border-violet-400 transition cursor-pointer"
              title="Alternar tema Claro / Escuro"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-violet-600" />
              )}
            </button>

            {session?.authRequired && session.authenticated && (
              <button
                type="button"
                onClick={handleLogout}
                className="p-2.5 rounded-2xl bg-[var(--wallet-surface)] border border-[var(--wallet-border)] hover:border-rose-400 text-[var(--wallet-muted)] hover:text-rose-400 transition cursor-pointer"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-5xl mx-auto px-4 pt-5">
        <SyncPipelineDrawer
          open={syncOpen}
          running={syncRunning}
          events={syncEvents}
          onClose={() => setSyncOpen(false)}
        />

        {activeTab === 'WALLET' && (
          <WalletView
            activeBills={activeBills}
            users={users}
            configuredCount={bills.length}
            selectedPeriod={selectedPeriod}
            onSelectPeriod={setSelectedPeriod}
            scopeUserId={scopeUserId}
            onSelectScopeUser={setScopeUserId}
            isAdmin={isAdmin}
            syncing={syncRunning}
            onSync={handleTriggerSync}
            onTogglePaid={handleTogglePaid}
            onOpenBill={b => {
              setCreatingBill(false);
              setSelectedBillId(b._id);
            }}
            onNewBill={() => {
              setSelectedBillId(null);
              setCreatingBill(true);
            }}
            onStartGuidedPay={list => setGuidedQueue(list)}
          />
        )}

        {activeTab === 'HOUSEHOLD' && (
          <HouseholdView
            activeBills={activeBills}
            users={users}
            selectedPeriod={selectedPeriod}
            isAdmin={isAdmin}
            onSaveUser={handleSaveUser}
            onDeleteUser={handleDeleteUser}
            onSelectScopeAndGoWallet={uid => {
              setScopeUserId(uid);
              setActiveTab('WALLET');
            }}
          />
        )}

        {activeTab === 'CATALOG' && (
          <CatalogAndSourcesView
            bills={bills}
            tables={data?.sources.tables || []}
            emails={data?.sources.emails || []}
            apis={data?.sources.apis || []}
            users={users}
            dataParsers={data?.enums?.dataParser || { CPFL_EMAIL: 'cpflEmailParser', CORSAN_EMAIL: 'corsanEmailParser' }}
            isAdmin={isAdmin}
            onRefresh={loadBootstrap}
          />
        )}

        {activeTab === 'REPORTS' && (
          <ReportsAndSettingsView
            users={users}
            isAdmin={isAdmin}
            vapidPublicKey={session?.vapidPublicKey}
            onRefreshBootstrap={loadBootstrap}
          />
        )}
      </main>

      {/* Mobile Native Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 backdrop-blur-xl bg-[var(--wallet-surface)]/90 border-t border-[var(--wallet-border-strong)] px-2 pb-[env(safe-area-inset-bottom)] no-print">
        <div className="grid grid-cols-4 h-16">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition cursor-pointer ${
                  active ? 'text-violet-400' : 'text-[var(--wallet-muted)]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Slide-Over / Bottom Sheet for Bill Details, PDF & PIX */}
      {(selectedBill || creatingBill) && (
        <BillDetailSheet
          bill={selectedBill}
          isNew={creatingBill}
          defaultPeriod={selectedPeriod === 'ALL' ? currentRefPeriod() : selectedPeriod}
          users={users}
          availablePdfs={data?.sources.availablePdfs || []}
          isAdmin={isAdmin}
          onClose={() => {
            setSelectedBillId(null);
            setCreatingBill(false);
          }}
          onTogglePaid={handleTogglePaid}
          onSave={handleSaveActiveBill}
          onDelete={handleDeleteActiveBill}
          onUploadPdf={handleUploadPdf}
        />
      )}

      {/* Guided Pay Flow Modal */}
      {guidedQueue && (
        <GuidedPayModal
          bills={guidedQueue}
          users={users}
          scopeUserId={scopeUserId}
          onClose={() => setGuidedQueue(null)}
          onPayBill={handleTogglePaid}
        />
      )}

      {/* Floating Feedback Toast */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-[var(--wallet-text)] text-[var(--wallet-bg)] text-xs font-extrabold shadow-2xl flex items-center gap-2 animate-sheet-up">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          {toast}
        </div>
      )}
    </div>
  );
};
