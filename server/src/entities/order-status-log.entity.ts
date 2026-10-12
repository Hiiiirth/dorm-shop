import { Column, Entity, Index } from 'typeorm';
import { SimpleLogEntity } from './base.entity';
import { bigintTransformer } from '../common/transformers/bigint.transformer';
import { OrderStatus, UserRole } from '../common/constants/enums';

/**
 * 订单状态流转日志
 * 每一次状态变更都写一条，用于追溯「谁、在什么时候、把订单从什么状态改成了什么状态」。
 */
@Entity('order_status_log')
@Index('idx_order_time', ['orderId', 'createdAt'])
export class OrderStatusLog extends SimpleLogEntity {
  @Column({ name: 'order_id', type: 'bigint', unsigned: true, transformer: bigintTransformer })
  orderId: number;

  /** 首条记录 from_status 为空字符串 */
  @Column({ name: 'from_status', type: 'varchar', length: 24, default: '' })
  fromStatus: OrderStatus | '';

  @Column({ name: 'to_status', type: 'varchar', length: 24 })
  toStatus: OrderStatus;

  /** 系统自动流转时为空 */
  @Column({
    name: 'operator_id',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    transformer: bigintTransformer,
  })
  operatorId: number | null;

  @Column({ name: 'operator_role', type: 'varchar', length: 16, nullable: true })
  operatorRole: UserRole | null;

  @Column({ type: 'varchar', length: 255, default: '' })
  remark: string;
}
