import type { Campus } from './types';

/**
 * 专业 → 校区。
 *
 * 数据来源：四川农业大学官网「本科生专业设置」（www.sicau.edu.cn/jyjx/bksjy/zysz.htm）
 * 的专业—开办学院对照表，以及官网「教学科研单位」里各学院所属校区的划分：
 *   雅安校区：理学院、生命科学学院、机电学院、食品学院、信息工程学院、水利水电学院、
 *             人文学院、公共管理学院、法学院、体育学院、艺术与传媒学院
 *   成都校区：农学院、动物科技学院、动物医学院、草业科技学院、水产学院、林学院、园艺学院、
 *             风景园林学院、资源学院、环境学院、经济学院、管理学院、农业工程学院、马克思主义学院等
 *   都江堰校区：建筑与城乡规划学院、土木工程学院、商旅学院
 *
 * 注意：水利水电学院在雅安（不是都江堰），土木/建筑/商旅在都江堰；农业工程专业在机电学院（雅安）。
 * 下面 RULES 的 majors/colleges 都是从上面两张官网表格生成的（96 个本科专业，逐个核对过），
 * 校区别名表 ALIASES 只用于「班级缩写 → 专业全名」，不参与校区判定。
 */

export const CAMPUSES: Campus[] = ['雅安', '成都', '都江堰'];

type MajorRule = { campus: Campus; majors: string[]; colleges: string[] };

const RULES: MajorRule[] = [
  {
    campus: '成都',
    majors: [
      '中草药栽培与鉴定', '人文地理与城乡规划', '农业资源与环境', '农学', '农林经济管理', '动植物检疫', '动物医学', '动物科学', '园林', '园艺',
      '国际经济与贸易', '土地科学与技术', '地理信息科学', '投资学', '智慧农业', '木材科学与工程', '林学', '森林保护', '植物保护',
      '植物科学与技术', '水产养殖学', '水土保持与荒漠化防治', '烟草', '环境工程', '环境生态工程', '环境科学', '环境设计', '生态学',
      '种子科学与工程', '经济学', '自然地理与资源环境', '茶学', '草业科学', '草坪科学与工程', '药学', '药物制剂', '设施农业科学与工程',
      '财务管理', '金融学', '风景园林',
    ],
    colleges: [
      '农学院', '动物医学院', '动物科技学院', '园艺学院', '林学院', '环境学院', '管理学院', '经济学院', '草业科技学院', '资源学院',
      '风景园林学院',
    ],
  },
  {
    campus: '雅安',
    majors: [
      '产品设计', '人力资源管理', '休闲体育', '体育教育', '信息与计算科学', '信息管理与信息系统', '农业工程', '农业机械化及其自动化', '农业水利工程',
      '农村区域发展', '包装工程', '化学生物学', '土地资源管理', '广告学', '应用化学', '应用物理学', '政治学与行政学', '数字媒体艺术',
      '数据科学与大数据技术', '文化产业管理', '水利水电工程', '汉语言文学', '法学', '物联网工程', '生物工程', '生物技术', '生物科学',
      '电子科学与技术', '电气工程及其自动化', '社会体育指导与管理', '社会工作', '翻译', '能源与动力工程', '英语', '行政管理', '视觉传达设计',
      '计算机科学与技术', '食品科学与工程', '食品营养与健康', '食品质量与安全',
    ],
    colleges: [
      '人文学院', '体育学院', '信息工程学院', '公共管理学院', '机电学院', '水利水电学院', '法学院', '理学院', '生命科学学院', '艺术与传媒学院',
      '食品学院',
    ],
  },
  {
    campus: '都江堰',
    majors: [
      '会展经济与管理', '会计学', '土木工程', '城乡规划', '审计学', '工商管理', '工程管理', '工程造价', '市场营销', '建筑学', '旅游管理',
      '电子商务', '给排水科学与工程', '资产评估', '道路桥梁与渡河工程', '酒店管理',
    ],
    colleges: [
      '商旅学院', '土木工程学院', '建筑与城乡规划学院',
    ],
  },
];

