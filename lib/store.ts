import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { campusOfMajor } from './major';
import { DEMO_COURSES } from './demo';
import { isoDate, mondayOf } from './date';
import type { AppSettings, Course, FocusSession, User } from './types';

const STORAGE_KEY = '@sicau-pocket/state/v1';

export const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function mondayOnOrAfter(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const wd = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - wd);
  return x;
}

export function guessTerm(now = new Date()): { termStart: string; termName: string } {
  const y = now.getFullYear();
  const aug = new Date(y, 7, 25);
  const feb = new Date(y, 1, 20);
  let start: Date;
  if (now >= aug) start = mondayOnOrAfter(aug);
  else if (now >= feb) start = mondayOnOrAfter(feb);
  else start = mondayOnOrAfter(new Date(y - 1, 7, 25));
  const fall = start.getMonth() >= 6;
  const termName = fall
    ? `${start.getFullYear()}-${start.getFullYear() + 1} 学年第一学期`
    : `${start.getFullYear() - 1}-${start.getFullYear()} 学年第二学期`;
  return { termStart: isoDate(start), termName };
}

const guessed = guessTerm();

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  termStart: guessed.termStart,
  totalWeeks: 18,
  termName: guessed.termName,
  demoSeeded: false,
  campus: '雅安',
  campusSource: undefined,
};

export type State = {
  hydrated: boolean;
  settings: AppSettings;
  courses: Course[];
  sessions: FocusSession[];
  user: User | null;
};

let state: State = {
  hydrated: false,
  settings: DEFAULT_SETTINGS,
  courses: [],
  sessions: [],
  user: null,
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getState() {
  return state;
}

export function useAppState(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
  void persist();
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const { hydrated, ...rest } = state;
    void rest;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: state.settings,
        courses: state.courses,
        sessions: state.sessions,
        user: state.user,
      }),
    ).catch(() => {
      /* 存储失败不阻塞交互 */
    });
  }, 150);
}

export async function hydrate() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const courses = DEMO_COURSES;
      state = {
        hydrated: true,
        settings: { ...DEFAULT_SETTINGS, demoSeeded: true },
        courses,
        sessions: [],
        user: null,
      };
      emit();
      void persist();
      return;
    }
    const data = JSON.parse(raw) as Partial<State>;
    const settings: AppSettings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
    // 老数据里校区可能写死成雅安，专业能推断出来就校正一次（手动设置的不动）
    if (settings.campusSource !== 'manual' && settings.major) {
      const byMajor = campusOfMajor(settings.major);
      if (byMajor && byMajor !== settings.campus) settings.campus = byMajor;
    }
    state = {
      hydrated: true,
      settings,
      courses: data.courses ?? [],
      sessions: data.sessions ?? [],
      user: data.user ?? null,
    };
    emit();
  } catch {
    state = { ...state, hydrated: true };
    emit();
  }
}

/* ------------------------------ actions ------------------------------ */

export const actions = {
  updateSettings(patch: Partial<AppSettings>) {
    set({ settings: { ...state.settings, ...patch } });
  },
  addCourse(course: Course) {
    set({ courses: [...state.courses, course] });
  },
  updateCourse(course: Course) {
    set({ courses: state.courses.map((c) => (c.id === course.id ? course : c)) });
  },
  removeCourse(id: string) {
    set({ courses: state.courses.filter((c) => c.id !== id) });
  },
  clearCourses() {
    set({ courses: [], settings: { ...state.settings, demoSeeded: false } });
  },
  replaceCourses(courses: Course[]) {
    set({ courses, settings: { ...state.settings, demoSeeded: false } });
  },
  loadDemoCourses() {
    set({ courses: DEMO_COURSES, settings: { ...state.settings, demoSeeded: true } });
  },
  addSession(session: FocusSession) {
    set({ sessions: [...state.sessions, session] });
  },
  removeSession(id: string) {
    set({ sessions: state.sessions.filter((s) => s.id !== id) });
  },
  clearSessions() {
    set({ sessions: [] });
  },
  setUser(user: User | null) {
    set({ user });
  },
  async resetAll() {
    state = {
      hydrated: true,
      settings: { ...DEFAULT_SETTINGS },
      courses: [],
      sessions: [],
      user: null,
    };
    emit();
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
};

export function todayCourses(courses: Course[], dayIdx: number, week: number) {
  return courses
    .flatMap((c) => c.slots.filter((s) => s.day === dayIdx && s.weeks.includes(week)).map((s) => ({ course: c, slot: s })))
    .sort((a, b) => a.slot.start - b.slot.start);
}

export function currentWeek(settings: AppSettings, d = new Date()): number {
  const ms = mondayOf(new Date(settings.termStart)).getTime();
  return Math.floor((mondayOf(d).getTime() - ms) / (7 * 86400000)) + 1;
}
