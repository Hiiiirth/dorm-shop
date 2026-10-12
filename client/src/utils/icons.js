/**
 * 图标注册表 —— Lucide 图标数据
 *
 * ── 为什么是「数据」而不是组件 ────────────────────────────────────────────
 * Lucide 的每个图标都是一段 **IconNode 数据**：
 *     [ ['path', { d: '...' }], ['circle', { cx, cy, r }] ]
 * 而不是一个组件。这样一份数据可以被三种渲染方式复用：
 *   · H5 / App  → 拼成 inline <svg>
 *   · 微信小程序 → 拼成 data:image/svg+xml 交给 <image>
 *   · morphicons → 直接吃同一份数据做形变动画
 * 这也是 morphicons 官方的取向（它只接受 IconNode 或裸 `d` 字符串）。
 *
 * ── 为什么不 import { Home } from 'lucide' ──────────────────────────────
 * lucide 的 package.json **没有 exports 字段**，所以可以深链到单图标文件：
 *     lucide/dist/esm/icons/house.mjs
 * 每个文件只有几百字节，比从 130KB 的主 bundle 里按名字取还要省，
 * 而且不依赖 tree-shaking 的运气。缺点是要自己维护「语义名 → 文件名」这层映射，
 * 也就是下面这张表存在的意义。
 *
 * ── 命名注意 ────────────────────────────────────────────────────────────
 * 用的是**文件名**，不是 PascalCase 导出名。两者有出入的例子：
 *   Home   → house.mjs      （v1 起改名了，Home 只是别名）
 *   Trash2 → trash.mjs
 * 加图标时先用 `ls node_modules/lucide/dist/esm/icons/` 确认文件名。
 *
 * 统一 24×24 网格、stroke 描边、无填充 —— 这是 Lucide 的规范，
 * 所以同一行里混不同来源的图标也不会一个粗一个细。
 */

import House from 'lucide/dist/esm/icons/house.mjs';
import LayoutGrid from 'lucide/dist/esm/icons/layout-grid.mjs';
import ShoppingCart from 'lucide/dist/esm/icons/shopping-cart.mjs';
import UserRound from 'lucide/dist/esm/icons/user-round.mjs';
import CircleCheckBig from 'lucide/dist/esm/icons/circle-check-big.mjs';
import ChartColumn from 'lucide/dist/esm/icons/chart-column.mjs';
import ClipboardList from 'lucide/dist/esm/icons/clipboard-list.mjs';
import SlidersHorizontal from 'lucide/dist/esm/icons/sliders-horizontal.mjs';

import Search from 'lucide/dist/esm/icons/search.mjs';
import ChevronLeft from 'lucide/dist/esm/icons/chevron-left.mjs';
import ChevronRight from 'lucide/dist/esm/icons/chevron-right.mjs';
import ArrowRight from 'lucide/dist/esm/icons/arrow-right.mjs';
import ArrowUpDown from 'lucide/dist/esm/icons/arrow-up-down.mjs';
import X from 'lucide/dist/esm/icons/x.mjs';
import Plus from 'lucide/dist/esm/icons/plus.mjs';
import Minus from 'lucide/dist/esm/icons/minus.mjs';
import Trash from 'lucide/dist/esm/icons/trash.mjs';
import Check from 'lucide/dist/esm/icons/check.mjs';
import RefreshCw from 'lucide/dist/esm/icons/refresh-cw.mjs';
import ListFilter from 'lucide/dist/esm/icons/list-filter.mjs';

import PackageOpen from 'lucide/dist/esm/icons/package-open.mjs';
import PackageSearch from 'lucide/dist/esm/icons/package-search.mjs';
import Inbox from 'lucide/dist/esm/icons/inbox.mjs';
import WifiOff from 'lucide/dist/esm/icons/wifi-off.mjs';
import CircleAlert from 'lucide/dist/esm/icons/circle-alert.mjs';
import TriangleAlert from 'lucide/dist/esm/icons/triangle-alert.mjs';
import LoaderCircle from 'lucide/dist/esm/icons/loader-circle.mjs';
import ImageOff from 'lucide/dist/esm/icons/image-off.mjs';
import ImagePlus from 'lucide/dist/esm/icons/image-plus.mjs';
// 排序方向：这两个图形的「柱状条」方向相反，是 morphicons 形变最出效果的一对
import ArrowUpNarrowWide from 'lucide/dist/esm/icons/arrow-up-narrow-wide.mjs';
import ArrowDownWideNarrow from 'lucide/dist/esm/icons/arrow-down-wide-narrow.mjs';

