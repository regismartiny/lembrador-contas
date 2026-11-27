import React, { useState } from 'react';
import { Wallet, Lock, ArrowRight } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { SessionInfo } from '../types';

interface LoginViewProps {
  onLoggedIn: (session: SessionInfo) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoggedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<SessionInfo>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      onLoggedIn(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'E-mail ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--wallet-bg)]">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--wallet-surface)] border border-[var(--wallet-border-strong)] p-7 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-violet-600/30">
            <Wallet className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black tracking-tight">Lembrador de Contas</h1>
          <p className="text-xs text-[var(--wallet-muted)]">
            Carteira compartilhada da casa · Entre para continuar
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
              Seu e-mail cadastrado
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              className="w-full px-4 py-3 rounded-2xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--wallet-muted)] mb-1">
              Senha de acesso
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[var(--wallet-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[var(--wallet-elevated)] border border-[var(--wallet-border-strong)] text-sm focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-extrabold shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {loading ? 'Entrando...' : 'Acessar Carteira'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
