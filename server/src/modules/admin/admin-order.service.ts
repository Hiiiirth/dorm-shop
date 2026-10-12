import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { Order, OrderItem, OrderStatusLog, User } from '../../entities';
import { OrderStatus, ORDER_STATUS_TEXT, UserRole, canTransit } from '../../common/constants/enums';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code';
import { PageResult } from '../../common/response/page-result';
import { OrderService } from '../order/order.service';
import { toOrderStatusLogVo } from '../order/order.vo';
import { AdminOrderDetailVo, AdminOrderVo, toAdminOrderVo } from './admin.vo';
import { AdminCancelOrderDto, AdminOrderQueryDto } from './dto/admin.dto';

@Injectable()
export class AdminOrderService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(OrderStatusLog) private readonly statusLogRepo: Repository<OrderStatusLog>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly orderService: OrderService,
    private readonly dataSource: DataSource,
  ) {}

  /** 全部订单，多条件筛选 */
  async list(query: AdminOrderQueryDto): Promise<PageResult<AdminOrderVo>> {
    const qb = this.orderRepo.createQueryBuilder('o');

    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    if (query.userId) qb.andWhere('o.userId = :userId', { userId: query.userId });
    if (query.keyword) {
      qb.andWhere(
        '(o.orderNo LIKE :kw OR o.roomNo LIKE :kw OR o.contactName LIKE :kw OR o.contactPhone LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }
    // 用 DATE() 比而不是拼 DateTime 字符串：会话时区是 +08:00，
    // 这样「今天」的边界和数据库一致，不会因为本地时区不同而错一天
    if (query.dateFrom) qb.andWhere('DATE(o.createdAt) >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('DATE(o.createdAt) <= :dateTo', { dateTo: query.dateTo });

    const [orders, total] = await qb
      .orderBy('o.id', 'DESC')
      .skip(query.skip)
      .take(query.take)
      .getManyAndCount();

    const [itemMap, userMap] = await Promise.all([
      this.loadItemsMap(orders.map((order) => order.id)),
      this.loadUserMap(orders),
    ]);

    const list = orders.map((order) =>
      toAdminOrderVo(order, itemMap.get(order.id) ?? [], userMap.get(order.userId) ?? null),
    );

    return PageResult.of(list, total, query.page, query.pageSize);
  }

  async detail(orderId: number): Promise<AdminOrderDetailVo> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new BusinessException(ErrorCode.ORDER_NOT_FOUND);

    const [items, logs, customer] = await Promise.all([
      this.orderItemRepo.find({ where: { orderId }, order: { id: 'ASC' } }),
      this.statusLogRepo.find({ where: { orderId }, order: { id: 'ASC' } }),
      this.userRepo.findOne({ where: { id: order.userId } }),
    ]);

    return {
      ...toAdminOrderVo(order, items, customer),
      payType: order.payType,
      payStatus: order.payStatus,
      statusLogs: logs.map(toOrderStatusLogVo),
    };
  }

  // ===============================================================
  // 订单处理：接单（开始配送） / 确认送达
  // ===============================================================
  /**
   * 接单：PENDING → DELIVERING
   *
   * 店长在工作台看到新单后点「接单」，表示「我开始处理这一单」。
   * 这替代了原来的「派单」动作 —— 不再需要挑一个派单员，店长自己就是处理人。
   */
  async accept(orderId: number, operatorId: number): Promise<AdminOrderDetailVo> {
    await this.transit(orderId, OrderStatus.DELIVERING, operatorId, {
      [OrderStatus.DELIVERING]: '这一单已经在处理中了',
      [OrderStatus.DELIVERED]: '这一单已送达，不用再接',
      [OrderStatus.CANCELLED]: '这一单已被取消',
    });
    return this.detail(orderId);
  }

  /**
   * 确认送达：DELIVERING → DELIVERED（终态）
   *
   * 允许从 PENDING 直接送达 —— 店长可能已经把货送到门口了，
   * 强制先点一次「接单」只是多一步无意义的操作。
   */
  async deliver(orderId: number, operatorId: number): Promise<AdminOrderDetailVo> {
    await this.transit(orderId, OrderStatus.DELIVERED, operatorId, {
      [OrderStatus.DELIVERED]: '这一单已送达，别重复点',
      [OrderStatus.CANCELLED]: '这一单已被取消，无法送达',
    });
    return this.detail(orderId);
  }

  /**
   * 状态流转的公共实现：加锁 → 校验 → 改状态 → 写轨迹
   *
   * 加锁是必须的：店长的「确认送达」和顾客的「取消」可能同时发生，
   * 不加锁会两边都读到旧状态然后各自改一次。
   */
  private async transit(
    orderId: number,
    target: OrderStatus,
    operatorId: number,
    hints: Partial<Record<OrderStatus, string>>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new BusinessException(ErrorCode.ORDER_NOT_FOUND);

      const from = order.status;
      if (hints[from]) {
        throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID, hints[from]);
      }
      if (!canTransit(from, target)) {
        throw new BusinessException(
          ErrorCode.ORDER_STATUS_INVALID,
          `订单当前是「${ORDER_STATUS_TEXT[from] ?? from}」，不能变更为「${ORDER_STATUS_TEXT[target] ?? target}」`,
        );
      }

      order.status = target;
      // 送达时间只写一次，且只由「确认送达」这个动作写
      if (target === OrderStatus.DELIVERED) order.deliveredAt = new Date();
      await manager.save(order);

      await manager.save(
        manager.create(OrderStatusLog, {
          orderId,
          fromStatus: from,
          toStatus: target,
          operatorId,
          operatorRole: UserRole.ADMIN,
          remark:
            target === OrderStatus.DELIVERING ? '店长接单，开始处理' : '店长确认送达',
        }),
      );
    });
  }

  /** 管理员强制取消（已送达的不能取消） */
  async cancel(
    orderId: number,
    dto: AdminCancelOrderDto,
    operatorId: number,
  ): Promise<AdminOrderDetailVo> {
    await this.orderService.cancelByAdmin(orderId, dto.reason, operatorId);
    return this.detail(orderId);
  }

  /** 管理端用的状态字典（前端做筛选下拉用，避免前端硬编码中文） */
  statusOptions(): { value: OrderStatus; label: string }[] {
    return Object.values(OrderStatus).map((value) => ({
      value,
      label: ORDER_STATUS_TEXT[value] ?? value,
    }));
  }

  // ---------------------------------------------------------------
  private async loadItemsMap(orderIds: number[]): Promise<Map<number, OrderItem[]>> {
    const map = new Map<number, OrderItem[]>();
    if (orderIds.length === 0) return map;

    const rows = await this.orderItemRepo.find({
      where: { orderId: In(orderIds) },
      order: { id: 'ASC' },
    });
    for (const row of rows) {
      const list = map.get(row.orderId) ?? [];
      list.push(row);
      map.set(row.orderId, list);
    }
    return map;
  }

  /** 批量取下单人，避免列表 N+1 */
  private async loadUserMap(orders: Order[]): Promise<Map<number, User>> {
    const ids = new Set<number>();
    for (const order of orders) ids.add(order.userId);
    if (ids.size === 0) return new Map();

    const users = await this.userRepo.findBy({ id: In([...ids]) });
    return new Map(users.map((user) => [user.id, user]));
  }
}
