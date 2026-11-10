import { DayKey, Lesson } from '../types';
import { formatLocalDate, parseLocalDate } from './timeUtils';

const DATE_TO_DAY: Record<number, DayKey> = {
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
};

export function dayKeyForDate(date: Date): DayKey | null {
  return DATE_TO_DAY[date.getDay()] || null;
}

function calendarDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

function monthlyWeekdayDate(anchor: Date, year: number, month: number): number | null {
  const weekday = anchor.getDay();
  const ordinal = Math.floor((anchor.getDate() - 1) / 7);
  const firstWeekday = new Date(year, month, 1, 12).getDay();
  const firstOccurrence = 1 + ((weekday - firstWeekday + 7) % 7);
  const occurrence = firstOccurrence + ordinal * 7;
  return occurrence <= new Date(year, month + 1, 0, 12).getDate() ? occurrence : null;
}

export function getDateForDayInWeek(referenceDate: Date, day: DayKey): string {
  const mondayDistance = referenceDate.getDay() === 0 ? -6 : 1 - referenceDate.getDay();
  const monday = new Date(referenceDate);
  monday.setDate(referenceDate.getDate() + mondayDistance);
  const dayOffset: Record<DayKey, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4 };
  const target = new Date(monday);
  target.setDate(monday.getDate() + dayOffset[day]);
  return formatLocalDate(target);
}

/** Returns true when this lesson has an occurrence on the given local calendar date. */
export function isLessonScheduledOnDate(lesson: Lesson, date: Date): boolean {
  const dateDay = dayKeyForDate(date);
  if (!dateDay) return false;

  const recurrence = lesson.recurrence;
  if (!recurrence) return lesson.day === dateDay;

  const rawStartDate = parseLocalDate(recurrence.startDate);
  if (!rawStartDate) return false;

  const alignedStartISO =
    dayKeyForDate(rawStartDate) === lesson.day
      ? recurrence.startDate
      : getDateForDayInWeek(rawStartDate, lesson.day);
  const startDate = parseLocalDate(alignedStartISO);
  if (!startDate || formatLocalDate(date) < alignedStartISO) return false;

  if (recurrence.frequency === 'weekly') return lesson.day === dateDay;
  if (recurrence.frequency === 'biweekly') {
    const daysApart = calendarDayNumber(date) - calendarDayNumber(startDate);
    return daysApart >= 0 && daysApart % 14 === 0 && lesson.day === dateDay;
  }

  if (recurrence.frequency === 'monthly') {
    if (lesson.day !== dateDay || startDate.getDay() !== date.getDay()) return false;
    const occurrence = monthlyWeekdayDate(startDate, date.getFullYear(), date.getMonth());
    return occurrence !== null && date.getDate() === occurrence;
  }

  return false;
}

export function getWeekdayOrdinal(dateValue: string): number | null {
  const date = parseLocalDate(dateValue);
  if (!date || !dayKeyForDate(date)) return null;
  return Math.floor((date.getDate() - 1) / 7) + 1;
}
