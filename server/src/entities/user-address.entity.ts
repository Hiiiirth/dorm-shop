import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { bigintTransformer } from '../common/transformers/bigint.transformer';

/** 收货地址（单宿舍楼，只存门牌号） */
@Entity('user_address')
@Index('idx_user_default', ['userId', 'isDefault'])
export class UserAddress extends BaseEntity {
  @Column({ name: 'user_id', type: 'bigint', unsigned: true, transformer: bigintTransformer })
  userId: number;

  @Column({ name: 'contact_name', type: 'varchar', length: 32, default: '' })
  contactName: string;

  @Column({ name: 'contact_phone', type: 'varchar', length: 20, default: '' })
  contactPhone: string;

  @Column({ name: 'room_no', type: 'varchar', length: 32 })
  roomNo: string;

  @Column({ name: 'is_default', type: 'tinyint', default: 0 })
  isDefault: number;
}
