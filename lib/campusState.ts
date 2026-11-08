import { campusOfMajor } from './major';
import type { AppSettings, Campus } from './types';

/**
 * 校区到底该显示哪个？
 *
 * 优先级：
 *   1. 手动设置（campusSource === 'manual'）—— 用户自己选的说了算
 *   2. 专业 —— 动物医学在成都、水利水电在雅安，按专业推断
 *   3. 课表里识别到的校区（campusSource === 'timetable'）
 *   4. settings.campus（默认雅安）
 *
 * 之所以不直接读 settings.campus：早期版本把校区写死成雅安、也出现过设置被重置的情况，
 * 这里统一兜底一遍，省得每个页面各自判断。
 */
export function effectiveCampus(settings: AppSettings): Campus {
  if (settings.campusSource === 'manual') return settings.campus;
  if (settings.major) {
    const byMajor = campusOfMajor(settings.major);
    if (byMajor) return byMajor;
  }
  return settings.campus;
}

export function campusSourceText(settings: AppSettings): string {
  if (settings.campusSource === 'manual') return '手动设置';
  if (settings.major && campusOfMajor(settings.major)) return '按专业推断';
  if (settings.campusSource === 'timetable') return '按课表识别';
  return '默认';
}
