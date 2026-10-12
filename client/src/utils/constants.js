/**
 * 前后端共享枚举 · 前端镜像
 *
 * ⚠️ 本文件必须与后端 server/src/common/constants/enums.ts 保持一致，
 *    以及 server/src/common/constants/error-code.ts 的错误码。
 *    任何一侧改动都要同步另一侧。
 *
 * 为什么不直接从后端 import：小程序端不能引用后端 TS 源码，
 * 跨端能共用的只有「编译后的常量」。所以约定「同名同值」，靠人工 + 自检脚本对齐。
 */

// ===========================================================================
// 用户身份
// ===========================================================================
export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
};

/** 身份中文名 + 工作台入口（决定「我的」页里能切到哪些身份） */
export const ROLE_TEXT = {
  [UserRole.CUSTOMER]: '顾客',
  [UserRole.ADMIN]: '店长',
};

/**
 * 身份图标 —— 存的是 utils/icons.js 里的**语义名**，不是 emoji。
 * 原来这里放 emoji（🛒🛵📋），问题是在微信 / iOS / Android 上字形各不相同，
 * 而且跟项目的线性描边风格对不上。统一交给 <AppIcon :name="ROLE_ICON[role]" />。
 */
export const ROLE_ICON = {
  [UserRole.CUSTOMER]: 'cart',
  [UserRole.ADMIN]: 'store',
};

/**
 * 各身份的**工作台首页** —— 必须与 `pages.json` 里注册的路径一致。
 *
 * ⚠️ 这里曾经写的是 `/pages/admin/workbench`，而 `pages.json` 里**根本没有这个页面**
 *    （管理端只有 dashboard / orders / manage + 三个二级目录页）。
 *    后果：切到店长时 `uni.reLaunch('/pages/admin/workbench')` 跳转失败，
 *    但身份和 token 已经换成 ADMIN 了 → 页面停在**顾客端**原地，
 *    而「我的」页的 tab 是响应式的、立刻变成了管理端 3 项
 *    → 「顾客端「我的」页 + 管理端 tab 栏」这种混合态（图 7）。
 *
 *    教训：`reLaunch` 的目标路径**必须是 pages.json 里真实存在的**。
 *    改这里之前先搜一遍 pages.json。
 */
export const ROLE_HOME = {
  [UserRole.CUSTOMER]: '/pages/home/home',
  [UserRole.ADMIN]: '/pages/admin/dashboard',
};

/**
 * 切换身份成功后**落地页**（停在哪个 tab —— 「我的」/「管理」）。
 *
 * 与 `ROLE_HOME` 的区别：
 *   · `ROLE_HOME`    = 各端**首页**（顾客→商品首页，店长→看板）
 *   · `ROLE_LANDING` = 切完身份**停在哪一页**（顾客→「我的」，店长→「管理」）
 *
 * 为什么落「我的 / 管理」而不是首页：这两个页面是每个工作台里
 * 「跟账号/身份有关」的收口页，切完身份落到这里，用户看一眼
 * 卡片上的身份标签就知道切成功了，不用再去别处确认。
 *
 * ⚠️ 这两个路径同样必须存在于 `pages.json`。
 */
export const ROLE_LANDING = {
  [UserRole.CUSTOMER]: '/pages/mine/mine',
  [UserRole.ADMIN]: '/pages/admin/manage',
};