import Store from 'lucide/dist/esm/icons/store.mjs';
import ShoppingBag from 'lucide/dist/esm/icons/shopping-bag.mjs';
import Truck from 'lucide/dist/esm/icons/truck.mjs';
import Star from 'lucide/dist/esm/icons/star.mjs';
import Flame from 'lucide/dist/esm/icons/flame.mjs';
import Sparkles from 'lucide/dist/esm/icons/sparkles.mjs';
import Clock from 'lucide/dist/esm/icons/clock.mjs';
import Phone from 'lucide/dist/esm/icons/phone.mjs';
import MapPin from 'lucide/dist/esm/icons/map-pin.mjs';
import MessageSquareText from 'lucide/dist/esm/icons/message-square-text.mjs';
import Banknote from 'lucide/dist/esm/icons/banknote.mjs';
import Ticket from 'lucide/dist/esm/icons/ticket.mjs';

// 订单 / 我的 / 地址（S7-3）
import ReceiptText from 'lucide/dist/esm/icons/receipt-text.mjs';
import ClockArrowDown from 'lucide/dist/esm/icons/clock-arrow-down.mjs';
import Copy from 'lucide/dist/esm/icons/copy.mjs';
import ClipboardCheck from 'lucide/dist/esm/icons/clipboard-check.mjs';
import UserPen from 'lucide/dist/esm/icons/user-pen.mjs';
import SquarePen from 'lucide/dist/esm/icons/square-pen.mjs';
import LogOut from 'lucide/dist/esm/icons/log-out.mjs';
import ArrowRightLeft from 'lucide/dist/esm/icons/arrow-right-left.mjs';
import MapPinHouse from 'lucide/dist/esm/icons/map-pin-house.mjs';
import IdCard from 'lucide/dist/esm/icons/id-card.mjs';
import UserCheck from 'lucide/dist/esm/icons/user-check.mjs';
import MapPinned from 'lucide/dist/esm/icons/map-pinned.mjs';

// 管理端（S7-4）—— 只 import 原来没有的几个；
// SlidersHorizontal（筛选/管理 tab）和 PackageSearch（搜不到）上面已 import 过
import Ellipsis from 'lucide/dist/esm/icons/ellipsis.mjs';
import TrendingUp from 'lucide/dist/esm/icons/trending-up.mjs';
import UsersRound from 'lucide/dist/esm/icons/users-round.mjs';
import ListTree from 'lucide/dist/esm/icons/list-tree.mjs';
import ShieldCheck from 'lucide/dist/esm/icons/shield-check.mjs';
import Power from 'lucide/dist/esm/icons/power.mjs';
import HousePlus from 'lucide/dist/esm/icons/house-plus.mjs';
import StarOff from 'lucide/dist/esm/icons/star-off.mjs';

// 分类图标（种子数据里 category.icon 是空的，靠关键词兜底，见 iconForCategory）
import CupSoda from 'lucide/dist/esm/icons/cup-soda.mjs';
import Cookie from 'lucide/dist/esm/icons/cookie.mjs';
import Soup from 'lucide/dist/esm/icons/soup.mjs';
import SprayCan from 'lucide/dist/esm/icons/spray-can.mjs';
import Pencil from 'lucide/dist/esm/icons/pencil.mjs';
import Box from 'lucide/dist/esm/icons/box.mjs';
import Apple from 'lucide/dist/esm/icons/apple.mjs';
import Cake from 'lucide/dist/esm/icons/cake.mjs';
import Utensils from 'lucide/dist/esm/icons/utensils.mjs';
import Droplet from 'lucide/dist/esm/icons/droplet.mjs';
import Shirt from 'lucide/dist/esm/icons/shirt.mjs';
import Book from 'lucide/dist/esm/icons/book.mjs';

/**
 * 语义名 → IconNode
 *
 * 用**语义名**（`empty` / `error` / `offline`）而不是图形名（`package-open`），
 * 是为了以后换图标时只改这一行，不用满项目搜。
 */
