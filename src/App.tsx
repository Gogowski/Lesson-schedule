import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lesson, DayKey } from './types';
import { INITIAL_LESSONS } from './data/initialData';
import { getCurrentDayKey, timeToMinutes, getWeekDaysInfo } from './utils/timeUtils';
import { 
  checkLessonNotifications, 
  getNotificationsEnabled, 
  setNotificationsEnabled, 
  getNotificationPermission, 
  requestNotificationAccess, 
  sendTestNotification, 
  NotificationPermissionState 
} from './utils/notificationService';
import { EditLessonModal } from './components/EditLessonModal';
import { PinModal } from './components/PinModal';
import { MobileActionMenu } from './components/MobileActionMenu';
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
  CheckCircle2 
} from 'lucide-react';

const ADMIN_STORAGE_KEY = 'online_schedule_admin_pin';

export default function App() {
  const [lessons, setLessons] = useState<Lesson[]>(INITIAL_LESSONS);
  const [activeDay, setActiveDay] = useState<DayKey | 'all'>(() => getCurrentDayKey());
  const [adminPin, setAdminPin] = useState<string | null>(() => localStorage.getItem(ADMIN_STORAGE_KEY));
  const isAdmin = Boolean(adminPin);

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
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Week offset (0 = current week, 1 = next week, -1 = prev week)
  const [weekOffset, setWeekOffset] = useState(0);

  // Modals
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);

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

  // Reference date for current week offset
  const referenceDate = new Date();
  referenceDate.setDate(referenceDate.getDate() + weekOffset * 7);
  const { days: weekDays, currentMonthHeader } = getWeekDaysInfo(referenceDate);

  // Periodic time update & lesson notification checks
  useEffect(() => {
    // Initial check on mount
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

  // Fetch from server
  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch('/api/schedule');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.lessons)) {
          setLessons(data.lessons);
        }
      }
    } catch {
      // offline grace
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
    const interval = setInterval(fetchSchedule, 15000);
    return () => clearInterval(interval);
  }, [fetchSchedule]);

  // Save to server
  const saveLessons = async (newLessons: Lesson[]) => {
    setLessons(newLessons);
    if (!adminPin) return;

    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPin, lessons: newLessons }),
      });
    } catch (err) {
      console.error('Save error', err);
    }
  };

  const handleAdminSuccess = (pin: string) => {
    setAdminPin(pin);
    localStorage.setItem(ADMIN_STORAGE_KEY, pin);
  };

  const handleLogout = () => {
    setAdminPin(null);
    localStorage.removeItem(ADMIN_STORAGE_KEY);
  };

  const handleChangePin = async (currentPin: string, newPin: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin, newPin }),
      });
      if (res.ok) {
        setAdminPin(newPin);
        localStorage.setItem(ADMIN_STORAGE_KEY, newPin);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const handleOpenAdd = (dayToSet?: DayKey) => {
    setEditingLesson(null);
    if (dayToSet) setActiveDay(dayToSet);
    setIsEditModalOpen(true);
  };

  const handleEdit = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setIsEditModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Удалить урок?')) return;
    const updated = lessons.filter((l) => l.id !== id);
    saveLessons(updated);
  };

  const handleSaveLesson = (lesson: Lesson, replaceLessonId?: string) => {
    let updated: Lesson[] = [...lessons];

    if (replaceLessonId) {
      updated = updated.filter(l => l.id !== replaceLessonId);
      updated.push(lesson);
    } else {
      const existsIndex = updated.findIndex((l) => l.id === lesson.id);
      if (existsIndex >= 0) {
        updated[existsIndex] = lesson;
      } else {
        updated.push(lesson);
      }
    }

    saveLessons(updated);
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
  const isLessonPastToday = (lesson: Lesson): boolean => {
    if (weekOffset !== 0) return false;
    if (lesson.day !== currentTodayKey) return false;
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
  const filteredLessons = lessons
    .filter((l) => (activeDay === 'all' ? true : l.day === activeDay))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const activeDayInfo = weekDays.find(d => d.key === activeDay);

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
                  onClick={() => setWeekOffset(w => w - 1)}
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
                  onClick={() => setWeekOffset(w => w + 1)}
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
              const count = lessons.filter((l) => l.day === d.key).length;

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
            {filteredLessons.map((lesson) => {
              const startMins = timeToMinutes(lesson.startTime);
              const endMins = timeToMinutes(lesson.endTime);
              const isToday = currentTodayKey === lesson.day && weekOffset === 0;
              const isHappeningNow = isToday && currentTimeMinutes >= startMins && currentTimeMinutes < endMins;
              const isPastToday = isLessonPastToday(lesson);

              const countdownText = formatCountdownLabel(lesson, isToday, isHappeningNow, isPastToday);

              return (
                <div
                  key={lesson.id}
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
                          {weekDays.find((d) => d.key === lesson.day)?.short || lesson.day.toUpperCase()}
                        </span>
                      )}

                      <span className={`font-time font-bold text-[13px] tracking-wide ${
                        isPastToday 
                          ? isDark ? 'text-neutral-500' : 'text-neutral-400' 
                          : isDark ? 'text-neutral-200' : 'text-neutral-800'
                      }`}>
                        {lesson.startTime} — {lesson.endTime}
                      </span>

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
                    <div className={`mt-1 text-xs ${
                      isDark ? 'text-neutral-400' : 'text-neutral-500'
                    }`}>
                      <span className="font-medium">{lesson.teacherName}</span>
                    </div>
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
            <p className="text-base font-display font-bold">Уроков нет</p>
            <p className={`text-xs mt-1 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
              Отличный день для отдыха или самоподготовки
            </p>
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
