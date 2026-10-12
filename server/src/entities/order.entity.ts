import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { bigintTransformer } from '../common/transformers/bigint.transformer';
import { OrderStatus, PayStatus, PayType } from '../common/constants/enums';

/**
 * 订单主表
 *
 * status 流转见 ORDER_STATUS_TRANSITIONS；
 * status 是普通 varchar 而非 enum，改状态只需改代码不需要 DDL。
 */
@Entity('order')
@Index('idx_user_time', ['userId', 'createdAt'])
@Index('idx_status_time', ['status', 'createdAt'])
export class Order extends BaseEntity {
  /** 业务订单号，对外唯一标识 */
  @Column({ name: 'order_no', type: 'varchar', length: 32, unique: true })
  orderNo: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, transformer: bigintTransformer })
  userId: number;

  @Column({ type: 'varchar', length: 24, default: OrderStatus.PENDING })
  status: OrderStatus;

  /** ⚠️ decimal 读出来是 string，接口层转「分」整数 */
  @Column({ name: 'total_amount', type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalAmount: string;

  @Column({ name: 'item_count', type: 'int', default: 0 })
  itemCount: number;

  @Column({ name: 'room_no', type: 'varchar', length: 32, default: '' })
  roomNo: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 32, default: '' })
  contactName: string;

  @Column({ name: 'contact_phone', type: 'varchar', length: 20, default: '' })
  contactPhone: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  remark: string;

  @Column({ name: 'pay_status', type: 'tinyint', default: PayStatus.UNPAID })
  payStatus: number;

  @Column({ name: 'pay_type', type: 'tinyint', default: PayType.UNSET })
  payType: number;

  @Column({ name: 'delivered_at', type: 'datetime', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancel_reason', type: 'varchar', length: 255, nullable: true })
  cancelReason: string | null;
}
