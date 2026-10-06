import React, { useState } from 'react';
import { Lesson } from '../types';
import { parseLessonsJson } from '../utils/scheduleValidation';

interface CloudScheduleSetupProps {
  isDark: boolean;
  isEditor: boolean;
  onCreateEmpty: () => Promise<void>;
  onImport: (lessons: Lesson[]) => Promise<void>;
  onLogout: () => void;
}

export const CloudScheduleSetup: React.FC<CloudScheduleSetupProps> = ({ isDark, isEditor, onCreateEmpty, onImport, onLogout }) => {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCreateEmpty = async () => {
    setBusy(true);
    setMessage('');
    try {
      await onCreateEmpty();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось создать расписание.');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage('');
    try {
      const lessons = parseLessonsJson(await file.text());
      await onImport(lessons);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить расписание.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  return (
    <main className={`min-h-screen flex items-center justify-center p-5 ${isDark ? 'bg-neutral-950 text-white' : 'bg-[#f5f6f8] text-neutral-900'}`}>
      <section className={`w-full max-w-md rounded-3xl p-6 shadow-xl ${isDark ? 'bg-neutral-900' : 'bg-white'}`}>
        <h1 className="font-display font-bold text-lg">Начните вести расписание</h1>
        <p className={`mt-2 text-sm leading-relaxed ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
          {isEditor
            ? 'Создайте пустое расписание и добавляйте занятия по одному или загрузите готовое из JSON.'
            : 'Владелец ещё не добавил расписание. Попросите его загрузить файл.'}
        </p>
        {isEditor && (
          <div className="mt-5 space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCreateEmpty()}
              className={`block w-full rounded-xl px-4 py-3 text-center text-sm font-semibold disabled:opacity-60 ${isDark ? 'bg-white text-neutral-900' : 'bg-neutral-900 text-white'}`}
            >
              {busy ? 'Подготавливаю…' : 'Создать пустое расписание'}
            </button>
            <label className={`block cursor-pointer rounded-xl border px-4 py-3 text-center text-sm font-semibold ${isDark ? 'border-neutral-700 text-neutral-200' : 'border-neutral-200 text-neutral-700'} ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
              {busy ? 'Подождите…' : 'Импортировать JSON'}
              <input className="sr-only" type="file" accept="application/json,.json" disabled={busy} onChange={handleFile} />
            </label>
          </div>
        )}
        {message && <p role="alert" className="mt-3 text-sm text-rose-500">{message}</p>}
        <button type="button" onClick={onLogout} className={`mt-4 w-full py-2 text-xs font-medium ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>Выйти из аккаунта</button>
      </section>
    </main>
  );
};
