import { Order, OrderItem, OrderStatusLog } from '../../entities';
import { ORDER_STATUS_TEXT, OrderStatus, UserRole } from '../../common/constants/enums';
import { yuanToFen } from '../../common/utils/money';

export interface OrderItemVo {
  id: number;
  productId: number;
  /** 下单时的商品名快照 */
  name: string;
  coverImage: string;
  /** 单位：分 */
  unitPrice: number;
  quantity: number;
  /** 单位：分 */
  subtotal: number;
}

export interface OrderListVo {
  id: number;
  orderNo: string;
  status: OrderStatus;
  statusText: string;
  /** 单位：分 */
  totalAmount: number;
  /** 商品种类数 */
  itemCount: number;
  /** 商品总件数 */
  totalQuantity: number;
  roomNo: string;
  createdAt: Date;
  items: OrderItemVo[];
}

export interface OrderStatusLogVo {
  fromStatus: string;
  toStatus: OrderStatus;
  operatorRole: UserRole | null;
  remark: string;
  createdAt: Date;
}

export interface OrderDetailVo extends OrderListVo {
  contactName: string;
  contactPhone: string;
  remark: string;
  payType: number;
  payStatus: number;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  /** 状态流转轨迹，按时间正序 */
  statusLogs: OrderStatusLogVo[];
}

export function toOrderItemVo(item: OrderItem): OrderItemVo {
  return {
    id: item.id,
    productId: item.productId,
    name: item.productName,
    // 快照列现在是 nullable mediumtext → 统一空串；前端 OrderItemRow 里
    // ProductImage 的 `v-if="src && !failed"` 对空串会退回字标占位
    coverImage: item.productCover ?? '',
    unitPrice: yuanToFen(item.unitPrice),
    quantity: item.quantity,
    subtotal: yuanToFen(item.subtotal),
  };
}

export function toOrderListVo(order: Order, items: OrderItem[]): OrderListVo {
  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    statusText: ORDER_STATUS_TEXT[order.status] ?? order.status,
    totalAmount: yuanToFen(order.totalAmount),
    itemCount: order.itemCount,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    roomNo: order.roomNo,
    createdAt: order.createdAt,
    items: items.map(toOrderItemVo),
  };
}

export function toOrderStatusLogVo(log: OrderStatusLog): OrderStatusLogVo {
  return {
    fromStatus: log.fromStatus,
    toStatus: log.toStatus,
    operatorRole: log.operatorRole,
    remark: log.remark,
    createdAt: log.createdAt,
  };
}
