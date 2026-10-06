import { DayKey } from '../types';

export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

export function getCurrentDayKey(): DayKey {
  const day = new Date().getDay();
  // 1 = Monday, 2 = Tuesday, ..., 5 = Friday
  const map: Record<number, DayKey> = {
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri',
  };
  return map[day] || 'mon';
}

export function getActualDayKey(): DayKey | null {
  const day = new Date().getDay();
  const map: Record<number, DayKey> = {
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri',
  };
  return map[day] || null;
}

export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateValue: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
  if (formatLocalDate(date) !== dateValue) return null;
  return date;
}

// Get dates for Mon - Fri of current week
export interface DayDateInfo {
  key: DayKey;
  label: string;
  short: string;
  dayNumber: number;
  monthName: string;
  isToday: boolean;
  dateStr: string;
  dateISO: string;
}

const MONTH_NAMES_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

export const MONTH_NAMES_HEADER_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

export function getWeekDaysInfo(referenceDate = new Date()): { days: DayDateInfo[]; currentMonthHeader: string } {
  const current = new Date(referenceDate);
  const dayOfWeek = current.getDay(); // 0 is Sunday, 1 is Monday
  
  // Calculate distance to Monday
  const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(current);
  monday.setDate(current.getDate() + distanceToMonday);

  const days: DayDateInfo[] = [];
  const configs: { key: DayKey; label: string; short: string }[] = [
    { key: 'mon', label: 'Понедельник', short: 'ПН' },
    { key: 'tue', label: 'Вторник', short: 'ВТ' },
    { key: 'wed', label: 'Среда', short: 'СР' },
    { key: 'thu', label: 'Четверг', short: 'ЧТ' },
    { key: 'fri', label: 'Пятница', short: 'ПТ' },
  ];

  const today = new Date();
  const isSameCalendarDay = (d1: Date, d2: Date) => 
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);

    days.push({
      key: configs[i].key,
      label: configs[i].label,
      short: configs[i].short,
      dayNumber: d.getDate(),
      monthName: MONTH_NAMES_RU[d.getMonth()],
      isToday: isSameCalendarDay(d, today),
      dateStr: `${d.getDate()} ${MONTH_NAMES_RU[d.getMonth()]}`,
      dateISO: formatLocalDate(d),
    });
  }

  const currentMonthHeader = `${MONTH_NAMES_HEADER_RU[monday.getMonth()]} ${monday.getFullYear()}`;

  return { days, currentMonthHeader };
}
