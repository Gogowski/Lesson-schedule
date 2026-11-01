import React, { useState } from 'react';
import { LockKeyhole, KeyRound } from 'lucide-react';

interface ScheduleLockScreenProps {
  isDark: boolean;
  errorMessage?: string;
  onUnlock: (accessCode: string, adminToken?: string) => Promise<void>;
}

export const ScheduleLockScreen: React.FC<ScheduleLockScreenProps> = ({
  isDark,
  errorMessage,
  onUnlock,
}) => {
  const [accessCode, setAccessCode] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [showAdminField, setShowAdminField] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) return;
    setBusy(true);
    setLocalError('');
    try {
      await onUnlock(accessCode.trim(), adminToken.trim() || undefined);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Неверный код доступа.');
    } finally {
      setBusy(false);
    }
  };

  const displayError = localError || errorMessage;

  return (
    <main
      className={`min-h-screen flex items-center justify-center p-5 transition-colors ${
        isDark ? 'bg-neutral-950 text-white' : 'bg-[#f5f6f8] text-neutral-900'
      }`}
    >
      <section
        className={`w-full max-w-sm rounded-3xl p-6 shadow-xl border ${
          isDark
            ? 'bg-neutral-900 border-white/10'
            : 'bg-white border-black/5'
        }`}
      >
        <div className="flex items-center gap-3 mb-5">
          <div
            className={`p-2.5 rounded-xl ${
              isDark ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-900'
            }`}
          >
            <LockKeyhole className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg tracking-tight">
              Расписание занятий
            </h1>
            <p className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
              Введите код доступа для расшифровки
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              type="password"
              autoFocus
              required
              value={accessCode}
              onChange={(e) => {
                setAccessCode(e.target.value);
                setLocalError('');
              }}
              placeholder="Код доступа (пароль / PIN)"
              className={`w-full px-4 py-3.5 rounded-xl text-center font-mono text-base tracking-widest outline-none focus:ring-2 transition-all ${
                isDark
                  ? 'bg-neutral-800 text-white focus:ring-white'
                  : 'bg-neutral-100 text-neutral-900 focus:ring-neutral-900'
              }`}
            />
          </div>

          {showAdminField && (
            <div>
              <input
                type="password"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder="GitHub Token (необязательно, для админа)"
                className={`w-full px-4 py-3 rounded-xl text-xs font-mono outline-none focus:ring-2 transition-all ${
                  isDark
                    ? 'bg-neutral-800 text-white focus:ring-white'
                    : 'bg-neutral-100 text-neutral-900 focus:ring-neutral-900'
                }`}
              />
            </div>
          )}

          {displayError && (
            <p role="alert" className="text-center text-xs text-rose-500 font-medium">
              {displayError}
            </p>
          )}

          <button
            disabled={busy || !accessCode.trim()}
            type="submit"
            className={`w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-60 ${
              isDark
                ? 'bg-white text-neutral-900 hover:bg-neutral-200'
                : 'bg-neutral-900 text-white hover:bg-neutral-800'
            }`}
          >
            {busy ? 'Открываю расписание…' : 'Открыть расписание'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setShowAdminField((prev) => !prev)}
          className={`w-full mt-3 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
            isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>{showAdminField ? 'Скрыть поле токена' : 'Я администратор (ввести токен)'}</span>
        </button>
      </section>
    </main>
  );
};
