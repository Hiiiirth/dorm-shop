import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Category, Order, OrderItem, Product, User } from '../../entities';
import { OrderStatus } from '../../common/constants/enums';
import { yuanToFen } from '../../common/utils/money';
import { AdminStatisticsVo } from './admin.vo';

/** 热销榜取前几名 */
const HOT_PRODUCT_LIMIT = 10;

@Injectable()
export class AdminStatisticsService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
  ) {}

  /**
   * 经营看板
   *
   * 订单口径一律是「已送达才算营收」——
   * 这单生意线下结算，没送到就等于没发生，把 PENDING/DELIVERING 也算进营收会虚高。
   *
   * 时区：全部用 `DATE(col) = CURDATE()`，走数据库会话时区（连接里固定 +08:00），
   * 不在 JS 里算「今天零点」，避免容器/宿主机时区不同导致差一天。
   */
  async overview(): Promise<AdminStatisticsVo> {
    // 一次查询算出订单侧的全部标量指标
    const rows: Record<string, string | number>[] = await this.orderRepo.query(
      `SELECT
         COALESCE(SUM(DATE(o.created_at) = CURDATE()), 0)                                          AS today_orders,
         COALESCE(SUM(o.status = 'DELIVERED' AND DATE(o.delivered_at) = CURDATE()), 0)              AS today_delivered,
         COALESCE(SUM(o.status = 'CANCELLED' AND DATE(o.cancelled_at) = CURDATE()), 0)              AS today_cancelled,
         COALESCE(SUM(CASE WHEN o.status = 'DELIVERED' AND DATE(o.delivered_at) = CURDATE()
                           THEN o.total_amount END), 0)                                             AS today_revenue,
         COUNT(*)                                                                                   AS total_orders,
         COALESCE(SUM(o.status = 'DELIVERED'), 0)                                                   AS total_delivered,
         COALESCE(SUM(o.status = 'CANCELLED'), 0)                                                   AS total_cancelled,
         COALESCE(SUM(CASE WHEN o.status = 'DELIVERED' THEN o.total_amount END), 0)                 AS total_revenue,
         COALESCE(SUM(o.status = 'PENDING'), 0)                                                     AS cnt_pending,
         COALESCE(SUM(o.status = 'DELIVERING'), 0)                                                  AS cnt_delivering,
         COALESCE(SUM(o.status = 'DELIVERED'), 0)                                                   AS cnt_delivered,
         COALESCE(SUM(o.status = 'CANCELLED'), 0)                                                   AS cnt_cancelled
       FROM \`order\` o
       WHERE o.deleted_at IS NULL`,
    );
    const order = rows?.[0] ?? {};

    const [userRows, productCount, categoryCount, hotRows] = await Promise.all([
      this.userRepo.query(
        `SELECT
           COALESCE(SUM(DATE(u.created_at) = CURDATE()), 0) AS today_new,
           COUNT(*)                                         AS total_users
         FROM \`user\` u
         WHERE u.deleted_at IS NULL`,
      ) as Promise<Record<string, string | number>[]>,
      this.productRepo.count(),
      this.categoryRepo.count(),
      // 热销：按「已送达订单里卖出的件数」排；商品名取快照名，
      // 商品后来改名/删除都不影响历史榜单的口径
      this.orderItemRepo.query(
        `SELECT
           i.product_id                        AS productId,
           MAX(i.product_name)                 AS name,
           SUM(i.quantity)                     AS quantity,
           COALESCE(SUM(i.subtotal), 0)        AS amount
         FROM order_item i
         INNER JOIN \`order\` o ON o.id = i.order_id
         WHERE o.deleted_at IS NULL AND o.status = ?
         GROUP BY i.product_id
         ORDER BY quantity DESC, amount DESC, i.product_id ASC
         LIMIT ?`,
        [OrderStatus.DELIVERED, HOT_PRODUCT_LIMIT],
      ) as Promise<Record<string, string | number>[]>,
    ]);

    const user = userRows?.[0] ?? {};

    const statusCounts = {
      [OrderStatus.PENDING]: Number(order.cnt_pending ?? 0),
      [OrderStatus.DELIVERING]: Number(order.cnt_delivering ?? 0),
      [OrderStatus.DELIVERED]: Number(order.cnt_delivered ?? 0),
      [OrderStatus.CANCELLED]: Number(order.cnt_cancelled ?? 0),
    } as Record<OrderStatus, number>;

    return {
      today: {
        orderCount: Number(order.today_orders ?? 0),
        deliveredCount: Number(order.today_delivered ?? 0),
        cancelledCount: Number(order.today_cancelled ?? 0),
        revenue: yuanToFen(order.today_revenue ?? 0),
        newUsers: Number(user.today_new ?? 0),
      },
      total: {
        orderCount: Number(order.total_orders ?? 0),
        deliveredCount: Number(order.total_delivered ?? 0),
        cancelledCount: Number(order.total_cancelled ?? 0),
        revenue: yuanToFen(order.total_revenue ?? 0),
        userCount: Number(user.total_users ?? 0),
        productCount,
        categoryCount,
      },
      statusCounts,
      hotProducts: (hotRows ?? []).map((row) => ({
        productId: Number(row.productId),
        name: String(row.name ?? ''),
        quantity: Number(row.quantity ?? 0),
        amount: yuanToFen(row.amount ?? 0),
      })),
    };
  }
}