export const ICONS = {
  // ---- 底部 tab / 工作台 ----
  home: House,
  category: LayoutGrid,
  cart: ShoppingCart,
  mine: UserRound,
  finished: CircleCheckBig,
  dashboard: ChartColumn,
  orders: ClipboardList,
  manage: SlidersHorizontal,

  // ---- 通用操作 ----
  search: Search,
  back: ChevronLeft,
  forward: ChevronRight,
  arrowRight: ArrowRight,
  sort: ArrowUpDown,
  'sort-asc': ArrowUpNarrowWide,
  'sort-desc': ArrowDownWideNarrow,
  close: X,
  plus: Plus,
  minus: Minus,
  delete: Trash,
  check: Check,
  refresh: RefreshCw,
  filter: ListFilter,

  // ---- 状态 / 空态 ----
  empty: PackageOpen,
  'search-empty': PackageSearch,
  inbox: Inbox,
  offline: WifiOff,
  error: CircleAlert,
  alert: TriangleAlert,
  loading: LoaderCircle,
  'image-error': ImageOff,
  /** 图片上传空态 / 更换（S10 商品封面与头像） */
  'image-plus': ImagePlus,

  // ---- 业务 ----
  store: Store,
  bag: ShoppingBag,
  truck: Truck,
  star: Star,
  hot: Flame,
  new: Sparkles,
  clock: Clock,
  phone: Phone,
  location: MapPin,
  remark: MessageSquareText,
  money: Banknote,
  ticket: Ticket,

  // ---- 订单 / 我的 / 地址（S7-3）----
  // 订单入口与轨迹：receipt 是「一张收据」，比 clipboard 更贴「我的订单」
  receipt: ReceiptText,

  // ---- 管理端（S7-4）----
  /** 「···」更多：订单卡片右下角，危险操作（取消）收在这里 */
  more: Ellipsis,
  /** 热销榜 / 营收趋势 */
  trend: TrendingUp,
  /** 商品管理入口 */
  'product-manage': PackageSearch,
  /** 用户管理入口 */
  'user-manage': UsersRound,
  /** 分类管理入口（树形） */
  'category-tree': ListTree,
  /** 店长身份 / 权限 */
  admin: ShieldCheck,
  /** 启禁用用户 */
  'toggle-power': Power,
  'order-timeline': ClockArrowDown, // 轨迹区块标题
  copy: Copy,
  'copy-check': ClipboardCheck, // 复制成功后的反馈（配合 morph）
  // 我的 / 资料
  'edit-profile': UserPen,
  'edit-field': SquarePen,
  'sign-out': LogOut,
  'switch-role': ArrowRightLeft,
  'default-room': MapPinHouse,
  'id-card': IdCard,
  'user-check': UserCheck,
  // 地址
  'address-book': MapPinned,
  'address-add': HousePlus,
  'default-on': Star,
  'default-off': StarOff,

  // ---- 分类兜底图形 ----
  'cat-drink': CupSoda,
  'cat-snack': Cookie,
  'cat-instant': Soup,
  'cat-daily': SprayCan,
  'cat-stationery': Pencil,
  'cat-fruit': Apple,
  'cat-bakery': Cake,
  'cat-meal': Utensils,
  'cat-drink-soft': Droplet,
  'cat-cloth': Shirt,
  'cat-book': Book,
  'cat-other': Box,
};

/** 取图标数据；名字打错时返回 null，由 AppIcon 兜底成占位方块而不是整页崩 */
export function getIcon(name) {
  return ICONS[name] || null;
}

/**
 * 分类图标解析 —— 两级兜底，返回**语义名**（交给 <AppIcon :name="..." />）
 *
 * 1) `category.icon` 如果**本身就是**一个语义名（管理端可以填 "cat-drink"），直接用。
 *    这是给运营留的口子：以后想把某个分类换成别的图标，改数据库即可，不用发版。
 * 2) 否则按分类名做**关键词**匹配。种子数据里 icon 全是空串，走的就是这条。
 *    用关键词而不是精确名，是因为分类名会被人改（「饮料冲调」→「饮料」也要能命中）。
 * 3) 都不中 → 通用箱子。**永远不返回空**，这样首页宫格不会出现空洞。
 */
const CATEGORY_RULES = [
  { icon: 'cat-drink', kw: ['饮', '水', '可乐', '汽水', '奶茶', '咖啡', '酒', '冲调'] },
  { icon: 'cat-snack', kw: ['零食', '小吃', '薯片', '饼干', '辣条', '糖果', '坚果'] },
  { icon: 'cat-instant', kw: ['泡面', '方便面', '速食', '自热', '面', '粉', '饭'] },
  { icon: 'cat-daily', kw: ['日用', '百货', '清洁', '洗', '纸', '巾', '杯'] },
  { icon: 'cat-stationery', kw: ['文具', '办公', '笔', '本', '打印'] },
  { icon: 'cat-fruit', kw: ['水果', '生鲜', '果'] },
  { icon: 'cat-bakery', kw: ['烘焙', '面包', '蛋糕', '甜点'] },
  { icon: 'cat-cloth', kw: ['服饰', '衣', '袜', '鞋'] },
  { icon: 'cat-book', kw: ['图书', '书'] },
];

export function iconForCategory(category) {
  const raw = category && category.icon;
  if (raw && ICONS[raw]) return raw;

  const name = (category && category.name) || '';
  for (const rule of CATEGORY_RULES) {
    if (rule.kw.some((k) => name.includes(k))) return rule.icon;
  }
  return 'cat-other';
}

/** 所有可用的语义名（设计预览页用来把图标整墙铺开） */
export const ICON_NAMES = Object.keys(ICONS);
