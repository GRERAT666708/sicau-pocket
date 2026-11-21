import type { Campus } from './types';

/** 各校区的教学楼（空教室页按这个顺序列楼） */
export const CAMPUS_BUILDINGS: Record<Campus, string[]> = {
  成都: ['4教A区', '4教B区', '4教C区', '5教', '6教', '科技园B区'],
  雅安: ['第一教学楼', '第二教学楼', '逸夫楼', '工学楼'],
  都江堰: ['一教', '二教', '实训楼'],
};
