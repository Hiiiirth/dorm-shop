import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';
import { bigintTransformer } from '../common/transformers/bigint.transformer';
import { CommonStatus } from '../common/constants/enums';

/** 商品分类，parent_id = 0 表示一级分类 */
@Entity('category')
export class Category extends BaseEntity {
  @Column({
    name: 'parent_id',
    type: 'bigint',
    unsigned: true,
    default: 0,
    transformer: bigintTransformer,
  })
  parentId: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  icon: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'tinyint', default: CommonStatus.ENABLED })
  status: number;
}
