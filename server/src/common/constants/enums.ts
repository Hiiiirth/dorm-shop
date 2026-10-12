/**
 * 全局枚举
 *
 * ⚠️ 本文件必须与前端 client/src/utils/constants.js 保持一致，
 *    任何一侧改动都要同步另一侧。
 */

/** 用户身份 */
export enum UserRole {
  /** 顾客 */
  CUSTOMER = 'CUSTOMER',
  /** 管理员（店长） */
  ADMIN = 'ADMIN',
}

/** 订单状态 */
export enum OrderStatus {
  /** 待接单（顾客已下单，等店长处理） */
  PENDING = 'PENDING',
  /** 配送中 */
  DELIVERING = 'DELIVERING',
  /** 已送达（终态） */
  DELIVERED = 'DELIVERED',
  /** 已取消（终态） */
  CANCELLED = 'CANCELLED',
}

/**
 * 订单状态机：只允许表中列出的流转。
 * Service 层每次改状态前都要过一遍校验，非法流转统一抛 50002。
 *
 * v1.2：去掉了 DISPATCHED。现在的流程是
 *   顾客下单 PENDING → 店长接单 DELIVERING → 确认送达 DELIVERED
 * 注意 PENDING 也允许直接到 DELIVERED：店长可能已经把货送到门口了，
 * 强制先点一次「接单」只是多一步无意义的操作。
 * 顾客可以在 PENDING / DELIVERING 两个阶段自助取消。
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.DELIVERING, OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERING]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

/** 判断某个状态是否允许流转到目标状态 */
export function canTransit(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

/** 订单状态中文文案（前端也可直接用这个，保证前后端一致） */
export const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: '待接单',
  [OrderStatus.DELIVERING]: '配送中',
  [OrderStatus.DELIVERED]: '已送达',
  [OrderStatus.CANCELLED]: '已取消',
};

/** 支付状态（MVP 走线下结算，PAID 预留） */
export enum PayStatus {
  UNPAID = 0,
  PAID = 1,
  /** 货到付款 */
  CASH_ON_DELIVERY = 2,
}

/** 支付方式 */
export enum PayType {
  UNSET = 0,
  /** 微信支付（预留，MVP 不启用） */
  WECHAT = 1,
  /** 线下结算 */
  OFFLINE = 2,
}

/** 通用启用/禁用 */
export enum CommonStatus {
  DISABLED = 0,
  ENABLED = 1,
}

/** 性别 */
export enum Gender {
  UNKNOWN = 0,
  MALE = 1,
  FEMALE = 2,
}
