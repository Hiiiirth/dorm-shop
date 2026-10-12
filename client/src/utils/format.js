/**
 * 展示层格式化工具
 *
 * 规则：**只做字符串，不改数值**。金额的「分 → 元」在 utils/money.js，
 * 这里只负责「怎么写得好看」，例如销量、库存、距离文案。
 */

/** 销量：1 万以上折成「1.2万」，避免长数字把卡片撑开 */
export function formatSales(count) {
  const n = Number(count) || 0;
  if (n < 10000) return `已售 ${n}`;
  const w = n / 10000;
  return `已售 ${w >= 10 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, '')}万`;
}

/**
 * 库存文案 + 紧迫程度
 *
 * 分三档是有意的：宿舍小超市客单价低、库存少，
 * 「仅剩 3 件」比干巴巴的「库存 3」更能推动下单。
 * 返回 { text, level }，level 给页面决定要不要染色。
 */
export function formatStock(stock) {
  const n = Number(stock) || 0;
  if (n <= 0) return { text: '已售罄', level: 'out' };
  if (n <= 5) return { text: `仅剩 ${n} 件`, level: 'low' };
  if (n <= 20) return { text: `库存 ${n} 件`, level: 'mid' };
  return { text: '现货充足', level: 'ok' };
}

/** 商品副标题为空时不要留一行空白 */
export function formatSubtitle(subtitle) {
  return (subtitle || '').trim();
}

/**
 * 商品图占位用的「字标」
 *
 * 种子数据里 cover_image 全是空串（宿舍小超市的图都是学生自己拍的，MVP 没有图库），
 * 所以必须有占位方案。取名字里第一个**非空白、非数字**的字符做字标 ——
 * 用第一个字而不是首字母，是因为商品名基本都是中文，
 * 「可口可乐」→「可」比「K」更容易在网格里被认出来。
 */
export function monogramOf(name) {
  const s = (name || '').trim();
  if (!s) return '货';
  for (const ch of s) {
    if (!/[\s\d]/.test(ch)) return ch;
  }
  return s[0];
}

/**
 * 字标底色 —— 从名字算一个稳定的色号
 *
 * 用字符码求和取模，保证**同一个商品每次刷新颜色都一样**（不能用随机）。
 * 只在这几个中性暖色里挑，不碰语义色（成功/警示/危险是留给状态的）。
 */
const MONOGRAM_TINTS = [
  ['#FDF1EA', '#B4552A'],
  ['#F1F4F9', '#4A5A73'],
  ['#EEF6F0', '#2F6B45'],
  ['#F7F2EC', '#7A5A38'],
  ['#F0F1F7', '#505A82'],
  ['#FBF3E8', '#8A6420'],
];

export function monogramTint(name) {
  const s = name || '';
  let sum = 0;
  for (let i = 0; i < s.length; i += 1) sum += s.charCodeAt(i);
  return MONOGRAM_TINTS[sum % MONOGRAM_TINTS.length];
}

/** 分类页左侧导航、面包屑用的短标题：太长会换行，超过 5 个字就截断 */
export function truncate(text, max = 5) {
  const s = (text || '').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * 时间戳（毫秒整数）→ 展示字符串
 *
 * ⚠️ 后端统一传**毫秒时间戳**（响应拦截器的 serializeDates 兜底），
 * 所以这里收的一定是 number。但线上难免遇到字符串，做个兼容：
 * 数字字符串也当时间戳，ISO 字符串交给 Date 自己解析。
 *
 * 不用 toLocaleString —— 小程序端各平台的 locale 支持参差，
 * 自己 pad 最稳，且跨端输出完全一致（验收脚本要靠它做断言）。
 */
function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return new Date(value);
  const s = String(value);
  if (/^\d+$/.test(s)) return new Date(Number(s));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD HH:mm' */
export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/** 'MM-DD HH:mm'（列表里省地方） */
export function formatShortTime(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'HH:mm'（轨迹时间线用，同一天的信息靠日期分组就够了） */
export function formatClock(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 相对时间：刚刚 / N 分钟前 / 今天 HH:mm / 昨天 HH:mm / MM-DD HH:mm
 *
 * 订单列表里「多久前下的单」比绝对时间更有用。
 * 超过昨天就退回绝对时间 —— 「3 天前」不如「10-05 14:20」精确。
 */
export function formatRelative(value) {
  const d = toDate(value);
  if (!d) return '';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 0) return formatShortTime(d); // 时钟漂移的兜底，别显示「-1 分钟前」

  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;

  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `今天 ${formatClock(d)}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return `昨天 ${formatClock(d)}`;

  return formatShortTime(d);
}
