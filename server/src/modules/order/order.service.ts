import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { Cart, Order, OrderItem, OrderStatusLog, Product } from '../../entities';
import {
  CommonStatus,
  OrderStatus,
  PayStatus,
  PayType,
  UserRole,
  canTransit,
} from '../../common/constants/enums';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code';
import { PageResult } from '../../common/response/page-result';
import { fenToYuan, yuanToFen } from '../../common/utils/money';
import { CancelOrderDto, CreateOrderDto, OrderQueryDto, PreviewOrderDto } from './dto/order.dto';
import {
  OrderDetailVo,
  OrderListVo,
  toOrderItemVo,
  toOrderListVo,
  toOrderStatusLogVo,
} from './order.vo';
import { OrderNoService } from './order-no.service';

/** 校验通过后的下单行：商品实体 + 数量 */
interface ResolvedLine {
  product: Product;
  quantity: number;
}

/** 下单预览结果 */
export interface PreviewOrderVo {
  items: {
    productId: number;
    name: string;
    coverImage: string;
    unit: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }[];
  unitCount: number;
  totalQuantity: number;
  /** 单位：分 */
  totalAmount: number;
}

/** 用户可自行取消的状态。 */
const USER_CANCELLABLE: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.DELIVERING];

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>,
    private readonly orderNoService: OrderNoService,
    private readonly dataSource: DataSource,
  ) {}

  // ===============================================================
  // 下单预览：算价 + 校验，不落库
  // ===============================================================
  async preview(userId: number, dto: PreviewOrderDto): Promise<PreviewOrderVo> {
    const lines = await this.resolveLines(userId, dto.items, dto.cartIds);

    const items = lines.map((line) => {
      const unitPrice = yuanToFen(line.product.price);
      return {
        productId: line.product.id,
        name: line.product.name,
        // 封面现在是 nullable mediumtext → 统一成空串，前端只判 falsy
        coverImage: line.product.coverImage ?? '',
        unit: line.product.unit,
        unitPrice,
        quantity: line.quantity,
        subtotal: unitPrice * line.quantity,
      };
    });

    return {
      items,
      unitCount: items.length,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      totalAmount: items.reduce((sum, item) => sum + item.subtotal, 0),
    };
  }

  // ===============================================================
  // 创建订单
  // ===============================================================
  async create(userId: number, dto: CreateOrderDto): Promise<OrderDetailVo> {
    // 事务外先做一轮校验和定价，把大部分错误挡在开事务之前
    const lines = await this.resolveLines(userId, dto.items, dto.cartIds);

    const orderId = await this.dataSource.transaction(async (manager) => {
      let totalFen = 0;
      const itemRows: Partial<OrderItem>[] = [];

      for (const line of lines) {
        // 逐行加锁读，避免并发下单把库存扣成负数（SELECT ... FOR UPDATE）
        const product = await manager.findOne(Product, {
          where: { id: line.product.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!product) throw new BusinessException(ErrorCode.PRODUCT_NOT_FOUND);
        if (product.status !== CommonStatus.ENABLED) {
          throw new BusinessException(ErrorCode.PRODUCT_OFF_SHELF, `「${product.name}」已下架`);
        }
        if (product.stock < line.quantity) {
          throw new BusinessException(
            ErrorCode.STOCK_NOT_ENOUGH,
            `「${product.name}」库存只剩 ${product.stock} ${product.unit}`,
          );
        }

        product.stock -= line.quantity;
        product.salesCount += line.quantity;
        await manager.save(product);

        const unitPriceFen = yuanToFen(product.price);
        const subtotalFen = unitPriceFen * line.quantity;
        totalFen += subtotalFen;

        // 存快照：商品之后改名改价都不影响这一单
        itemRows.push({
          productId: product.id,
          productName: product.name,
          productCover: product.coverImage ?? '',
          unitPrice: fenToYuan(unitPriceFen),
          quantity: line.quantity,
          subtotal: fenToYuan(subtotalFen),
        });
      }

      const orderNo = await this.orderNoService.generate(manager);

      const order = await manager.save(
        manager.create(Order, {
          orderNo,
          userId,
          status: OrderStatus.PENDING,
          totalAmount: fenToYuan(totalFen),
          itemCount: itemRows.length,
          roomNo: dto.roomNo,
          contactName: dto.contactName,
          contactPhone: dto.contactPhone,
          remark: dto.remark ?? '',
          // MVP 线下结算：货到付款，不接微信支付
          payStatus: PayStatus.CASH_ON_DELIVERY,
          payType: PayType.OFFLINE,
        }),
      );

      await manager.save(
        itemRows.map((row) => manager.create(OrderItem, { ...row, orderId: order.id })),
      );

      await manager.save(
        manager.create(OrderStatusLog, {
          orderId: order.id,
          fromStatus: '',
          toStatus: OrderStatus.PENDING,
          operatorId: userId,
          operatorRole: UserRole.CUSTOMER,
          remark: '用户提交订单',
        }),
      );

      // 从购物车下单的，把用掉的条目清掉
      if (dto.cartIds?.length) {
        await manager.getRepository(Cart).delete({ id: In(dto.cartIds), userId });
      }

      return order.id;
    });

    // v1.2：不再有自动派单。订单创建后就是 PENDING，等店长在工作台看到并处理。
    return this.detailMine(userId, orderId);
  }

  // ===============================================================
  // 我的订单列表
  // ===============================================================
  async listMine(userId: number, query: OrderQueryDto): Promise<PageResult<OrderListVo>> {
    const [orders, total] = await this.orderRepo.findAndCount({
      where: { userId, ...(query.status ? { status: query.status } : {}) },
      order: { id: 'DESC' },
      skip: query.skip,
      take: query.take,
    });

    const itemMap = await this.loadItemsMap(orders.map((order) => order.id));
    const list = orders.map((order) => toOrderListVo(order, itemMap.get(order.id) ?? []));

    return PageResult.of(list, total, query.page, query.pageSize);
  }

  // ===============================================================
  // 订单详情
  // ===============================================================
  async detailMine(userId: number, orderId: number): Promise<OrderDetailVo> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    // 不存在与不属于自己返回同一个错误，避免探测他人订单号
    if (!order || order.userId !== userId) {
      throw new BusinessException(ErrorCode.ORDER_NOT_FOUND);
    }

    return this.buildDetailVo(order);
  }

  /** 管理端用：不校验归属，管理员能看全部订单 */
  async detailAsAdmin(orderId: number): Promise<OrderDetailVo> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new BusinessException(ErrorCode.ORDER_NOT_FOUND);
    return this.buildDetailVo(order);
  }

  private async buildDetailVo(order: Order): Promise<OrderDetailVo> {
    const orderId = order.id;

    const [items, logs] = await Promise.all([
      this.orderItemRepo.find({ where: { orderId }, order: { id: 'ASC' } }),
      this.orderStatusLogRepoFind(orderId),
    ]);

    return {
      ...toOrderListVo(order, items),
      contactName: order.contactName,
      contactPhone: order.contactPhone,
      remark: order.remark,
      payType: order.payType,
      payStatus: order.payStatus,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason,
      statusLogs: logs.map(toOrderStatusLogVo),
    };
  }

  // ===============================================================
  // 取消订单
  // ===============================================================
  async cancel(userId: number, orderId: number, dto: CancelOrderDto): Promise<OrderDetailVo> {
    await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order || order.userId !== userId) {
        throw new BusinessException(ErrorCode.ORDER_NOT_FOUND);
      }
      if (!USER_CANCELLABLE.includes(order.status)) {
        throw new BusinessException(
          ErrorCode.ORDER_STATUS_INVALID,
          order.status === OrderStatus.CANCELLED ? '订单已取消' : '订单已送达，无法取消',
        );
      }

      await this.applyCancel(manager, order, dto.reason ?? '用户取消', userId, UserRole.CUSTOMER);
    });

    return this.detailMine(userId, orderId);
  }

  /**
   * 管理端强制取消
   *
   * 已送达的订单不能取消（东西已经交出去了）。
   * 库存回滚等逻辑和用户端共用 applyCancel，避免两处实现漂移。
   */
  async cancelByAdmin(
    orderId: number,
    reason: string | undefined,
    operatorId: number,
  ): Promise<OrderDetailVo> {
    await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new BusinessException(ErrorCode.ORDER_NOT_FOUND);

      if (!canTransit(order.status, OrderStatus.CANCELLED)) {
        throw new BusinessException(
          ErrorCode.ORDER_STATUS_INVALID,
          order.status === OrderStatus.CANCELLED
            ? '订单已经是取消状态'
            : order.status === OrderStatus.DELIVERED
              ? '订单已送达，不能取消'
              : `订单当前是「${order.status}」，不能取消`,
        );
      }

      await this.applyCancel(
        manager,
        order,
        reason ?? '管理员取消',
        operatorId,
        UserRole.ADMIN,
      );
    });

    return this.detailAsAdmin(orderId);
  }

  /** 取消的实际动作：回滚库存销量 + 改状态 + 写轨迹 */
  private async applyCancel(
    manager: EntityManager,
    order: Order,
    reason: string,
    operatorId: number,
    operatorRole: UserRole,
  ): Promise<void> {
    const fromStatus = order.status;
    const orderId = order.id;
    const items = await manager.find(OrderItem, { where: { orderId } });

    // 回滚库存与销量
    for (const item of items) {
      await manager.increment(Product, { id: item.productId }, 'stock', item.quantity);
      await manager.decrement(Product, { id: item.productId }, 'salesCount', item.quantity);
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    order.cancelReason = reason;
    await manager.save(order);

    await manager.save(
      manager.create(OrderStatusLog, {
        orderId,
        fromStatus,
        toStatus: OrderStatus.CANCELLED,
        operatorId,
        operatorRole,
        remark: reason,
      }),
    );
  }

  // ===============================================================
  // 内部工具
  // ===============================================================
  /**
   * 把「直接下单的 items」或「购物车 cartIds」统一解析成待下单的行，
   * 并完成存在性 / 上架 / 库存校验。
   */
  private async resolveLines(
    userId: number,
    items?: { productId: number; quantity: number }[],
    cartIds?: number[],
  ): Promise<ResolvedLine[]> {
    const quantities = new Map<number, number>();

    if (items?.length) {
      for (const item of items) {
        quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
      }
    } else if (cartIds?.length) {
      const cartRows = await this.cartRepo.find({ where: { id: In(cartIds), userId } });
      if (cartRows.length !== cartIds.length) {
        throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, '购物车里有条目已不存在，请刷新后重试');
      }
      for (const row of cartRows) {
        quantities.set(row.productId, (quantities.get(row.productId) ?? 0) + row.quantity);
      }
    } else {
      throw new BusinessException(ErrorCode.CART_EMPTY, '请先选择要购买的商品');
    }

    const productIds = [...quantities.keys()];
    const products = await this.productRepo.findBy({ id: In(productIds) });
    const productMap = new Map(products.map((product) => [product.id, product]));

    return productIds.map((productId) => {
      const product = productMap.get(productId);
      const quantity = quantities.get(productId) ?? 0;

      if (!product) throw new BusinessException(ErrorCode.PRODUCT_NOT_FOUND, '有商品已下架，请返回购物车确认');
      if (product.status !== CommonStatus.ENABLED) {
        throw new BusinessException(ErrorCode.PRODUCT_OFF_SHELF, `「${product.name}」已下架`);
      }
      if (product.stock < quantity) {
        throw new BusinessException(
          ErrorCode.STOCK_NOT_ENOUGH,
          `「${product.name}」库存只剩 ${product.stock} ${product.unit}`,
        );
      }
      return { product, quantity };
    });
  }

  /** 批量取订单明细，避免列表接口 N+1 查询 */
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

  private orderStatusLogRepoFind(orderId: number): Promise<OrderStatusLog[]> {
    return this.dataSource.getRepository(OrderStatusLog).find({
      where: { orderId },
      order: { id: 'ASC' },
    });
  }
}
