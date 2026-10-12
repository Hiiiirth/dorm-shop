import { Order, OrderItem, User } from '../../entities';
import { ORDER_STATUS_TEXT, OrderStatus } from '../../common/constants/enums';
import { yuanToFen } from '../../common/utils/money';
import { OrderItemVo, OrderStatusLogVo, toOrderItemVo } from '../order/order.vo';

/** 管理端订单列表项：在顾客端基础上补上下单人是谁 */
export interface AdminOrderVo {
  id: number;
  orderNo: string;
  status: OrderStatus;
  statusText: string;
  /** 单位：分 */
  totalAmount: number;
  itemCount: number;
  totalQuantity: number;
  roomNo: string;
  contactName: string;
  contactPhone: string;
  remark: string;
  /** 下单人 */
  userId: number;
  customer: { id: number; nickname: string; phone: string | null } | null;
  createdAt: Date;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  items: OrderItemVo[];
}

/** 管理端订单详情：再加支付信息与状态轨迹 */
export interface AdminOrderDetailVo extends AdminOrderVo {
  payType: number;
  payStatus: number;
  statusLogs: OrderStatusLogVo[];
}

/** 经营看板 */
export interface AdminStatisticsVo {
  today: {
    orderCount: number;
    deliveredCount: number;
    cancelledCount: number;
    /** 今日已送达订单的金额合计（分） */
    revenue: number;
    /** 今日新增用户 */
    newUsers: number;
  };
  total: {
    orderCount: number;
    deliveredCount: number;
    cancelledCount: number;
    /** 累计已送达订单的金额合计（分） */
    revenue: number;
    userCount: number;
    productCount: number;
    categoryCount: number;
  };
  /** 各状态订单数（看板用，保证五个状态都有键） */
  statusCounts: Record<OrderStatus, number>;
  /** 热销 TOP（按已送达订单里卖出的件数排） */
  hotProducts: {
    productId: number;
    name: string;
    quantity: number;
    /** 单位：分 */
    amount: number;
  }[];
}

const brief = (user: User | null | undefined) =>
  user ? { id: user.id, nickname: user.nickname, phone: user.phone } : null;

export function toAdminOrderVo(
  order: Order,
  items: OrderItem[],
  customer: User | null,
): AdminOrderVo {
  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    statusText: ORDER_STATUS_TEXT[order.status] ?? order.status,
    totalAmount: yuanToFen(order.totalAmount),
    itemCount: order.itemCount,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    roomNo: order.roomNo,
    contactName: order.contactName,
    contactPhone: order.contactPhone,
    remark: order.remark,
    userId: order.userId,
    customer: brief(customer),
    createdAt: order.createdAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    cancelReason: order.cancelReason,
    items: items.map(toOrderItemVo),
  };
}
