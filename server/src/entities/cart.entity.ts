import { Column, CreateDateColumn, Entity, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../common/transformers/bigint.transformer';

/**
 * 购物车
 *
 * ⚠️ 本表没有 deleted_at，所以不能继承 BaseEntity
 *    （继承后会带上 @DeleteDateColumn，TypeORM 会自动给所有查询加 `deleted_at IS NULL`，直接报错）。
 */
@Entity('cart')
export class Cart {
  @Column({
    type: 'bigint',
    unsigned: true,
    primary: true,
    generated: 'increment',
    transformer: bigintTransformer,
  })
  id: number;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, transformer: bigintTransformer })
  userId: number;

  @Column({ name: 'product_id', type: 'bigint', unsigned: true, transformer: bigintTransformer })
  productId: number;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  /** 1 勾选 */
  @Column({ type: 'tinyint', default: 1 })
  selected: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
