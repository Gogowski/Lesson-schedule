import React, { useState } from 'react';
import { X, Lock } from 'lucide-react';
import { verifyGitHubToken } from '../services/githubStorage';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tokenOrPin: string) => void;
  isDark?: boolean;
}

export const PinModal: React.FC<PinModalProps> = ({ isOpen, onClose, onSuccess, isDark }) => {
  const [token, setToken] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;
    setErrorMessage('');
    setBusy(true);

    try {
      const ok = await verifyGitHubToken(trimmed);
      if (ok) {
        onSuccess(trimmed);
        setToken('');
        onClose();
      } else {
        setErrorMessage('Токен не подошёл или у него нет прав на запись в репозиторий.');
      }
    } catch {
      setErrorMessage('Не удалось проверить токен. Проверьте интернет.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className={`w-full sm:max-w-xs rounded-t-[28px] sm:rounded-3xl p-5 shadow-2xl pb-safe transition-colors ${
          isDark ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-10 h-1 rounded-full mx-auto mb-3 sm:hidden ${isDark ? 'bg-neutral-700' : 'bg-neutral-300'}`} />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isDark ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
              <Lock className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold">Режим администратора</span>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-full transition-colors ${
              isDark ? 'text-neutral-400 hover:text-white hover:bg-neutral-800' : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <input
              type="password"
              autoFocus
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setErrorMessage('');
              }}
              placeholder="GitHub Token (ghp_...)"
              className={`w-full text-center py-3.5 px-3 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 ${
                isDark
                  ? 'bg-neutral-800 text-white focus:ring-white'
                  : 'bg-neutral-100 text-neutral-900 focus:ring-neutral-900'
              }`}
            />
            <p className={`mt-1.5 text-[11px] text-center ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
              Токен сохраняется только в вашем браузере для сохранения уроков в GitHub
            </p>
          </div>

          {errorMessage && (
            <p className="text-center text-xs text-rose-500 font-semibold">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !token.trim()}
            className={`w-full py-3.5 active:scale-[0.98] text-sm font-semibold rounded-xl transition-all shadow-xs disabled:opacity-60 ${
              isDark
                ? 'bg-white text-neutral-900 hover:bg-neutral-200'
                : 'bg-neutral-900 text-white hover:bg-neutral-800'
            }`}
          >
            {busy ? 'Проверяю токен…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
};
