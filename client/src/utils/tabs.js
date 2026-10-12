/**
 * 各身份的底部 tab 配置
 *
 * 为什么自绘 tab 而不是用 pages.json 的 tabBar：
 *   pages.json 的 tabBar 是**编译期静态配置**，整包只能有一套，
 *   没法「顾客看 4 个、店长看 3 个」。
 *   微信的 custom:true 只在小程序端生效，H5 预览看不到，调试很痛苦。
 *
 * 代价：自绘就意味着这些页面不能注册成真正的 tabBar 页，
 *      切换时要用 reLaunch（会丢页面内滚动位置/临时状态）。
 *      这是有意取舍 —— 见 docs/03-前端设计.md §4.1。
 *
 * icon 存的是 utils/icons.js 里的**语义名**（原来放 emoji，字形跨端不统一）。
 *
 * v1.2：只有「顾客」和「店长」两种身份，派单端工作台已下线。
 */

export const TAB_CUSTOMER = [
  { key: 'home', label: '首页', icon: 'home', path: '/pages/home/home' },
  { key: 'category', label: '分类', icon: 'category', path: '/pages/category/category' },
  { key: 'cart', label: '购物车', icon: 'cart', path: '/pages/cart/cart' },
  { key: 'mine', label: '我的', icon: 'mine', path: '/pages/mine/mine' },
];

export const TAB_ADMIN = [
  { key: 'dashboard', label: '看板', icon: 'dashboard', path: '/pages/admin/dashboard' },
  { key: 'orders', label: '订单', icon: 'orders', path: '/pages/admin/orders' },
  { key: 'manage', label: '管理', icon: 'manage', path: '/pages/admin/manage' },
];

export const TABS_BY_ROLE = {
  CUSTOMER: TAB_CUSTOMER,
  ADMIN: TAB_ADMIN,
};

export function tabsOfRole(role) {
  return TABS_BY_ROLE[role] || TAB_CUSTOMER;
}

/**
 * 按 key 建索引，页面拿自己那一项做高亮/角标时不用再 find 一遍。
 * 例：TAB_INDEX.cart
 */
export const TAB_INDEX = [...TAB_CUSTOMER, ...TAB_ADMIN].reduce((acc, t) => {
  acc[t.key] = t;
  return acc;
}, {});
