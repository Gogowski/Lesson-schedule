import React, { useState, useEffect } from 'react';
import { Lesson, DayKey } from '../types';
import { DAYS_CONFIG } from '../data/days';
import { X, Trash2, Clock, ArrowRight, PlusCircle, RefreshCw } from 'lucide-react';

interface KnownSubjectMeta {
  subject: string;
  teacherName: string;
  isFlexible?: boolean;
}

interface EditLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (lesson: Lesson, replaceLessonId?: string) => void;
  onDelete?: (id: string) => void;
  initialLesson?: Lesson | null;
  defaultDay: DayKey;
  existingLessons: Lesson[];
  isDark?: boolean;
}

function toMins(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fromMins(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const EditLessonModal: React.FC<EditLessonModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialLesson,
  defaultDay,
  existingLessons,
  isDark,
}) => {
  const [day, setDay] = useState<DayKey>(defaultDay);
  const [startTime, setStartTime] = useState('09:30');
  const [duration, setDuration] = useState<number>(45);
  const [endTime, setEndTime] = useState('10:15');
  const [subject, setSubject] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [isFlexible, setIsFlexible] = useState(false);
  const [homework, setHomework] = useState('');
  const [statusNote, setStatusNote] = useState('');

  const [duplicateConflict, setDuplicateConflict] = useState<Lesson | null>(null);

  const knownSubjects: KnownSubjectMeta[] = React.useMemo(() => {
    const map = new Map<string, KnownSubjectMeta>();
    existingLessons.forEach(l => {
      const key = l.subject.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          subject: l.subject.trim(),
          teacherName: l.teacherName.trim(),
          isFlexible: l.isFlexible,
        });
      }
    });
    return Array.from(map.values());
  }, [existingLessons]);

  useEffect(() => {
    setDuplicateConflict(null);
    if (initialLesson) {
      setDay(initialLesson.day);
      setStartTime(initialLesson.startTime);
      setEndTime(initialLesson.endTime);
      const startM = toMins(initialLesson.startTime);
      const endM = toMins(initialLesson.endTime);
      const dur = endM > startM ? endM - startM : 45;
      setDuration(dur === 25 ? 25 : 45);
      setSubject(initialLesson.subject);
      setTeacherName(initialLesson.teacherName);
      setIsFlexible(Boolean(initialLesson.isFlexible));
      setHomework(initialLesson.homework || '');
      setStatusNote(initialLesson.statusNote || '');
    } else {
      setDay(defaultDay);
      setStartTime('09:30');
      setDuration(45);
      setEndTime(fromMins(toMins('09:30') + 45));
      setSubject('');
      setTeacherName('');
      setIsFlexible(false);
      setHomework('');
      setStatusNote('');
    }
  }, [initialLesson, defaultDay, isOpen]);

  if (!isOpen) return null;

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    setEndTime(fromMins(toMins(newStart) + duration));
  };

  const handleDurationChange = (newDur: number) => {
    setDuration(newDur);
    setEndTime(fromMins(toMins(startTime) + newDur));
  };

  const handleSelectKnownSubject = (meta: KnownSubjectMeta) => {
    setSubject(meta.subject);
    setTeacherName(meta.teacherName);
    if (meta.isFlexible !== undefined) setIsFlexible(meta.isFlexible);
  };

  const executeSave = (replaceId?: string) => {
    onSave(
      {
        id: initialLesson?.id || `l-${Date.now()}`,
        day,
        startTime,
        endTime,
        subject: subject.trim(),
        teacherName: teacherName.trim(),
        isFlexible,
        homework: homework.trim() || undefined,
        statusNote: statusNote.trim() || undefined,
      },
      replaceId
    );
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;

    if (!initialLesson) {
      const match = existingLessons.find(
        (l) => l.subject.trim().toLowerCase() === subject.trim().toLowerCase()
      );
      if (match) {
        setDuplicateConflict(match);
        return;
      }
    }

    executeSave();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className={`w-full sm:max-w-md rounded-t-[32px] sm:rounded-3xl p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto pb-safe transition-colors ${
          isDark ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-10 h-1 rounded-full mx-auto mb-3 sm:hidden ${isDark ? 'bg-neutral-700' : 'bg-neutral-300'}`} />

        {duplicateConflict ? (
          <div className="space-y-4 py-2 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold font-display leading-snug">
              Урок «{duplicateConflict.subject}» уже есть в расписании
            </h3>
            
            <p className={`text-xs leading-relaxed p-3 rounded-2xl ${isDark ? 'bg-neutral-800 text-neutral-200' : 'bg-neutral-50 text-neutral-600'}`}>
              Найден урок: <span className="font-semibold">{DAYS_CONFIG.find(d => d.key === duplicateConflict.day)?.label} в {duplicateConflict.startTime} — {duplicateConflict.endTime}</span>. Что сделать?
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => executeSave(duplicateConflict.id)}
                className={`w-full p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between active:scale-[0.98] transition-all ${
                  isDark ? 'bg-white text-neutral-900 hover:bg-neutral-200' : 'bg-neutral-900 text-white hover:bg-neutral-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <RefreshCw className={`w-4 h-4 ${isDark ? 'text-emerald-600' : 'text-emerald-400'}`} />
                  <div className="text-left">
                    <div className="font-bold">Перенести урок (заменить старый)</div>
                    <div className={`text-[11px] font-normal ${isDark ? 'text-neutral-600' : 'text-neutral-300'}`}>
                      Удалить старое время и поставить на {DAYS_CONFIG.find(d => d.key === day)?.short} {startTime}
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => executeSave(undefined)}
                className={`w-full p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between active:scale-[0.98] transition-all ${
                  isDark ? 'bg-neutral-800 text-white hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <PlusCircle className="w-4 h-4 text-neutral-400" />
                  <div className="text-left">
                    <div className="font-bold">Добавить вторым уроком</div>
                    <div className={`text-[11px] font-normal ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                      Оставить старый урок и добавить ещё один
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setDuplicateConflict(null)}
                className="w-full py-2.5 text-xs font-medium text-neutral-400 hover:text-neutral-200"
              >
                Вернуться к редактированию
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between pb-2 mb-2">
              <h2 className="text-base font-bold font-display tracking-tight">
                {initialLesson ? 'Редактировать урок' : 'Новый урок'}
              </h2>
              <div className="flex items-center gap-1">
                {initialLesson && onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Удалить урок?')) {
                        onDelete(initialLesson.id);
                        onClose();
                      }
                    }}
                    className={`p-2 rounded-full text-rose-500 ${isDark ? 'hover:bg-neutral-800' : 'hover:bg-rose-50'}`}
                    title="Удалить урок"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className={`p-2 rounded-full transition-colors ${
                    isDark ? 'text-neutral-400 hover:text-white hover:bg-neutral-800' : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Day selection */}
              <div className={`grid grid-cols-5 gap-1.5 p-1 rounded-2xl ${isDark ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
                {DAYS_CONFIG.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDay(d.key)}
                    className={`py-2 text-xs font-semibold rounded-xl transition-all ${
                      day === d.key
                        ? isDark
                          ? 'bg-white text-neutral-900 shadow-xs'
                          : 'bg-white text-neutral-900 shadow-xs'
                        : isDark
                        ? 'text-neutral-400 hover:text-white'
                        : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    {d.short}
                  </button>
                ))}
              </div>

              {/* Time Picker Block */}
              <div className={`p-3.5 rounded-2xl space-y-2.5 ${isDark ? 'bg-neutral-800' : 'bg-neutral-100/70'}`}>
                <div className={`flex items-center justify-between text-xs ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}>
                  <span className="font-semibold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 opacity-70" />
                    Время и длительность
                  </span>
                  
                  <div className={`flex items-center gap-1 p-0.5 rounded-lg ${isDark ? 'bg-neutral-700' : 'bg-white shadow-2xs'}`}>
                    <button
                      type="button"
                      onClick={() => handleDurationChange(45)}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                        duration === 45
                          ? isDark
                            ? 'bg-white text-neutral-900'
                            : 'bg-neutral-900 text-white'
                          : isDark
                          ? 'text-neutral-300 hover:text-white'
                          : 'text-neutral-500 hover:text-neutral-900'
                      }`}
                    >
                      45 мин
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDurationChange(25)}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                        duration === 25
                          ? isDark
                            ? 'bg-white text-neutral-900'
                            : 'bg-neutral-900 text-white'
                          : isDark
                          ? 'text-neutral-300 hover:text-white'
                          : 'text-neutral-500 hover:text-neutral-900'
                      }`}
                    >
                      25 мин
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className={`block text-[10px] uppercase font-bold mb-1 ${isDark ? 'text-neutral-400' : 'text-neutral-400'}`}>
                      Начало
                    </span>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => handleStartTimeChange(e.target.value)}
                      required
                      className={`w-full px-3 py-2 rounded-xl text-base font-time font-bold shadow-2xs focus:outline-none focus:ring-2 ${
                        isDark 
                          ? 'bg-neutral-700 text-white focus:ring-white' 
                          : 'bg-white text-neutral-900 focus:ring-neutral-900'
                      }`}
                    />
                  </div>

                  <div>
                    <span className={`block text-[10px] uppercase font-bold mb-1 ${isDark ? 'text-neutral-400' : 'text-neutral-400'}`}>
                      Конец ({duration}м)
                    </span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                      className={`w-full px-3 py-2 rounded-xl text-base font-time font-bold shadow-2xs focus:outline-none focus:ring-2 ${
                        isDark 
                          ? 'bg-neutral-700 text-white focus:ring-white' 
                          : 'bg-white text-neutral-900 focus:ring-neutral-900'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Known subjects quick-pick */}
              {knownSubjects.length > 0 && (
                <div>
                  <span className={`block text-[10px] uppercase font-bold mb-1.5 ${isDark ? 'text-neutral-400' : 'text-neutral-400'}`}>
                    Быстрый выбор из добавленных предметов:
                  </span>
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {knownSubjects.map((meta) => {
                      const isSelected = subject.trim().toLowerCase() === meta.subject.toLowerCase();
                      return (
                        <button
                          key={meta.subject}
                          type="button"
                          onClick={() => handleSelectKnownSubject(meta)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shadow-2xs ${
                            isSelected
                              ? isDark
                                ? 'bg-white text-neutral-900'
                                : 'bg-neutral-900 text-white'
                              : isDark
                              ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                              : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                          }`}
                        >
                          {meta.subject}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Subject & Teacher Inputs */}
              <div>
                <span className={`block text-xs font-semibold mb-1 ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                  Предмет
                </span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Например: Алгебра"
                  required
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-base focus:outline-none focus:ring-2 ${
                    isDark 
                      ? 'bg-neutral-800 text-white placeholder:text-neutral-500 focus:ring-white' 
                      : 'bg-neutral-100 text-neutral-900 focus:ring-neutral-900'
                  }`}
                />
              </div>

              <div>
                <span className={`block text-xs font-semibold mb-1 ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                  Учитель (необязательно)
                </span>
                <input
                  type="text"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  placeholder="Имя преподавателя"
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-base focus:outline-none focus:ring-2 ${
                    isDark 
                      ? 'bg-neutral-800 text-white placeholder:text-neutral-500 focus:ring-white' 
                      : 'bg-neutral-100 text-neutral-900 focus:ring-neutral-900'
                  }`}
                />
              </div>

              {/* Flexible toggle */}
              <label className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer select-none transition-colors ${
                isDark ? 'bg-neutral-800 hover:bg-neutral-800/90' : 'bg-neutral-100/70 hover:bg-neutral-100'
              }`}>
                <input
                  type="checkbox"
                  checked={isFlexible}
                  onChange={(e) => setIsFlexible(e.target.checked)}
                  className={`w-5 h-5 rounded-lg focus:ring-0 ${isDark ? 'text-white' : 'text-neutral-900'}`}
                />
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
                      Плавающий график
                    </span>
                    <span className={`text-xs font-semibold ${
                      isDark ? 'text-amber-400' : 'text-amber-600'
                    }`}>
                      Временно
                    </span>
                  </div>
                  <span className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                    Время часто меняется, показывать метку «Временно» рядом со временем
                  </span>
                </div>
              </label>

              {/* Status note */}
              <div>
                <span className={`block text-xs font-semibold mb-1 ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                  Пометка или перенос (необязательно)
                </span>
                <input
                  type="text"
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="Например: перенесено на 15:30"
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-base focus:outline-none focus:ring-2 ${
                    isDark 
                      ? 'bg-neutral-800 text-white placeholder:text-neutral-500 focus:ring-white' 
                      : 'bg-neutral-100 text-neutral-900 focus:ring-neutral-900'
                  }`}
                />
              </div>

              {/* Homework */}
              <div>
                <span className={`block text-xs font-semibold mb-1 ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                  Домашнее задание (необязательно)
                </span>
                <textarea
                  rows={2}
                  value={homework}
                  onChange={(e) => setHomework(e.target.value)}
                  placeholder="Номера задач, параграфы..."
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-base focus:outline-none focus:ring-2 resize-none ${
                    isDark 
                      ? 'bg-neutral-800 text-white placeholder:text-neutral-500 focus:ring-white' 
                      : 'bg-neutral-100 text-neutral-900 focus:ring-neutral-900'
                  }`}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className={`flex-1 py-3 text-sm font-semibold rounded-2xl active:scale-[0.98] transition-all ${
                    isDark ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-3 text-sm font-semibold rounded-2xl active:scale-[0.98] transition-all shadow-xs ${
                    isDark ? 'bg-white text-neutral-900 hover:bg-neutral-200' : 'bg-neutral-900 text-white hover:bg-neutral-800'
                  }`}
                >
                  Сохранить
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
