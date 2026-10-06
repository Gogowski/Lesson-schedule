import { DayKey, Lesson, LessonRepeatFrequency, LessonStatus } from '../types';
import { dayKeyForDate } from './recurrence';
import { parseLocalDate } from './timeUtils';

const VALID_DAYS = new Set<DayKey>(['mon', 'tue', 'wed', 'thu', 'fri']);
const VALID_STATUSES = new Set<LessonStatus>(['scheduled', 'rescheduled', 'cancelled']);
const VALID_FREQUENCIES = new Set<LessonRepeatFrequency>(['weekly', 'biweekly', 'monthly']);

function isValidRecurrence(value: unknown, lessonDay: DayKey): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object') return false;
  const recurrence = value as Record<string, unknown>;
  if (typeof recurrence.frequency !== 'string' || !VALID_FREQUENCIES.has(recurrence.frequency as LessonRepeatFrequency)) return false;
  if (typeof recurrence.startDate !== 'string') return false;
  const startDate = parseLocalDate(recurrence.startDate);
  return Boolean(startDate && dayKeyForDate(startDate) === lessonDay);
}

export function isLessons(value: unknown): value is Lesson[] {
  if (!Array.isArray(value) || value.length > 100) return false;

  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const lesson = item as Record<string, unknown>;
    return typeof lesson.id === 'string'
      && lesson.id.length > 0
      && typeof lesson.day === 'string'
      && VALID_DAYS.has(lesson.day as DayKey)
      && typeof lesson.startTime === 'string'
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(lesson.startTime)
      && typeof lesson.endTime === 'string'
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(lesson.endTime)
      && typeof lesson.subject === 'string'
      && typeof lesson.teacherName === 'string'
      && (lesson.isFlexible === undefined || typeof lesson.isFlexible === 'boolean')
      && isValidRecurrence(lesson.recurrence, lesson.day as DayKey)
      && (lesson.status === undefined || (typeof lesson.status === 'string' && VALID_STATUSES.has(lesson.status as LessonStatus)))
      && (lesson.statusNote === undefined || typeof lesson.statusNote === 'string')
      && (lesson.meetingUrl === undefined || typeof lesson.meetingUrl === 'string')
      && (lesson.homework === undefined || typeof lesson.homework === 'string');
  });
}

export function parseLessonsJson(text: string): Lesson[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Файл не является корректным JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || !isLessons((parsed as { lessons?: unknown }).lessons)) {
    throw new Error('В файле нет корректного массива уроков (максимум 100).');
  }
  return (parsed as { lessons: Lesson[] }).lessons;
}