// ===========================================================================
// 订单状态
// ===========================================================================
export const OrderStatus = {
  PENDING: 'PENDING',
  DELIVERING: 'DELIVERING',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

/**
 * 订单状态机：与后端 ORDER_STATUS_TRANSITIONS 完全一致。
 * 前端用它来决定**显示哪些按钮**，真正的校验在后端 —— 前端只是不给用户
 * 展示注定会失败的操作，不要把它当安全边界。
 *
 * PENDING 可以直接到 DELIVERED（店长已经把货送到了，不必先点接单）。
 */
export const ORDER_STATUS_TRANSITIONS = {
  [OrderStatus.PENDING]: [
    OrderStatus.DELIVERING,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.DELIVERING]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export function canTransit(from, to) {
  return (ORDER_STATUS_TRANSITIONS[from] || []).includes(to);
}

/** 订单状态中文文案（与后端 ORDER_STATUS_TEXT 对齐） */
export const ORDER_STATUS_TEXT = {
  [OrderStatus.PENDING]: '待接单',
  [OrderStatus.DELIVERING]: '配送中',
  [OrderStatus.DELIVERED]: '已送达',
  [OrderStatus.CANCELLED]: '已取消',
};

/**
 * 状态 → 视觉变体（OrderStatusTag 组件消费）
 *
 * 设计约束：状态**不能只靠颜色**区分，所以每个变体还带了一个图标，
 * 组件渲染时会输出「底 + 图标 + 文字」三种冗余线索。
 *
 * solid —— 主色实底 + 白字（用在「配送中」这种最有推进感的状态）
 *
 * icon 是 utils/icons.js 的语义名。四个状态的图形**刻意选得互不相似**
 * （钟 / 卡车 / 对勾 / 叉），因为同色系的小图标在灰度下容易混。
 */
export const ORDER_STATUS_VARIANT = {
  [OrderStatus.PENDING]: { variant: 'warning', icon: 'clock' },
  [OrderStatus.DELIVERING]: { variant: 'solid', icon: 'truck' },
  [OrderStatus.DELIVERED]: { variant: 'success', icon: 'finished' },
  [OrderStatus.CANCELLED]: { variant: 'muted', icon: 'close' },
};

/** 顾客端能自助取消的状态集合（已送达 / 已取消就不行了） */
export const CUSTOMER_CANCELLABLE = [OrderStatus.PENDING, OrderStatus.DELIVERING];

// ===========================================================================
// 其它
// ===========================================================================
export const PayStatus = { UNPAID: 0, PAID: 1, CASH_ON_DELIVERY: 2 };
export const PayType = { UNSET: 0, WECHAT: 1, OFFLINE: 2 };
export const CommonStatus = { DISABLED: 0, ENABLED: 1 };
export const Gender = { UNKNOWN: 0, MALE: 1, FEMALE: 2 };

export const GENDER_TEXT = {
  [Gender.UNKNOWN]: '未设置',
  [Gender.MALE]: '男',
  [Gender.FEMALE]: '女',
};

// ===========================================================================
// 错误码
// ===========================================================================
export const ErrorCode = {
  SUCCESS: 0,
  PARAM_INVALID: 10001,
  RESOURCE_NOT_FOUND: 10002,
  TOO_MANY_REQUESTS: 10003,

  UNAUTHORIZED: 20001,
  TOKEN_EXPIRED: 20002,
  FORBIDDEN: 20003,
  ACCOUNT_DISABLED: 20004,

  USER_NOT_FOUND: 30001,
  PHONE_ALREADY_EXIST: 30002,
  ROLE_NOT_GRANTED: 30003,
  ROLE_PROTECTED: 30004,

  PRODUCT_NOT_FOUND: 40001,
  PRODUCT_OFF_SHELF: 40002,
  STOCK_NOT_ENOUGH: 40003,
  CATEGORY_NOT_FOUND: 40004,
  CATEGORY_HAS_CHILDREN: 40005,
  CATEGORY_HAS_PRODUCTS: 40006,
  PRODUCT_IN_USE: 40007,

  ORDER_NOT_FOUND: 50001,
  ORDER_STATUS_INVALID: 50002,
  ORDER_NOT_OWNED: 50003,
  CART_EMPTY: 50004,

  SERVER_ERROR: 90001,
  SERVICE_UNAVAILABLE: 90002,
};

/** 需要「踢回登录页」的错误码集合：token 失效类 + 身份不对类 */
export const AUTH_FAIL_CODES = [
  ErrorCode.UNAUTHORIZED,
  ErrorCode.TOKEN_EXPIRED,
  ErrorCode.ACCOUNT_DISABLED,
  ErrorCode.FORBIDDEN,
];

// ===========================================================================
// 分页
// ===========================================================================
export const PAGE_SIZE_DEFAULT = 10;
export const PAGE_SIZE_MAX = 50;

// ===========================================================================
// 业务上限
// ===========================================================================

/**
 * 单个商品的购买数量上限。
 *
 * ⚠️ 必须和后端 `server/src/modules/cart/dto/cart.dto.ts` 的
 *    `MAX_CART_QUANTITY`、以及 `order.dto.ts` 里 `OrderItemInputDto.quantity`
 *    的 `@Max(99)` 保持一致。三处任意一处改了这里也要跟着改。
 */
export const MAX_CART_QUANTITY = 99;

/** 备注 / 门牌号 / 收件人的最大长度，对齐后端 CreateOrderDto 的 @MaxLength */
export const MAX_REMARK_LENGTH = 255;
export const MAX_ROOM_NO_LENGTH = 32;
export const MAX_CONTACT_NAME_LENGTH = 32;

/** 手机号正则 —— 与后端 CreateOrderDto 的 @Matches(/^1[3-9]\d{9}$/) 同一条 */
export const PHONE_PATTERN = /^1[3-9]\d{9}$/;
