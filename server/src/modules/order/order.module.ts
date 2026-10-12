import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Cart, Order, OrderItem, OrderStatusLog, Product } from '../../entities';
import { OrderController } from './order.controller';
import { OrderNoService } from './order-no.service';
import { OrderService } from './order.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Product, Cart])],
  controllers: [OrderController],
  providers: [OrderService, OrderNoService],
  exports: [OrderService, OrderNoService],
})
export class OrderModule {}
