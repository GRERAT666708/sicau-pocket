import { resolveMajorName } from './major';

/**
 * 从教务页面 HTML 里认出学生姓名。
 *
 * 老教务（正方系）/ 新教务管理系统 / 成绩页 的写法都不一样，这里按「最可靠 → 最宽松」排：
 * 1. 表单里明确的「姓名」字段；
 * 2. 「欢迎您，张三」「张三同学」这类固定文案；
 * 3. 右上角常驻的用户名区域（class 里带 user/name 的小标签）。
 * 认不出来就返回 undefined，不要瞎猜。
 */
const STOP = new Set([
  '教务系统', '教务处', '学生', '教师', '同学', '姓名', '课程', '学期', '成绩', '班级',
  '专业', '学院', '大学', '四川农业', '农大', '学生课表', '课程表', '首页', '登录',
]);

function clean(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const name = raw.replace(/[\s\u00a0]/g, '').trim();
  if (name.length < 2 || name.length > 4) return undefined;
  if (STOP.has(name)) return undefined;
  if (!/^[\u4e00-\u9fa5]{2,4}$/.test(name)) return undefined;
  return name;
}

export function detectPersonName(html: string): string | undefined {
  if (!html) return undefined;
  const patterns = [
    // 姓名：张三  /  姓名</td><td>张三
    /姓名[\s:：]*<[^>]*>\s*([\u4e00-\u9fa5]{2,4})/,
    /姓名[\s:：]*([\u4e00-\u9fa5]{2,4})/,
    // 欢迎您，张三
    /欢迎(?:您)?[，,、:：\s]*([\u4e00-\u9fa5]{2,4})/,
    // 张三，同学 / 张三同学
    /([\u4e00-\u9fa5]{2,4})[，,、]?\s*同学/,
    // class="user-name">张三
    /class="[^"]*(?:user|name|yhmc|xsxm)[^"]*"[^>]*>\s*([\u4e00-\u9fa5]{2,4})\s*</i,
    // id="yhmc">张三
    /id="[^"]*(?:user|name|yhmc|xsxm)[^"]*"[^>]*>\s*([\u4e00-\u9fa5]{2,4})\s*</i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const name = clean(m?.[1]);
    if (name) return name;
  }
  return undefined;
}

/**
 * 从教务页面里认专业。
 *
 * 优先级：明确的「专业：xxx」字段 → 「学院：xxx学院」→ 课表抬头里的班级编号（动医202508）。
 * 认出来会再用 resolveMajorName 归一成全名（动医 → 动物医学），拿不到就返回 undefined。
 */
export function detectMajor(html: string): string | undefined {
  if (!html) return undefined;
  const raw: string[] = [];
  const patterns = [
    /专\s*业(?:名称)?[\s:：]*<[^>]*>\s*([\u4e00-\u9fa5（）()A-Za-z]{2,20})/,
    /专\s*业(?:名称)?[\s:：]*([\u4e00-\u9fa5（）()A-Za-z]{2,20})/,
    /学\s*院[\s:：]*<[^>]*>\s*([\u4e00-\u9fa5]{2,15}学院)/,
    /学\s*院[\s:：]*([\u4e00-\u9fa5]{2,15}学院)/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) raw.push(m[1]);
  }
  // 班级抬头：动医202508 / 农学202503 之类
  const klass = html.match(/([\u4e00-\u9fa5]{2,6})(20[1-3]\d)(\d{1,2})\s*(?:班)?/);
  if (klass?.[1]) raw.push(`${klass[1]}${klass[2]}`);

  for (const item of raw) {
    const name = resolveMajorName(item);
    if (name) return name;
  }
  return undefined;
}
