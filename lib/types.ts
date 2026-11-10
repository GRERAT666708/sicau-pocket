export type CourseSlot = {
  id: string;
  /** 1 = 周一 … 7 = 周日 */
  day: number;
  /** 节次，1-12 */
  start: number;
  end: number;
  /** 上课周次，如 [1,2,…,16] */
  weeks: number[];
  room?: string;
};

export type Course = {
  id: string;
  name: string;
  teacher?: string;
  room?: string;
  colorIndex: number;
  slots: CourseSlot[];
  note?: string;
};

/** 归档的学期：切走/新建学期时，把当时的课表和作息一起存下来 */
export type SemesterArchive = {
  id: string;
  termName: string;
  termStart: string;
  totalWeeks: number;
  courses: Course[];
  archivedAt: number;
};

export type FocusSession = {
  id: string;
  tag: string;
  /** 毫秒时间戳 */
  startedAt: number;
  endedAt: number;
  plannedMinutes: number;
  minutes: number;
  completed: boolean;
};

export type AppSettings = {
  theme: 'system' | 'light' | 'dark';
  termStart: string; // YYYY-MM-DD，第 1 教学周的周一
  totalWeeks: number;
  termName: string;
  demoSeeded: boolean;
  /** 所在校区（空闲教室、课表默认按这个走） */
  campus: Campus;
  /** 专业，用来推断校区 */
  major?: string;
  /** 校区是怎么定下来的 */
  campusSource?: 'major' | 'timetable' | 'manual';
  /** 学生姓名（从教务页面里认出来的，或手动填） */
  userName?: string;
};

export type Campus = '雅安' | '成都' | '都江堰';

export type User = {
  studentId: string;
  name: string;
  campus: Campus;
  /** 专业（可空）。填了就能按专业自动推断校区 */
  major?: string;
  /** 校区是怎么定的：自动推断 / 手动改过 */
  campusSource?: 'major' | 'timetable' | 'manual';
};

export type CampusKind = 'electricity' | 'ecard' | 'classroom';

export type ElectricitySnapshot = {
  dorm: string;
  balance: number;
  dailyUsage: { date: string; kwh: number }[];
  updatedAt: number;
};

export type EcardSnapshot = {
  balance: number;
  todaySpent: number;
  monthSpent: number;
  transactions: { id: string; time: number; place: string; amount: number }[];
  updatedAt: number;
};

export type ClassroomRow = {
  room: string;
  building: string;
  capacity: number;
  /** 被占用的节次 */
  busy: number[];
};


