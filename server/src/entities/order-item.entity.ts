import { Column, Entity, Index } from 'typeorm';
import { SimpleLogEntity } from './base.entity';
import { bigintTransformer } from '../common/transformers/bigint.transformer';

/**
 * 订单明细
 *
 * product_name / product_cover / unit_price 是**下单时的快照**，
 * 商家后续改名改价不会影响历史订单。
 */
@Entity('order_item')
@Index('idx_order', ['orderId'])
@Index('idx_product', ['productId'])
export class OrderItem extends SimpleLogEntity {
  @Column({ name: 'order_id', type: 'bigint', unsigned: true, transformer: bigintTransformer })
  orderId: number;

  @Column({ name: 'product_id', type: 'bigint', unsigned: true, transformer: bigintTransformer })
  productId: number;

  @Column({ name: 'product_name', type: 'varchar', length: 64 })
  productName: string;

  /**
   * 商品封面快照
   *
   * ⚠️ v1.3 必须跟着 product.cover_image 一起升到 mediumtext ——
   * 这一列是**下单时从商品表复制过来的快照**，如果还是 varchar(255)，
   * 带图商品一下单就会在这里被截断/报错（1406 Data too long），
   * 而且失败发生在**事务中间**，表现成「下单接口莫名 500」。
   */
  @Column({ name: 'product_cover', type: 'mediumtext', nullable: true })
  productCover: string | null;

  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2 })
  unitPrice: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: string;
}
