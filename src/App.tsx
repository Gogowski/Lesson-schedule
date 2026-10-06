import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore';
import { Lesson, DayKey } from './types';
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
import { CloudLogin } from './components/CloudLogin';
import { CloudScheduleSetup } from './components/CloudScheduleSetup';
import { MobileActionMenu } from './components/MobileActionMenu';
import { firebaseAuth, firebaseConfigured, firestore, scheduleEditorUid } from './services/firebase';
import { supabase, supabaseConfigured } from './services/supabase';
import { isLessons } from './utils/scheduleValidation';
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
const authProvider = supabaseConfigured ? 'supabase' : firebaseConfigured ? 'firebase' : 'local';
const useSupabase = authProvider === 'supabase';
const useFirebase = authProvider === 'firebase';
const cloudConfigured = authProvider !== 'local';

export default function App() {
  const [cloudUser, setCloudUser] = useState<{ uid: string } | null>(null);
  const [cloudAuthReady, setCloudAuthReady] = useState(!cloudConfigured);
  const [cloudRoleReady, setCloudRoleReady] = useState(!useSupabase);
  const [supabaseRole, setSupabaseRole] = useState<'editor' | 'viewer' | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(cloudConfigured);
  const [scheduleMissing, setScheduleMissing] = useState(false);
  const [scheduleVersion, setScheduleVersion] = useState(0);
  const [cloudError, setCloudError] = useState('');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeDay, setActiveDay] = useState<DayKey | 'all'>(() => getCurrentDayKey());
  const [adminPin, setAdminPin] = useState<string | null>(() => localStorage.getItem(ADMIN_STORAGE_KEY));
  const isAdmin = useFirebase
    ? Boolean(cloudUser && scheduleEditorUid && cloudUser.uid === scheduleEditorUid)
    : useSupabase
      ? supabaseRole === 'editor'
      : Boolean(adminPin);

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

  useEffect(() => {
    if (useFirebase && firebaseAuth) {
      return onAuthStateChanged(firebaseAuth, (user) => {
        setCloudUser(user ? { uid: user.uid } : null);
        setCloudAuthReady(true);
      });
    }
    if (!supabase) return;
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCloudUser(session?.user ? { uid: session.user.id } : null);
      setSupabaseRole(null);
      setCloudRoleReady(!session?.user);
      setCloudAuthReady(true);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!useSupabase || !supabase) {
      setCloudRoleReady(true);
      return;
    }
    if (!cloudUser) {
      setSupabaseRole(null);
      setCloudRoleReady(true);
      setCloudError('');
      return;
    }

    let cancelled = false;
    setCloudRoleReady(false);
    setCloudError('');
    void supabase
      .from('schedule_access')
      .select('role')
      .eq('user_id', cloudUser.uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setSupabaseRole(null);
          setCloudError('Не удалось проверить права пользователя.');
        } else if (data?.role === 'editor' || data?.role === 'viewer') {
          setSupabaseRole(data.role);
        } else {
          setSupabaseRole(null);
          setCloudError('У этого аккаунта нет доступа к расписанию.');
        }
        setCloudRoleReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cloudUser]);

  useEffect(() => {
    if (!cloudConfigured) return;
    if (!cloudUser) {
      setLessons([]);
      setScheduleLoading(false);
      setScheduleMissing(false);
      setCloudError('');
      return;
    }
    if (useSupabase && !cloudRoleReady) return;
    if (useSupabase && !supabaseRole) {
      setLessons([]);
      setScheduleLoading(false);
      setScheduleMissing(false);
      return;
    }

    setScheduleLoading(true);
    setScheduleMissing(false);
    setCloudError('');
    if (useFirebase && firestore) {
      const scheduleRef = doc(firestore, 'schedules', 'current');
      return onSnapshot(scheduleRef, (snapshot) => {
        if (!snapshot.exists()) {
          setLessons([]);
          setScheduleVersion(0);
          setScheduleMissing(true);
        } else {
          const data = snapshot.data();
          if (!isLessons(data.lessons) || typeof data.version !== 'number') {
            setCloudError('Сохранённые данные расписания имеют неверный формат.');
          } else {
            setLessons(data.lessons);
            setScheduleVersion(data.version);
            setScheduleMissing(false);
          }
        }
        setScheduleLoading(false);
      }, (error) => {
        setCloudError(error.code === 'permission-denied'
          ? 'У этого аккаунта нет доступа к расписанию. Проверьте список разрешённых пользователей.'
          : 'Не удалось загрузить расписание. Проверьте подключение и настройки Firebase.');
        setScheduleLoading(false);
      });
    }

    const supabaseClient = supabase;
    if (!supabaseClient) return;
    let cancelled = false;
    const loadSchedule = async () => {
      const { data, error } = await supabaseClient
        .from('schedules')
        .select('lessons, version')
        .eq('id', 'current')
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setCloudError('Не удалось загрузить расписание. Проверьте подключение и права Supabase.');
      } else if (!data) {
        setLessons([]);
        setScheduleVersion(0);
        setScheduleMissing(true);
        setCloudError('');
      } else if (!isLessons(data.lessons) || typeof data.version !== 'number') {
        setCloudError('Сохранённые данные расписания имеют неверный формат.');
      } else {
        setLessons(data.lessons);
        setScheduleVersion(data.version);
        setScheduleMissing(false);
        setCloudError('');
      }
      setScheduleLoading(false);
    };
    void loadSchedule();
    const interval = window.setInterval(() => void loadSchedule(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [cloudUser, cloudRoleReady, supabaseRole]);

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
    if (cloudConfigured) return;
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
    if (cloudConfigured) return;
    fetchSchedule();
    const interval = setInterval(fetchSchedule, 15000);
      return () => clearInterval(interval);
  }, [fetchSchedule]);

  // Save to server
  const saveLessons = async (newLessons: Lesson[]) => {
    if (useFirebase) {
      if (!isAdmin || !firestore) return;
      const previousLessons = lessons;
      try {
        const scheduleRef = doc(firestore, 'schedules', 'current');
        await runTransaction(firestore, async (transaction) => {
          const snapshot = await transaction.get(scheduleRef);
          if (!snapshot.exists()) throw new Error('Расписание ещё не создано.');
          const currentVersion = Number(snapshot.data().version);
          if (currentVersion !== scheduleVersion) {
            throw new Error('Расписание изменилось в другом окне. Обновите страницу и повторите правку.');
          }
          transaction.update(scheduleRef, {
            lessons: newLessons,
            version: currentVersion + 1,
            updatedAt: new Date().toISOString(),
          });
        });
      } catch (error) {
        setLessons(previousLessons);
        window.alert(error instanceof Error ? error.message : 'Не удалось сохранить расписание.');
      }
      return;
    }

    if (useSupabase) {
      if (!isAdmin || !supabase) return;
      const previousLessons = lessons;
      const nextVersion = scheduleVersion + 1;
      try {
        const { data, error } = await supabase
          .from('schedules')
          .update({ lessons: newLessons, version: nextVersion, updated_at: new Date().toISOString() })
          .eq('id', 'current')
          .eq('version', scheduleVersion)
          .select('version')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Расписание изменилось в другом окне. Обновите страницу и повторите правку.');
        setLessons(newLessons);
        setScheduleVersion(nextVersion);
      } catch (error) {
        setLessons(previousLessons);
        window.alert(error instanceof Error ? error.message : 'Не удалось сохранить расписание.');
      }
      return;
    }

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
    if (useFirebase && firebaseAuth) {
      void signOut(firebaseAuth);
      return;
    }
    if (supabase) {
      void supabase.auth.signOut();
      return;
    }
    setAdminPin(null);
    localStorage.removeItem(ADMIN_STORAGE_KEY);
  };

  const handleCloudSignIn = async (email: string, password: string) => {
    if (firebaseAuth) {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      return;
    }
    if (!supabase) throw new Error('Облачный вход не настроен.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const handlePasswordReset = async (email: string) => {
    if (firebaseAuth) {
      await sendPasswordResetEmail(firebaseAuth, email);
      return;
    }
    if (supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href,
      });
      if (error) throw error;
      return;
    }
    throw new Error('Облачный вход не настроен.');
  };

  const handleImportSchedule = async (importedLessons: Lesson[]) => {
    if (!isAdmin) throw new Error('Только владелец может загрузить расписание.');
    if (useFirebase && firestore) {
      await setDoc(doc(firestore, 'schedules', 'current'), {
        version: 1,
        updatedAt: new Date().toISOString(),
        lessons: importedLessons,
      });
      return;
    }
    if (supabase) {
      const { error } = await supabase.from('schedules').insert({
        id: 'current',
        version: 1,
        updated_at: new Date().toISOString(),
        lessons: importedLessons,
      });
      if (error?.code === '23505') {
        throw new Error('Расписание уже создали в другой вкладке. Обновите страницу и проверьте его.');
      }
      if (error) throw error;
      setLessons(importedLessons);
      setScheduleVersion(1);
      setScheduleMissing(false);
      return;
    }
    throw new Error('Облачное хранилище не настроено.');
  };

  const handleExportBackup = () => {
    if (!cloudConfigured || !isAdmin) return;
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
    if (!isAdmin) throw new Error('Только владелец может восстановить расписание.');
    if (useFirebase && firestore) {
      const scheduleRef = doc(firestore, 'schedules', 'current');
      await runTransaction(firestore, async (transaction) => {
        const snapshot = await transaction.get(scheduleRef);
        if (!snapshot.exists()) throw new Error('Запись расписания не найдена.');
        const version = Number(snapshot.data().version);
        transaction.update(scheduleRef, {
          lessons: restoredLessons,
          version: version + 1,
          updatedAt: new Date().toISOString(),
        });
      });
      return;
    }
    if (supabase) {
      const nextVersion = scheduleVersion + 1;
      const { data, error } = await supabase
        .from('schedules')
        .update({ lessons: restoredLessons, version: nextVersion, updated_at: new Date().toISOString() })
        .eq('id', 'current')
        .eq('version', scheduleVersion)
        .select('version')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Расписание изменилось в другом окне. Обновите страницу и повторите восстановление.');
      setLessons(restoredLessons);
      setScheduleVersion(nextVersion);
      return;
    }
    throw new Error('Облачное хранилище не настроено.');
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

  if (import.meta.env.PROD && !cloudConfigured) {
    return (
      <main className={`min-h-screen flex items-center justify-center p-5 ${isDark ? 'bg-neutral-950 text-white' : 'bg-[#f5f6f8] text-neutral-900'}`}>
        <section className={`max-w-md rounded-3xl p-6 shadow-xl ${isDark ? 'bg-neutral-900' : 'bg-white'}`}>
          <h1 className="font-display font-bold text-lg">Приложение не настроено</h1>
          <p className="mt-2 text-sm leading-relaxed">Для безопасной публикации настройте Supabase-параметры и политики доступа. Демонстрационное расписание не будет опубликовано.</p>
        </section>
      </main>
    );
  }

  if (cloudConfigured) {
    if (!cloudAuthReady) {
      return <main className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-neutral-950 text-white' : 'bg-[#f5f6f8] text-neutral-900'}`}>Проверяю вход…</main>;
    }
    if (!cloudUser) {
      return <CloudLogin isDark={isDark} onSignIn={handleCloudSignIn} onResetPassword={useFirebase ? handlePasswordReset : undefined} />;
    }
    if (!cloudRoleReady) {
      return <main className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-neutral-950 text-white' : 'bg-[#f5f6f8] text-neutral-900'}`}>Проверяю права доступа…</main>;
    }
    if (scheduleLoading) {
      return <main className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-neutral-950 text-white' : 'bg-[#f5f6f8] text-neutral-900'}`}>Загружаю расписание…</main>;
    }
    if (cloudError) {
      return (
        <main className={`min-h-screen flex items-center justify-center p-5 ${isDark ? 'bg-neutral-950 text-white' : 'bg-[#f5f6f8] text-neutral-900'}`}>
          <section className={`max-w-md rounded-3xl p-6 shadow-xl ${isDark ? 'bg-neutral-900' : 'bg-white'}`}>
            <h1 className="font-display font-bold text-lg">Не удалось открыть расписание</h1>
            <p className="mt-2 text-sm text-rose-500">{cloudError}</p>
            <button onClick={handleLogout} className="mt-5 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white">Выйти</button>
          </section>
        </main>
      );
    }
    if (scheduleMissing) {
      return (
        <CloudScheduleSetup
          isDark={isDark}
          isEditor={isAdmin}
          onCreateEmpty={() => handleImportSchedule([])}
          onImport={handleImportSchedule}
          onLogout={handleLogout}
        />
      );
    }
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
        existingLessons={lessons}
        isDark={isDark}
      />

      <PinModal
        isOpen={!cloudConfigured && isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={handleAdminSuccess}
        isDark={isDark}
      />

      <MobileActionMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        isAdmin={isAdmin}
        isCloudMode={cloudConfigured}
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
