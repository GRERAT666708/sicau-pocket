import type { Course } from './types';

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

/** 覆盖 1-16 周 */
const W = Array.from({ length: 16 }, (_, i) => i + 1);
const ODD = W.filter((w) => w % 2 === 1);
const EVEN = W.filter((w) => w % 2 === 0);

export const DEMO_COURSES: Course[] = [
  {
    id: uid('demo'),
    name: '动物解剖学',
    teacher: '李老师',
    room: '1-教 302',
    colorIndex: 0,
    slots: [
      { id: uid('s'), day: 1, start: 1, end: 2, weeks: W },
      { id: uid('s'), day: 3, start: 3, end: 4, weeks: W },
    ],
  },
  {
    id: uid('demo'),
    name: '动物生理学',
    teacher: '王老师',
    room: '1-教 205',
    colorIndex: 1,
    slots: [
      { id: uid('s'), day: 2, start: 3, end: 4, weeks: W },
      { id: uid('s'), day: 4, start: 1, end: 2, weeks: ODD },
    ],
  },
  {
    id: uid('demo'),
    name: '兽医微生物学',
    teacher: '张老师',
    room: '2-教 401',
    colorIndex: 2,
    slots: [
      { id: uid('s'), day: 3, start: 5, end: 6, weeks: W },
      { id: uid('s'), day: 5, start: 3, end: 4, weeks: EVEN },
    ],
  },
  {
    id: uid('demo'),
    name: '大学英语',
    teacher: '陈老师',
    room: '3-教 110',
    colorIndex: 3,
    slots: [{ id: uid('s'), day: 4, start: 5, end: 6, weeks: W }],
  },
  {
    id: uid('demo'),
    name: '高等数学',
    teacher: '刘老师',
    room: '1-教 101',
    colorIndex: 4,
    slots: [
      { id: uid('s'), day: 1, start: 5, end: 6, weeks: W },
      { id: uid('s'), day: 3, start: 1, end: 2, weeks: W },
    ],
  },
  {
    id: uid('demo'),
    name: '思想道德与法治',
    teacher: '赵老师',
    room: '4-教 201',
    colorIndex: 5,
    slots: [{ id: uid('s'), day: 5, start: 1, end: 2, weeks: W }],
  },
  {
    id: uid('demo'),
    name: '体育（羽毛球）',
    teacher: '周老师',
    room: '体育馆',
    colorIndex: 6,
    slots: [{ id: uid('s'), day: 2, start: 7, end: 8, weeks: W }],
  },
  {
    id: uid('demo'),
    name: '普通化学实验',
    teacher: '孙老师',
    room: '化学楼 B204',
    colorIndex: 1,
    slots: [{ id: uid('s'), day: 3, start: 9, end: 10, weeks: ODD }],
  },
];
