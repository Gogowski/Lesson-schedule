import React, { useRef, useState } from 'react';
import { X, Lock, Unlock, Share2, Check, KeyRound, Moon, Sun, Bell, BellRing } from 'lucide-react';
import { NotificationPermissionState } from '../utils/notificationService';
import { Lesson } from '../types';
import { parseLessonsJson } from '../utils/scheduleValidation';
import { buildViewerShareUrl, getSavedAccessCode } from '../services/githubStorage';

interface MobileActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  isCloudMode?: boolean;
  currentLessons: Lesson[];
  onExportBackup: () => void;
  onImportBackup: (lessons: Lesson[]) => Promise<void>;
  onOpenPinModal: () => void;
  onLogoutAdmin: () => void;
  onChangePin: (curr: string, next: string) => Promise<boolean>;
  isDark: boolean;
  onToggleTheme: () => void;
  notificationsEnabled: boolean;
  onToggleNotifications: () => Promise<boolean>;
  onSendTestNotification: () => boolean;
  notificationPermission: NotificationPermissionState;
}

export const MobileActionMenu: React.FC<MobileActionMenuProps> = ({
  isOpen,
  onClose,
  isAdmin,
  currentLessons,
  onExportBackup,
  onImportBackup,
  onOpenPinModal,
  onLogoutAdmin,
  onChangePin,
  isDark,
  onToggleTheme,
  notificationsEnabled,
  onToggleNotifications,
  onSendTestNotification,
  notificationPermission,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [currPin, setCurrPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinStatus, setPinStatus] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState(false);
  const [pendingImportLessons, setPendingImportLessons] = useState<Lesson[] | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleShare = () => {
    const shareUrl = buildViewerShareUrl(getSavedAccessCode());
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleToggleNotif = async () => {
    setNotifError(null);
    if (notificationPermission === 'denied') {
      setNotifError('Уведомления заблокированы в настройках браузера. Разрешите доступ к уведомлениям для этого сайта.');
      return;
    }
    const success = await onToggleNotifications();
    if (!success && !notificationsEnabled) {
      setNotifError('Разрешение на уведомления не получено. Проверьте настройки разрешений в браузере.');
    }
  };

  const handleTestClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const sent = onSendTestNotification();
    if (sent) {
      setTestSent(true);
      setTimeout(() => setTestSent(false), 2500);
    }
  };

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPin.trim()) return;
    setPinStatus('Перешифровываю расписание…');
    const ok = await onChangePin(currPin.trim(), newPin.trim());
    if (ok) {
      setPinStatus('Код доступа успешно изменён!');
      setTimeout(() => {
        setIsChangingPin(false);
        setPinStatus(null);
        setCurrPin('');
        setNewPin('');
      }, 1500);
    } else {
      setPinStatus('Ошибка! Проверьте текущий код доступа.');
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setBackupMessage(null);
    setBackupError(false);
    setPendingImportLessons(null);
    try {
      const lessons = parseLessonsJson(await file.text());
      setPendingImportLessons(lessons);
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Не удалось восстановить расписание.');
      setBackupError(true);
    } finally {
      input.value = '';
    }
  };

  const applyImportedLessons = async (mode: 'add' | 'replace') => {
    if (!pendingImportLessons || backupBusy) return;

    let nextLessons = pendingImportLessons;
    let addedCount = 0;
    if (mode === 'add') {
      const knownIds = new Set(currentLessons.map((lesson) => lesson.id));
      const additions = pendingImportLessons.filter((lesson) => {
        if (knownIds.has(lesson.id)) return false;
        knownIds.add(lesson.id);
        return true;
      });
      if (additions.length === 0) {
        setBackupMessage('В файле нет новых занятий: все ID уже есть в расписании.');
        setBackupError(false);
        return;
      }
      if (currentLessons.length + additions.length > 100) {
        setBackupMessage('После добавления получится больше 100 занятий. Удалите часть занятий или замените расписание.');
        setBackupError(true);
        return;
      }
      addedCount = additions.length;
      nextLessons = [...currentLessons, ...additions];
    } else if (!window.confirm(`Заменить текущее расписание на данные из файла (${pendingImportLessons.length} занятий)?`)) {
      return;
    }

    setBackupBusy(true);
    setBackupMessage(null);
    setBackupError(false);
    try {
      await onImportBackup(nextLessons);
      setBackupMessage(mode === 'add' ? `Добавлено занятий: ${addedCount}.` : `Расписание заменено (${nextLessons.length} занятий).`);
      setPendingImportLessons(null);
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Не удалось импортировать расписание.');
      setBackupError(true);
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className={`w-full sm:max-w-sm rounded-t-[32px] sm:rounded-3xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto pb-safe transition-colors ${
          isDark ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className={`w-10 h-1 rounded-full mx-auto mb-3 sm:hidden ${isDark ? 'bg-neutral-700' : 'bg-neutral-300'}`} />

        {/* Clean header */}
        <div className="flex items-center justify-between pb-1 mb-3">
          <span className="text-base font-bold font-display tracking-tight">
            Опции
          </span>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-full transition-colors ${
              isDark ? 'text-neutral-400 hover:text-white hover:bg-neutral-800' : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Change Access Code view if opened */}
        {isChangingPin ? (
          <form onSubmit={handleChangePinSubmit} className="space-y-3 pb-2">
            <span className={`text-xs font-semibold block ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
              Смена кода доступа к расписанию
            </span>
            <input
              type="password"
              placeholder="Текущий код доступа"
              value={currPin}
              onChange={(e) => setCurrPin(e.target.value)}
              required
              className={`w-full px-3 py-2.5 rounded-2xl text-sm font-mono text-center focus:outline-none focus:ring-2 ${
                isDark
                  ? 'bg-neutral-800 text-white focus:ring-white'
                  : 'bg-neutral-100 text-neutral-900 focus:ring-neutral-900'
              }`}
            />
            <input
              type="password"
              placeholder="Новый код доступа"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              required
              className={`w-full px-3 py-2.5 rounded-2xl text-sm font-mono text-center focus:outline-none focus:ring-2 ${
                isDark
                  ? 'bg-neutral-800 text-white focus:ring-white'
                  : 'bg-neutral-100 text-neutral-900 focus:ring-neutral-900'
              }`}
            />
            {pinStatus && (
              <p className={`text-xs text-center font-medium ${pinStatus.includes('успешно') ? 'text-emerald-500' : pinStatus.includes('Ошибка') ? 'text-rose-500' : 'text-amber-500'}`}>
                {pinStatus}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsChangingPin(false)}
                className={`flex-1 py-2.5 text-xs font-medium rounded-2xl transition-colors ${
                  isDark ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                Отмена
              </button>
              <button
                type="submit"
                className={`flex-1 py-2.5 text-xs font-semibold rounded-2xl transition-colors ${
                  isDark ? 'bg-white text-neutral-900 hover:bg-neutral-200' : 'bg-neutral-900 text-white hover:bg-neutral-800'
                }`}
              >
                Сохранить
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-2">
            {/* Notifications Toggle */}
            <div className={`p-3.5 rounded-2xl transition-all ${
              isDark
                ? 'bg-neutral-800 text-white'
                : 'bg-neutral-100/70 text-neutral-800'
            }`}>
              <button
                type="button"
                onClick={handleToggleNotif}
                className="w-full flex items-center justify-between text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${
                    notificationsEnabled
                      ? 'bg-emerald-500 text-white shadow-2xs'
                      : isDark ? 'bg-neutral-700 text-neutral-300' : 'bg-white text-neutral-600 shadow-2xs'
                  }`}>
                    {notificationsEnabled ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="text-sm leading-tight font-semibold flex items-center gap-1.5">
                      <span>Уведомления за 10 мин</span>
                    </div>
                    <div className={`text-[11px] font-normal ${
                      notificationPermission === 'denied'
                        ? 'text-rose-400 font-medium'
                        : isDark ? 'text-neutral-400' : 'text-neutral-500'
                    }`}>
                      {notificationPermission === 'denied'
                        ? 'Заблокировано (разрешите в браузере)'
                        : notificationPermission === 'unsupported'
                        ? 'Не поддерживается браузером'
                        : notificationsEnabled
                        ? 'Напомним за 10 минут до урока'
                        : 'Выключено'}
                    </div>
                  </div>
                </div>

                <div className={`w-11 h-6 rounded-full p-0.5 transition-colors ${
                  notificationsEnabled ? 'bg-emerald-500' : isDark ? 'bg-neutral-700' : 'bg-neutral-300'
                }`}>
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </div>
              </button>

              {notificationsEnabled && (
                <div className={`mt-3 pt-2.5 border-t flex items-center justify-between text-xs ${
                  isDark ? 'border-neutral-700/60' : 'border-neutral-200/80'
                }`}>
                  <span className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                    Локальное уведомление браузера
                  </span>
                  <button
                    type="button"
                    onClick={handleTestClick}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95 ${
                      testSent
                        ? 'text-emerald-500 bg-emerald-500/15'
                        : isDark
                        ? 'bg-neutral-700 text-neutral-200 hover:bg-neutral-600'
                        : 'bg-white text-neutral-700 hover:bg-neutral-200/70 shadow-2xs'
                    }`}
                  >
                    {testSent ? '✓ Отправлено' : 'Проверить'}
                  </button>
                </div>
              )}

              {notifError && (
                <div className="mt-2.5 p-2 rounded-xl bg-rose-500/10 text-rose-400 text-xs leading-snug">
                  {notifError}
                </div>
              )}
            </div>

            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={onToggleTheme}
              className={`w-full p-3.5 rounded-2xl flex items-center justify-between text-left transition-all active:scale-[0.98] ${
                isDark
                  ? 'bg-neutral-800 text-white hover:bg-neutral-700/80'
                  : 'bg-neutral-100/70 text-neutral-800 hover:bg-neutral-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${isDark ? 'bg-neutral-700 text-amber-400' : 'bg-white text-neutral-700 shadow-2xs'}`}>
                  {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-500" />}
                </div>
                <div>
                  <div className="text-sm leading-tight font-semibold">
                    {isDark ? 'Тёмная тема' : 'Светлая тема'}
                  </div>
                  <div className={`text-[11px] font-normal ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                    {isDark ? 'Включено тёмное оформление' : 'Включено светлое оформление'}
                  </div>
                </div>
              </div>
              <div className={`w-11 h-6 rounded-full p-0.5 transition-colors ${isDark ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${isDark ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
            </button>

            {/* Share Link */}
            <button
              type="button"
              onClick={handleShare}
              className={`w-full p-3.5 rounded-2xl flex items-center justify-between text-left transition-all active:scale-[0.98] ${
                isDark
                  ? 'bg-neutral-800 text-white hover:bg-neutral-700/80'
                  : 'bg-neutral-100/70 text-neutral-800 hover:bg-neutral-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${isDark ? 'bg-neutral-700 text-neutral-200' : 'bg-white text-neutral-600 shadow-2xs'}`}>
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm leading-tight font-semibold">Поделиться расписанием</div>
                  <div className={`text-[11px] font-normal ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                    Скопировать готовую ссылку со входом для зрителя
                  </div>
                </div>
              </div>
              {copiedLink ? (
                <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  Готово
                </span>
              ) : null}
            </button>

            {/* Admin Access Switch */}
            {isAdmin ? (
              <div className="space-y-2 pt-1">
                <div className={`rounded-2xl p-3 ${isDark ? 'bg-neutral-800' : 'bg-neutral-100/70'}`}>
                  <div className="flex gap-2">
                    <button type="button" onClick={onExportBackup} className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-semibold ${isDark ? 'bg-neutral-700 text-white' : 'bg-white text-neutral-800'}`}>Скачать копию</button>
                    <button type="button" disabled={backupBusy} onClick={() => backupInputRef.current?.click()} className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-semibold disabled:opacity-60 ${isDark ? 'bg-neutral-700 text-white' : 'bg-white text-neutral-800'}`}>Импортировать JSON</button>
                  </div>
                  <input ref={backupInputRef} type="file" accept="application/json,.json" className="sr-only" onChange={handleRestoreBackup} />
                  {pendingImportLessons && (
                    <div className={`mt-3 space-y-2 rounded-xl p-3 ${isDark ? 'bg-neutral-900' : 'bg-white'}`}>
                      <p className={`text-[11px] ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}>
                        В файле занятий: {pendingImportLessons.length}. Добавить к текущим или заменить всё расписание?
                      </p>
                      <button type="button" disabled={backupBusy} onClick={() => void applyImportedLessons('add')} className={`w-full rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60 ${isDark ? 'bg-neutral-700 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
                        {backupBusy ? 'Сохраняю…' : 'Добавить только новые'}
                      </button>
                      <button type="button" disabled={backupBusy} onClick={() => void applyImportedLessons('replace')} className={`w-full rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60 ${isDark ? 'bg-neutral-700 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
                        Заменить расписание
                      </button>
                      <button type="button" disabled={backupBusy} onClick={() => { setPendingImportLessons(null); setBackupMessage(null); }} className={`w-full py-1 text-[11px] disabled:opacity-60 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                        Отмена
                      </button>
                    </div>
                  )}
                  {backupMessage && <p role="status" className={`mt-2 text-[11px] ${backupError ? 'text-rose-500' : isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{backupMessage}</p>}
                </div>

                <button
                  type="button"
                  onClick={() => setIsChangingPin(true)}
                  className={`w-full p-3.5 rounded-2xl flex items-center justify-between text-left transition-all active:scale-[0.98] ${
                    isDark
                      ? 'bg-neutral-800 text-white hover:bg-neutral-700/80'
                      : 'bg-neutral-100/70 text-neutral-800 hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${isDark ? 'bg-neutral-700 text-neutral-200' : 'bg-white text-neutral-600 shadow-2xs'}`}>
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm leading-tight font-semibold">Сменить код доступа</div>
                      <div className={`text-[11px] font-normal ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                        Перешифровать расписание новым паролем / PIN
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onLogoutAdmin();
                    onClose();
                  }}
                  className={`w-full py-3.5 px-4 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all ${
                    isDark
                      ? 'bg-white text-neutral-900 hover:bg-neutral-200'
                      : 'bg-neutral-900 text-white hover:bg-neutral-800'
                  }`}
                >
                  <Unlock className="w-4 h-4 text-emerald-500" />
                  <span>Выйти из режима управления</span>
                </button>
              </div>
            ) : (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPinModal();
                  }}
                  className={`w-full py-3.5 px-4 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-xs ${
                    isDark
                      ? 'bg-white text-neutral-900 hover:bg-neutral-200'
                      : 'bg-neutral-900 text-white hover:bg-neutral-800'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  <span>Войти как администратор</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
