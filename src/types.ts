export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

export type ScheduleType = 'fixed' | 'flexible';

export type LessonStatus = 'scheduled' | 'rescheduled' | 'cancelled';

export interface Lesson {
  id: string;
  day: DayKey;
  startTime: string; // '09:30'
  endTime: string;   // '10:15'
  subject: string;
  teacherName: string;
  isFlexible?: boolean; // плавающее расписание у учителя
  status?: LessonStatus; // 'scheduled' | 'rescheduled' | 'cancelled'
  statusNote?: string;  // например: перенесено на 15:30
  meetingUrl?: string;  // ссылка на урок
  homework?: string;    // ДЗ
}

export interface ScheduleData {
  version: number;
  updatedAt: string;
  adminPin: string;
  lessons: Lesson[];
}
