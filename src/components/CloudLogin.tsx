import React, { useState } from 'react';
import { LockKeyhole } from 'lucide-react';

interface CloudLoginProps {
  isDark: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
  onResetPassword?: (email: string) => Promise<void>;
}

export const CloudLogin: React.FC<CloudLoginProps> = ({ isDark, onSignIn, onResetPassword }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await onSignIn(email.trim(), password);
    } catch (error) {
      const code = (error as { code?: string }).code;
      setMessage(code === 'auth/network-request-failed'
        ? 'Не удалось подключиться. Проверьте интернет и доступ к сервису.'
        : 'Не удалось войти. Проверьте почту и пароль.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!onResetPassword) {
      setMessage('Попросите владельца сбросить пароль через панель Supabase.');
      return;
    }
    if (!email.trim()) {
      setMessage('Сначала укажите адрес электронной почты.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await onResetPassword(email.trim());
      setMessage('Если для этого адреса создан аккаунт, письмо для сброса пароля отправлено.');
    } catch {
      setMessage('Не удалось отправить письмо. Проверьте адрес и подключение.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={`min-h-screen flex items-center justify-center p-5 ${isDark ? 'bg-neutral-950 text-white' : 'bg-[#f5f6f8] text-neutral-900'}`}>
      <section className={`w-full max-w-sm rounded-3xl p-6 shadow-xl ${isDark ? 'bg-neutral-900' : 'bg-white'}`}>
        <div className="flex items-center gap-3 mb-5">
          <div className={`p-2.5 rounded-xl ${isDark ? 'bg-neutral-800' : 'bg-neutral-100'}`}><LockKeyhole className="w-5 h-5" /></div>
          <div>
            <h1 className="font-display font-bold text-lg">Расписание занятий</h1>
            <p className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>Войдите в свой аккаунт</p>
          </div>
        </div>
        <form onSubmit={handleSignIn} className="space-y-3">
          <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Электронная почта" className={`w-full px-4 py-3 rounded-xl outline-none focus:ring-2 ${isDark ? 'bg-neutral-800 focus:ring-white' : 'bg-neutral-100 focus:ring-neutral-900'}`} />
          <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Пароль" className={`w-full px-4 py-3 rounded-xl outline-none focus:ring-2 ${isDark ? 'bg-neutral-800 focus:ring-white' : 'bg-neutral-100 focus:ring-neutral-900'}`} />
          {message && <p role="status" className={`text-xs ${message.startsWith('Если') ? 'text-emerald-600' : 'text-rose-500'}`}>{message}</p>}
          <button disabled={busy} type="submit" className={`w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-60 ${isDark ? 'bg-white text-neutral-900' : 'bg-neutral-900 text-white'}`}>{busy ? 'Подождите…' : 'Войти'}</button>
        </form>
        <button type="button" disabled={busy} onClick={handleReset} className={`w-full mt-3 py-2 text-xs font-medium ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}>{onResetPassword ? 'Забыли пароль?' : 'Помощь со входом'}</button>
      </section>
    </main>
  );
};
