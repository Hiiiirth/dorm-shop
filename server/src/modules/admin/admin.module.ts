import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  Cart,
  Category,
  Order,
  OrderItem,
  OrderStatusLog,
  Product,
  User,
} from '../../entities';
import { CategoryModule } from '../category/category.module';
import { OrderModule } from '../order/order.module';
import { AdminCategoryService } from './admin-category.service';
import { AdminOrderService } from './admin-order.service';
import { AdminProductService } from './admin-product.service';
import { AdminStatisticsService } from './admin-statistics.service';
import { AdminUserService } from './admin-user.service';
import { AdminController } from './admin.controller';

/**
 * 管理端模块
 *
 * 取消订单不在这里重写一遍业务逻辑，而是直接复用
 * `OrderService.cancelByAdmin()` —— 库存回滚、状态轨迹这些副作用
 * 只有一处实现，不然管理端和用户端迟早会走偏。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Category, Product, Order, OrderItem, OrderStatusLog, User, Cart]),
    CategoryModule,
    OrderModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminCategoryService,
    AdminProductService,
    AdminOrderService,
    AdminUserService,
    AdminStatisticsService,
  ],
})
export class AdminModule {}