/** 常见简称/错写，认不出全名时兜底 */
const ALIASES: { campus: Campus; words: string[] }[] = [
  { campus: '成都', words: ['动医', '动科', '兽医', '水产', '草业', '风景园林', '茶学', '园艺', '林学', '农学', '经管', '金融'] },
  { campus: '都江堰', words: ['土木', '建筑', '造价', '工管', '旅游', '商旅', '会计', '市营'] },
  { campus: '雅安', words: ['计算机', '软工', '水利', '水电', '食品', '生科', '生物', '机电', '电气', '法学', '社工', '体育', '广告', '艺术'] },
];

/** 按专业名（或学院名）推断校区；认不出返回 null */
export function campusOfMajor(input: string | undefined | null): Campus | null {
  if (!input) return null;
  const text = input.trim().replace(/\s+/g, '');
  if (!text) return null;

  // 1) 全名精确 / 包含匹配（长者优先，避免「园林」吃掉「风景园林」）
  const exact: { campus: Campus; name: string }[] = [];
  for (const rule of RULES) {
    for (const name of rule.majors) exact.push({ campus: rule.campus, name });
    for (const name of rule.colleges) exact.push({ campus: rule.campus, name });
  }
  exact.sort((a, b) => b.name.length - a.name.length);
  for (const item of exact) {
    if (text === item.name) return item.campus;
  }
  for (const item of exact) {
    if (text.includes(item.name)) return item.campus;
  }

  // 2) 简称兜底
  for (const alias of ALIASES) {
    for (const word of alias.words) {
      if (text.includes(word)) return alias.campus;
    }
  }
  return null;
}

/** 设置页用的候选专业（每校区挑几个常见的） */
export const MAJOR_SUGGESTIONS = ['动物医学', '动物科学', '农学', '林学', '风景园林', '食品科学与工程', '计算机科学与技术', '水利水电工程', '法学', '土木工程', '商旅学院·会计学'];

/** 校区对应的学院，用来在设置页解释「为什么是这个校区」 */
export function collegesOf(campus: Campus): string[] {
  return RULES.find((r) => r.campus === campus)?.colleges ?? [];
}

/** 简称 → 全名（课表页抬头常见「动医202508」这种班级写法） */
const SHORT_TO_FULL: Record<string, string> = {
  动医: '动物医学',
  动科: '动物科学',
  兽医: '动物医学',
  水产: '水产养殖学',
  草业: '草业科学',
  园林: '园林',
  风园: '风景园林',
  茶学: '茶学',
  园艺: '园艺',
  林学: '林学',
  农学: '农学',
  植保: '植物保护',
  种子: '种子科学与工程',
  计算机: '计算机科学与技术',
  软工: '软件工程',
  信管: '信息管理与信息系统',
  物联网: '物联网工程',
  水利: '水利水电工程',
  水电: '水利水电工程',
  能动: '能源与动力工程',
  电气: '电气工程及其自动化',
  农机: '农业机械化及其自动化',
  食品: '食品科学与工程',
  食安: '食品质量与安全',
  生科: '生物科学',
  生技: '生物技术',
  法学: '法学',
  社工: '社会工作',
  体育: '体育教育',
  广告: '广告学',
  视传: '视觉传达设计',
  环设: '环境设计',
  土木: '土木工程',
  建筑: '建筑学',
  城规: '城乡规划',
  工管: '工程管理',
  造价: '工程造价',
  给排水: '给排水科学与工程',
  会计: '会计学',
  市营: '市场营销',
  旅管: '旅游管理',
  电商: '电子商务',
};

/** 把「动医」「动医202508」这类写法尽量还原成专业全名；认不出就原样返回 */
export function resolveMajorName(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  let text = input.trim().replace(/\s+/g, '');
  if (!text) return undefined;
  // 去掉年级班号：动医202508 → 动医
  text = text.replace(/[（(]?\d{4}\d{0,2}[）)]?$/g, '');
  if (!text) return undefined;

  const allMajors: string[] = [];
  for (const rule of RULES) allMajors.push(...rule.majors, ...rule.colleges);
  // 已经是全名
  const exact = allMajors.find((m) => m === text);
  if (exact) return exact;
  const contained = allMajors.find((m) => text.includes(m));
  if (contained) return contained;

  // 简称
  if (SHORT_TO_FULL[text]) return SHORT_TO_FULL[text];
  for (const [short, full] of Object.entries(SHORT_TO_FULL)) {
    if (text.startsWith(short) || text.includes(short)) return full;
  }
  return undefined;
}
