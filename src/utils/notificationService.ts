import { Lesson } from '../types';
import { getActualDayKey, timeToMinutes } from './timeUtils';

const STORAGE_KEY_ENABLED = 'lesson_notifications_enabled';
const STORAGE_KEY_NOTIFIED = 'lesson_notified_history';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

export function getNotificationsEnabled(): boolean {
  if (!isNotificationSupported()) return false;
  return localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';
}

export function setNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY_ENABLED, enabled ? 'true' : 'false');
}

export async function requestNotificationAccess(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported';

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotificationsEnabled(true);
    } else if (permission === 'denied') {
      setNotificationsEnabled(false);
    }
    return permission as NotificationPermissionState;
  } catch (error) {
    console.error('Failed to request notification permission', error);
    return 'unsupported';
  }
}

// Storage helper for sent notifications to avoid duplicate triggers
function getNotifiedHistory(): Record<string, number> {
  try {
    const data = localStorage.getItem(STORAGE_KEY_NOTIFIED);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function markAsNotified(key: string): void {
  try {
    const history = getNotifiedHistory();
    const now = Date.now();
    // Clean up entries older than 48 hours
    const cleaned: Record<string, number> = {};
    for (const [k, timestamp] of Object.entries(history)) {
      if (now - timestamp < 48 * 60 * 60 * 1000) {
        cleaned[k] = timestamp;
      }
    }
    cleaned[key] = now;
    localStorage.setItem(STORAGE_KEY_NOTIFIED, JSON.stringify(cleaned));
  } catch (err) {
    console.error('Failed to save notified history', err);
  }
}

function hasBeenNotified(key: string): boolean {
  const history = getNotifiedHistory();
  return Boolean(history[key]);
}

export function sendLocalNotification(title: string, options?: NotificationOptions): Notification | null {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return null;
  }

  try {
    const notif = new Notification(title, {
      icon: '/vite.svg',
      badge: '/vite.svg',
      ...options,
    });

    notif.onclick = () => {
      try {
        window.focus();
      } catch {
        // focus catch
      }
      notif.close();
    };

    return notif;
  } catch (err) {
    console.error('Error dispatching browser notification', err);
    return null;
  }
}

export function sendTestNotification(): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const notif = sendLocalNotification('Уведомления активны! 🔔', {
    body: 'Всё настроено: за 10 минут до начала каждого урока вам придёт напоминание.',
    tag: 'test-notification',
  });

  return Boolean(notif);
}

/**
 * Checks today's lessons and triggers notifications for lessons starting in <= 10 minutes.
 */
export function checkLessonNotifications(lessons: Lesson[]): void {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }

  if (!getNotificationsEnabled()) {
    return;
  }

  const actualDay = getActualDayKey();
  if (!actualDay) return;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const todayKeyStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const todaysLessons = lessons.filter((l) => l.day === actualDay);

  for (const lesson of todaysLessons) {
    const startMins = timeToMinutes(lesson.startTime);
    const minutesLeft = startMins - currentMinutes;

    // Trigger window: between 0 and 10 minutes before the lesson start
    if (minutesLeft >= 0 && minutesLeft <= 10) {
      const notificationKey = `${todayKeyStr}_lesson_${lesson.id}_10m`;

      if (!hasBeenNotified(notificationKey)) {
        const timeText = minutesLeft === 0 
          ? 'прямо сейчас' 
          : minutesLeft === 1 
          ? 'через 1 минуту' 
          : `через ${minutesLeft} мин`;

        sendLocalNotification(`Скоро урок: ${lesson.subject}`, {
          body: `Начало ${timeText} в ${lesson.startTime} • ${lesson.teacherName}`,
          tag: `lesson-alert-${lesson.id}-${todayKeyStr}`,
        });

        markAsNotified(notificationKey);
      }
    }
  }
}
