import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lesson, DayKey } from './types';
import { formatLocalDate, getCurrentDayKey, timeToMinutes, getWeekDaysInfo, parseLocalDate } from './utils/timeUtils';
import { getDateForDayInWeek, getWeekdayOrdinal, isLessonScheduledOnDate } from './utils/recurrence';
import {
  checkLessonNotifications,
  getNotificationsEnabled,
  setNotificationsEnabled,
  getNotificationPermission,
  requestNotificationAccess,
  sendTestNotification,
  NotificationPermissionState,
} from './utils/notificationService';
import { EditLessonModal } from './components/EditLessonModal';
import { PinModal } from './components/PinModal';
import { ScheduleLockScreen } from './components/ScheduleLockScreen';
import { MobileActionMenu } from './components/MobileActionMenu';
import {
  consumeUrlHashCredentials,
  decryptScheduleEnvelope,
  fetchEncryptedSchedule,
  saveEncryptedSchedule,
  setSavedAccessCode,
  setSavedGitHubToken,
  verifyGitHubToken,
} from './services/githubStorage';
import {
  Plus,
  Edit2,
  Trash2,
  Copy,
  Check,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
} from 'lucide-react';

const initialCreds = consumeUrlHashCredentials();

export default function App() {
  const [accessCode, setAccessCode] = useState<string>(() => initialCreds.accessCode);
  const [githubToken, setGithubToken] = useState<string>(() => initialCreds.githubToken);
  const [lockError, setLockError] = useState<string>('');
  const [scheduleReloadAttempt, setScheduleReloadAttempt] = useState(0);
  const [scheduleLoading, setScheduleLoading] = useState<boolean>(() => Boolean(initialCreds.accessCode));
  const [scheduleVersion, setScheduleVersion] = useState(0);
  const scheduleVersionRef = useRef(0);
  const scheduleShaRef = useRef<string | undefined>(undefined);
  const [cloudError, setCloudError] = useState('');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeDay, setActiveDay] = useState<DayKey | 'all'>(() => getCurrentDayKey());

  const isAdmin = Boolean(githubToken);

  // Dark mode state: default to saved or dark preference
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('app_theme');
    if (saved) return saved === 'dark';
    return false;
  });

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem('app_theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  useEffect(() => {
    const themeColor = isDark ? '#0a0a0a' : '#f5f6f8';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    document.documentElement.style.backgroundColor = themeColor;
    document.body.style.backgroundColor = themeColor;

    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute(
      'content',
      isDark ? 'black' : 'default'
    );
  }, [isDark]);

  // Load and poll encrypted schedule from GitHub API
  useEffect(() => {
    if (!accessCode) {
      setScheduleLoading(false);
      return;
    }

    let cancelled = false;
    let requestInFlight = false;

    const loadSchedule = async (force = false) => {
      if (cancelled || requestInFlight || (!force && document.visibilityState === 'hidden')) return;
      requestInFlight = true;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const { envelope, sha } = await fetchEncryptedSchedule(controller.signal);
        if (cancelled) return;
        const payload = await decryptScheduleEnvelope(envelope, accessCode);
        if (cancelled) return;

        scheduleShaRef.current = sha;
        if (payload.version >= scheduleVersionRef.current) {
          scheduleVersionRef.current = payload.version;
          setScheduleVersion(payload.version);
          setLessons(payload.lessons);
        }
        setCloudError('');
        setLockError('');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.message === 'INVALID_ACCESS_CODE') {
          setSavedAccessCode(null);
          setAccessCode('');
          setLockError('Код доступа не подошёл. Введите актуальный код доступа.');
        } else if (scheduleVersionRef.current === 0) {
          setCloudError(
            controller.signal.aborted
              ? 'Превышено время ожидания ответа от GitHub. Проверьте интернет.'
              : err instanceof Error
              ? err.message
              : 'Не удалось загрузить расписание с GitHub.'
          );
        }
      } finally {
        window.clearTimeout(timeoutId);
        requestInFlight = false;
        if (!cancelled) setScheduleLoading(false);
      }
    };

    setScheduleLoading(scheduleVersionRef.current === 0);
    void loadSchedule(true);

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadSchedule(true);
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    const interval = window.setInterval(() => void loadSchedule(), 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [accessCode, scheduleReloadAttempt]);

  const handleUnlock = async (enteredCode: string, enteredToken?: string) => {
    if (enteredToken) {
      const validToken = await verifyGitHubToken(enteredToken);
      if (!validToken) {
        throw new Error('Токен GitHub не подошёл или не имеет прав записи в репозиторий.');
      }
    }

    const { envelope, sha } = await fetchEncryptedSchedule();
    let payload;
    try {
      payload = await decryptScheduleEnvelope(envelope, enteredCode);
    } catch (err) {
      if (err instanceof Error && err.message === 'INVALID_ACCESS_CODE') {
        throw new Error('Неверный код доступа к расписанию.');
      }
      throw err;
    }

    setSavedAccessCode(enteredCode);
    setAccessCode(enteredCode);
    if (enteredToken) {
      setSavedGitHubToken(enteredToken);
      setGithubToken(enteredToken);
    }
    scheduleShaRef.current = sha;
    scheduleVersionRef.current = payload.version;
    setScheduleVersion(payload.version);
    setLessons(payload.lessons);
    setLockError('');
    setCloudError('');
    setScheduleLoading(false);
  };

  // Week offset (0 = current week, 1 = next week, -1 = prev week)
  const [weekOffset, setWeekOffset] = useState(0);

  // Modals
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [defaultLessonDate, setDefaultLessonDate] = useState(() => formatLocalDate(new Date()));

  // Browser Notification states
  const [notificationsEnabled, setNotificationsEnabledState] = useState(() => getNotificationsEnabled());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(() => getNotificationPermission());

  // Copied toast
  const [copiedHwId, setCopiedHwId] = useState<string | null>(null);

  // Current time tracker
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  const currentTodayKey = getCurrentDayKey();
  const todayDateISO = formatLocalDate(new Date());

  // Reference date for current week offset
  const referenceDate = new Date();
  referenceDate.setDate(referenceDate.getDate() + weekOffset * 7);
  const { days: weekDays, currentMonthHeader } = getWeekDaysInfo(referenceDate);

  // Periodic time update & lesson notification checks
  useEffect(() => {
    checkLessonNotifications(lessons);

    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTimeMinutes(now.getHours() * 60 + now.getMinutes());
      checkLessonNotifications(lessons);
    }, 10000);
    return () => clearInterval(timer);
  }, [lessons]);

  const handleToggleNotifications = async (): Promise<boolean> => {
    const perm = getNotificationPermission();
    if (!notificationsEnabled) {
      if (perm !== 'granted') {
        const newPerm = await requestNotificationAccess();
        setNotificationPermission(newPerm);
        if (newPerm === 'granted') {
          setNotificationsEnabled(true);
          setNotificationsEnabledState(true);
          sendTestNotification();
          checkLessonNotifications(lessons);
          return true;
        }
        return false;
      } else {
        setNotificationsEnabled(true);
        setNotificationsEnabledState(true);
        sendTestNotification();
        checkLessonNotifications(lessons);
        return true;
      }
    } else {
      setNotificationsEnabled(false);
      setNotificationsEnabledState(false);
      return false;
    }
  };

  const handleSendTestNotification = (): boolean => {
    return sendTestNotification();
  };

  // Save to GitHub
  const saveLessons = async (newLessons: Lesson[]): Promise<boolean> => {
    if (!isAdmin || !githubToken || !accessCode) return false;
    try {
      const { version, sha } = await saveEncryptedSchedule(
        newLessons,
        accessCode,
        githubToken,
        scheduleVersionRef.current,
        scheduleShaRef.current
      );
      scheduleVersionRef.current = version;
      scheduleShaRef.current = sha;
      setScheduleVersion(version);
      setLessons(newLessons);
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось сохранить расписание в GitHub.');
      return false;
    }
  };

  const handleAdminSuccess = (token: string) => {
    setGithubToken(token);
    setSavedGitHubToken(token);
  };

  const handleLogout = () => {
    setGithubToken('');
    setSavedGitHubToken(null);
  };

  const handleRetryCloudLoad = () => {
    setCloudError('');
    setScheduleLoading(true);
    setScheduleReloadAttempt((attempt) => attempt + 1);
  };

  const handleExportBackup = () => {
    if (!isAdmin) return;
    const backup = {
      version: scheduleVersion,
      exportedAt: new Date().toISOString(),
      lessons,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `lesson-schedule-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleRestoreBackup = async (restoredLessons: Lesson[]) => {
    if (!isAdmin || !githubToken || !accessCode) {
      throw new Error('Только администратор может восстановить расписание.');
    }
    const { version, sha } = await saveEncryptedSchedule(
      restoredLessons,
      accessCode,
      githubToken,
      scheduleVersionRef.current,
      scheduleShaRef.current
    );
    scheduleVersionRef.current = version;
    scheduleShaRef.current = sha;
    setScheduleVersion(version);
    setLessons(restoredLessons);
  };

  const handleChangePin = async (currentPin: string, newPin: string): Promise<boolean> => {
    if (!isAdmin || !githubToken) return false;
    if (currentPin.trim() !== accessCode.trim()) return false;
    const normalizedNew = newPin.trim();
    if (!normalizedNew) return false;

    try {
      const { version, sha } = await saveEncryptedSchedule(
        lessons,
        normalizedNew,
        githubToken,
        scheduleVersionRef.current,
        scheduleShaRef.current
      );
      scheduleVersionRef.current = version;
      scheduleShaRef.current = sha;
      setScheduleVersion(version);
      setAccessCode(normalizedNew);
      setSavedAccessCode(normalizedNew);
      return true;
    } catch {
      return false;
    }
  };

  const handleOpenAdd = (dayToSet?: DayKey) => {
    const targetDay = dayToSet || currentTodayKey;
    let firstDate = weekDays.find((d) => d.key === targetDay)?.dateISO || getDateForDayInWeek(referenceDate, targetDay);
    if (weekOffset === 0 && firstDate < todayDateISO) {
      const nextOccurrence = parseLocalDate(firstDate);
      if (nextOccurrence) {
        nextOccurrence.setDate(nextOccurrence.getDate() + 7);
        firstDate = formatLocalDate(nextOccurrence);
      }
    }
    setDefaultLessonDate(firstDate);
    setEditingLesson(null);
    setActiveDay(targetDay);
    setIsEditModalOpen(true);
  };

  const handleEdit = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setDefaultLessonDate(lesson.recurrence?.startDate || getDateForDayInWeek(referenceDate, lesson.day));
    setIsEditModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Удалить урок?')) return;
    const updated = lessons.filter((l) => l.id !== id);
    void saveLessons(updated);
  };

  const handleSaveLesson = (lesson: Lesson, replaceLessonId?: string): Promise<boolean> => {
    let updated: Lesson[] = [...lessons];

    if (replaceLessonId) {
      updated = updated.filter((l) => l.id !== replaceLessonId);
      updated.push(lesson);
    } else {
      const existsIndex = updated.findIndex((l) => l.id === lesson.id);
      if (existsIndex >= 0) {
        updated[existsIndex] = lesson;
      } else {
        updated.push(lesson);
      }
    }

    return saveLessons(updated);
  };

  const handleCopyHomework = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHwId(id);
    setTimeout(() => setCopiedHwId(null), 2000);
  };

  // Touch Swipe Gesture handler
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    if (activeDay === 'all') return;

    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    const diffY = touchStartY.current - e.changedTouches[0].clientY;

    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
      const dayKeys: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
      const currentIndex = dayKeys.indexOf(activeDay);

      if (diffX > 0 && currentIndex < dayKeys.length - 1) {
        setActiveDay(dayKeys[currentIndex + 1]);
      } else if (diffX < 0 && currentIndex > 0) {
        setActiveDay(dayKeys[currentIndex - 1]);
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Past check: ONLY for today in current week!
  const isLessonPastToday = (lesson: Lesson, occurrenceDate: string): boolean => {
    if (occurrenceDate !== todayDateISO) return false;
    const endMins = timeToMinutes(lesson.endTime);
    return currentTimeMinutes >= endMins;
  };

  // Helper to format remaining time label
  const formatCountdownLabel = (lesson: Lesson, isToday: boolean, isHappeningNow: boolean, isPastToday: boolean) => {
    if (isHappeningNow) {
      const endMins = timeToMinutes(lesson.endTime);
      const remaining = Math.max(1, endMins - currentTimeMinutes);
      return `Идёт сейчас · осталось ${remaining} мин`;
    }

    if (isPastToday) {
      return `Урок завершён`;
    }

    if (isToday) {
      const startMins = timeToMinutes(lesson.startTime);
      const diff = startMins - currentTimeMinutes;
      if (diff > 0) {
        if (diff >= 60) {
          const h = Math.floor(diff / 60);
          const m = diff % 60;
          return `До урока ${h} ч ${m > 0 ? `${m} мин` : ''}`;
        }
        return `До урока ${diff} мин`;
      }
    }

    return `Начало в ${lesson.startTime}`;
  };

  // Filter lessons
  const weekOccurrences = weekDays.flatMap((dayInfo) => {
    const occurrenceDate = parseLocalDate(dayInfo.dateISO);
    if (!occurrenceDate) return [];
    return lessons
      .filter((lesson) => isLessonScheduledOnDate(lesson, occurrenceDate))
      .map((lesson) => ({ lesson, day: dayInfo.key, date: dayInfo.dateISO }));
  });
  const filteredLessons = weekOccurrences
    .filter((occurrence) => activeDay === 'all' || occurrence.day === activeDay)
    .sort((a, b) => {
      if (activeDay === 'all') {
        const weekdayDifference = ['mon', 'tue', 'wed', 'thu', 'fri'].indexOf(a.day) - ['mon', 'tue', 'wed', 'thu', 'fri'].indexOf(b.day);
        if (weekdayDifference !== 0) return weekdayDifference;
      }
      return timeToMinutes(a.lesson.startTime) - timeToMinutes(b.lesson.startTime);
    });

  const activeDayInfo = weekDays.find((d) => d.key === activeDay);

  if (!accessCode) {
    return (
      <ScheduleLockScreen
        isDark={isDark}
        errorMessage={lockError}
        onUnlock={handleUnlock}
      />
    );
  }

  if (scheduleLoading) {
    return (
      <main className={`min-h-screen flex items-center justify-center p-6 ${isDark ? 'bg-neutral-950 text-white' : 'bg-[#f5f6f8] text-neutral-900'}`}>
        <div role="status" className="flex items-center gap-3 text-sm font-medium">
          <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>Загружаю расписание…</span>
        </div>
      </main>
    );
  }

  if (cloudError) {
    return (
      <main className={`min-h-screen flex items-center justify-center p-5 ${isDark ? 'bg-neutral-950 text-white' : 'bg-[#f5f6f8] text-neutral-900'}`}>
        <section className={`max-w-md rounded-3xl p-6 shadow-xl ${isDark ? 'bg-neutral-900' : 'bg-white'}`}>
          <h1 className="font-display font-bold text-lg">Не удалось открыть расписание</h1>
          <p className="mt-2 text-sm text-rose-500">{cloudError}</p>
          <div className="mt-5 flex gap-2">
            <button onClick={handleRetryCloudLoad} className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold ${isDark ? 'bg-white text-neutral-900' : 'bg-neutral-900 text-white'}`}>Попробовать снова</button>
            <button
              onClick={() => {
                setSavedAccessCode(null);
                setAccessCode('');
                setCloudError('');
              }}
              className={`rounded-xl px-4 py-3 text-sm font-semibold ${isDark ? 'bg-neutral-800 text-neutral-200' : 'bg-neutral-100 text-neutral-700'}`}
            >
              Сменить код
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div
      className={`min-h-screen pb-32 select-none transition-colors duration-200 ${
        isDark ? 'bg-neutral-950 text-white' : 'bg-[#f5f6f8] text-neutral-900'
      }`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Bar with Month & Calendar Header */}
      <header className={`sticky top-0 z-30 backdrop-blur-md px-3 sm:px-4 pt-3 pb-2.5 transition-colors ${
        isDark ? 'bg-neutral-950/95' : 'bg-[#f5f6f8]/95'
      }`}>
        <div className="max-w-md md:max-w-3xl mx-auto space-y-2.5">
          {/* Top navigation row: Month + Navigation + Quick theme toggle + Action menu */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <span className={`text-xs sm:text-sm font-display font-semibold tracking-tight ${
                isDark ? 'text-neutral-200' : 'text-neutral-800'
              }`}>
                {currentMonthHeader}
              </span>

              {/* Prev / Next week switches */}
              <div className={`flex items-center ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                <button
                  onClick={() => setWeekOffset((w) => w - 1)}
                  className={`p-1 rounded-lg transition-colors ${isDark ? 'hover:text-white hover:bg-neutral-800' : 'hover:text-neutral-900 hover:bg-neutral-200/60'}`}
                  title="Предыдущая неделя"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {weekOffset !== 0 && (
                  <button
                    onClick={() => {
                      setWeekOffset(0);
                      setActiveDay(currentTodayKey);
                    }}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md mx-0.5 ${
                      isDark ? 'text-neutral-900 bg-white' : 'text-neutral-900 bg-neutral-200/80'
                    }`}
                  >
                    Сейчас
                  </button>
                )}
                <button
                  onClick={() => setWeekOffset((w) => w + 1)}
                  className={`p-1 rounded-lg transition-colors ${isDark ? 'hover:text-white hover:bg-neutral-800' : 'hover:text-neutral-900 hover:bg-neutral-200/60'}`}
                  title="Следующая неделя"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right actions: All Week toggle + Menu */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveDay(activeDay === 'all' ? currentTodayKey : 'all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 shadow-2xs ${
                  activeDay === 'all'
                    ? isDark ? 'bg-white text-neutral-900' : 'bg-neutral-900 text-white'
                    : isDark ? 'bg-neutral-900 text-neutral-300 hover:text-white' : 'bg-white text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <span>{activeDay === 'all' ? 'По дням' : 'Вся неделя'}</span>
              </button>

              <button
                onClick={() => setIsMenuOpen(true)}
                className={`p-2 rounded-xl shadow-2xs active:scale-95 transition-all relative ${
                  isDark ? 'bg-neutral-900 text-neutral-300 hover:text-white' : 'bg-white text-neutral-600 hover:text-neutral-900'
                }`}
                title="Опции"
              >
                <MoreHorizontal className="w-4 h-4" />
                {isAdmin && (
                  <span className={`absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ${
                    isDark ? 'ring-neutral-900' : 'ring-white'
                  }`} />
                )}
              </button>
            </div>
          </div>

          {/* Full-width Calendar Thumb Strip with Month Days */}
          <div className={`grid grid-cols-5 gap-1.5 p-1 rounded-2xl transition-colors ${
            isDark ? 'bg-neutral-900' : 'bg-neutral-200/60'
          }`}>
            {weekDays.map((d) => {
              const isSelected = activeDay === d.key;

              return (
                <button
                  key={d.key}
                  onClick={() => setActiveDay(d.key)}
                  className={`py-2 px-1 rounded-xl text-center transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 relative ${
                    isSelected
                      ? isDark ? 'bg-white text-neutral-900 shadow-xs' : 'bg-neutral-900 text-white shadow-xs'
                      : isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <span className={`text-[10px] font-bold tracking-wider leading-none ${
                    isSelected
                      ? isDark ? 'text-neutral-600' : 'text-neutral-300'
                      : isDark ? 'text-neutral-500' : 'text-neutral-400'
                  }`}>
                    {d.short}
                  </span>

                  <span className="text-base sm:text-lg font-display font-bold leading-tight">
                    {d.dayNumber}
                  </span>

                  {d.isToday && weekOffset === 0 && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected
                          ? isDark ? 'bg-emerald-600' : 'bg-emerald-400'
                          : 'bg-emerald-500'
                      }`}
                      title="Сегодня"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-md md:max-w-3xl mx-auto px-3 sm:px-4 pt-1">
        {/* Day Header Info */}
        {activeDay !== 'all' && activeDayInfo && (
          <div className="flex items-center justify-between py-2 px-1 text-xs">
            <div className="flex items-center gap-2">
              <span className={`font-display font-bold text-sm ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                {activeDayInfo.label}, {activeDayInfo.dateStr}
              </span>
              {activeDayInfo.isToday && weekOffset === 0 && (
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                  isDark ? 'bg-emerald-950 text-emerald-400' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  Сегодня
                </span>
              )}
            </div>

            <span className={`font-mono text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
              {filteredLessons.length} {filteredLessons.length === 1 ? 'урок' : filteredLessons.length >= 2 && filteredLessons.length <= 4 ? 'урока' : 'уроков'}
            </span>
          </div>
        )}

        {/* Lessons List */}
        {filteredLessons.length > 0 ? (
          <div className={activeDay === 'all' ? 'grid grid-cols-1 md:grid-cols-2 gap-3.5' : 'space-y-3'}>
            {filteredLessons.map(({ lesson, day: occurrenceDay, date: occurrenceDate }) => {
              const startMins = timeToMinutes(lesson.startTime);
              const endMins = timeToMinutes(lesson.endTime);
              const isToday = occurrenceDate === todayDateISO;
              const isHappeningNow = isToday && currentTimeMinutes >= startMins && currentTimeMinutes < endMins;
              const isPastToday = isLessonPastToday(lesson, occurrenceDate);

              const countdownText = formatCountdownLabel(lesson, isToday, isHappeningNow, isPastToday);

              return (
                <div
                  key={`${lesson.id}-${occurrenceDate}`}
                  className={`rounded-[22px] p-4 transition-all duration-200 shadow-2xs relative ${
                    isPastToday
                      ? isDark ? 'bg-neutral-900/40 opacity-50' : 'bg-neutral-100/75 opacity-65'
                      : isHappeningNow
                      ? isDark ? 'bg-neutral-900 ring-2 ring-emerald-500 shadow-md' : 'bg-white ring-2 ring-emerald-500 shadow-md'
                      : isDark ? 'bg-neutral-900' : 'bg-white'
                  }`}
                >
                  {/* Top Bar inside card: Time + Live badge + Admin actions */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {activeDay === 'all' && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md font-display ${
                          isDark ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-900'
                        }`}>
                          {weekDays.find((d) => d.key === occurrenceDay)?.short || occurrenceDay.toUpperCase()}
                        </span>
                      )}

                      <span className={`font-time font-bold text-[13px] tracking-wide ${
                        isPastToday
                          ? isDark ? 'text-neutral-500' : 'text-neutral-400'
                          : isDark ? 'text-neutral-200' : 'text-neutral-800'
                      }`}>
                        {lesson.startTime} — {lesson.endTime}
                      </span>

                      {lesson.recurrence?.frequency === 'biweekly' && (
                        <span className={`text-[10px] font-semibold ${isDark ? 'text-sky-400' : 'text-sky-700'}`} title="Урок повторяется раз в две недели">
                          Раз в 2 недели
                        </span>
                      )}
                      {lesson.recurrence?.frequency === 'monthly' && (
                        <span className={`text-[10px] font-semibold ${isDark ? 'text-sky-400' : 'text-sky-700'}`} title={`Повтор каждый месяц: ${getWeekdayOrdinal(lesson.recurrence.startDate)}-й ${weekDays.find((d) => d.key === lesson.day)?.short} месяца`}>
                          Раз в месяц
                        </span>
                      )}

                      {/* Floating / temporary schedule label */}
                      {lesson.isFlexible && (
                        <span
                          className={`text-xs font-semibold tracking-wide transition-colors ${
                            isPastToday
                              ? isDark ? 'text-neutral-500' : 'text-neutral-400'
                              : isDark ? 'text-amber-400' : 'text-amber-600'
                          }`}
                          title="Плавающий график — время занятия временное"
                        >
                          Временно
                        </span>
                      )}

                      {isPastToday && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Завершён
                        </span>
                      )}
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleEdit(lesson)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isDark ? 'text-neutral-400 hover:text-white active:bg-neutral-800' : 'text-neutral-400 hover:text-neutral-900 active:bg-neutral-100'
                          }`}
                          title="Редактировать"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(lesson.id)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isDark ? 'text-neutral-400 hover:text-rose-400 active:bg-neutral-800' : 'text-neutral-400 hover:text-rose-600 active:bg-rose-50'
                          }`}
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Subject & Teacher Name */}
                  <div className="mb-2.5">
                    <h2 className={`text-base font-display font-bold leading-snug tracking-tight ${
                      isPastToday
                        ? isDark ? 'text-neutral-400' : 'text-neutral-500'
                        : isDark ? 'text-white' : 'text-neutral-900'
                    }`}>
                      {lesson.subject}
                    </h2>
                    {lesson.teacherName.trim() && (
                      <div className={`mt-1 text-xs ${
                        isDark ? 'text-neutral-400' : 'text-neutral-500'
                      }`}>
                        <span className="font-medium">{lesson.teacherName}</span>
                      </div>
                    )}
                  </div>

                  {/* Status Note */}
                  {lesson.statusNote && (
                    <div className={`mb-2.5 px-3 py-1.5 rounded-xl text-xs font-medium ${
                      isDark ? 'bg-amber-950/50 text-amber-300' : 'bg-amber-500/10 text-amber-950'
                    }`}>
                      {lesson.statusNote}
                    </div>
                  )}

                  {/* Homework Card */}
                  {lesson.homework && (
                    <div
                      onClick={() => handleCopyHomework(lesson.id, lesson.homework!)}
                      className={`mb-3 px-3.5 py-2.5 rounded-2xl text-xs cursor-pointer active:scale-[0.99] transition-all flex items-start justify-between gap-2 border ${
                        isDark
                          ? 'bg-neutral-800/80 hover:bg-neutral-800 text-neutral-200 border-neutral-700/60'
                          : 'bg-neutral-50 hover:bg-neutral-100/70 text-neutral-800 border-neutral-100'
                      }`}
                      title="Нажмите, чтобы скопировать Д/З"
                    >
                      <div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider block mb-0.5 ${
                          isDark ? 'text-neutral-400' : 'text-neutral-400'
                        }`}>
                          Д/З
                        </span>
                        <p className="leading-relaxed select-text font-normal">{lesson.homework}</p>
                      </div>

                      <div className={`shrink-0 pt-0.5 ${isDark ? 'text-neutral-400' : 'text-neutral-400'}`}>
                        {copiedHwId === lesson.id ? (
                          <span className="text-[11px] font-bold text-emerald-500 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>Скопировано</span>
                          </span>
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Countdown / Time Banner: Clean simple inverted colors */}
                  <div
                    className={`w-full py-3 px-4 rounded-xl text-xs font-display font-bold tracking-tight flex items-center justify-center gap-2 transition-all select-none ${
                      isHappeningNow
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : isPastToday
                        ? isDark ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-200/70 text-neutral-500'
                        : isDark ? 'bg-white text-neutral-900' : 'bg-neutral-900 text-white'
                    }`}
                  >
                    <Clock className="w-4 h-4 opacity-80" />
                    <span className="font-time tracking-wide text-xs sm:text-[13px]">
                      {countdownText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`py-20 text-center rounded-3xl p-6 shadow-xs transition-colors ${
            isDark ? 'bg-neutral-900' : 'bg-white'
          }`}>
            <p className="text-base font-display font-bold">
              {lessons.length === 0 ? 'Расписание пока пустое' : 'Уроков нет'}
            </p>
            <p className={`text-xs mt-1 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
              {lessons.length === 0
                ? isAdmin ? 'Добавьте первое занятие, и оно появится здесь у обоих пользователей.' : 'Владелец пока не добавил занятия.'
                : 'Отличный день для отдыха или самоподготовки'}
            </p>
            {isAdmin && lessons.length === 0 && (
              <button
                type="button"
                onClick={() => handleOpenAdd(activeDay === 'all' ? 'mon' : activeDay)}
                className={`mt-5 rounded-xl px-4 py-2.5 text-xs font-semibold ${isDark ? 'bg-white text-neutral-900' : 'bg-neutral-900 text-white'}`}
              >
                Добавить первое занятие
              </button>
            )}
          </div>
        )}
      </main>

      {/* Floating Action Button (FAB) for Admin */}
      {isAdmin && (
        <button
          onClick={() => handleOpenAdd(activeDay === 'all' ? 'mon' : activeDay)}
          className={`fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-xl active:scale-90 transition-transform ${
            isDark ? 'bg-white text-neutral-900 hover:bg-neutral-200' : 'bg-neutral-900 text-white hover:bg-neutral-800'
          }`}
          title="Добавить урок"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* Bottom Sheet Modals */}
      <EditLessonModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveLesson}
        onDelete={handleDelete}
        initialLesson={editingLesson}
        defaultDay={activeDay === 'all' ? 'mon' : activeDay}
        defaultDate={defaultLessonDate}
        existingLessons={lessons}
        isDark={isDark}
      />

      <PinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={handleAdminSuccess}
        isDark={isDark}
      />

      <MobileActionMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        isAdmin={isAdmin}
        currentLessons={lessons}
        onExportBackup={handleExportBackup}
        onImportBackup={handleRestoreBackup}
        onOpenPinModal={() => setIsPinModalOpen(true)}
        onLogoutAdmin={handleLogout}
        onChangePin={handleChangePin}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={handleToggleNotifications}
        onSendTestNotification={handleSendTestNotification}
        notificationPermission={notificationPermission}
      />
    </div>
  );
}
