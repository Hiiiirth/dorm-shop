export * from './base.entity';
export * from './user.entity';
export * from './user-address.entity';
export * from './category.entity';
export * from './product.entity';
export * from './order.entity';
export * from './order-item.entity';
export * from './order-status-log.entity';
export * from './cart.entity';

import { User } from './user.entity';
import { UserAddress } from './user-address.entity';
import { Category } from './category.entity';
import { Product } from './product.entity';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderStatusLog } from './order-status-log.entity';
import { Cart } from './cart.entity';

/** 交给 TypeORM 一次性注册 */
export const ALL_ENTITIES = [
  User,
  UserAddress,
  Category,
  Product,
  Order,
  OrderItem,
  OrderStatusLog,
  Cart,
];