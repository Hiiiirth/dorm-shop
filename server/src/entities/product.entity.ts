import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { bigintTransformer } from '../common/transformers/bigint.transformer';
import { CommonStatus } from '../common/constants/enums';

/** 商品 */
@Entity('product')
@Index('idx_category_status', ['categoryId', 'status', 'sortOrder'])
export class Product extends BaseEntity {
  @Column({ name: 'category_id', type: 'bigint', unsigned: true, transformer: bigintTransformer })
  categoryId: number;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'varchar', length: 128, default: '' })
  subtitle: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * 封面图
   *
   * v1.3 起与 user.avatar 同策略：店长上传的图经客户端压缩后
   * 以 base64 data URL 直接落库，字段升 **mediumtext**。
   *
   * ⚠️ 这里**没有** `default: ''` —— MySQL 不允许 TEXT 系列列有默认值。
   *    「没配图」用 NULL 表达，前端 `ProductImage` 的
   *    `v-if="src && !failed"` 对 null/'' 都会退回字标占位，行为不变。
   */
  @Column({ name: 'cover_image', type: 'mediumtext', nullable: true })
  coverImage: string | null;

  @Column({ type: 'json', nullable: true })
  images: string[] | null;

  /** ⚠️ TypeORM 的 decimal 读出来是 string，接口层要转成「分」整数 */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: string;

  @Column({
    name: 'original_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  originalPrice: string | null;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'varchar', length: 16, default: '件' })
  unit: string;

  @Column({ name: 'sales_count', type: 'int', default: 0 })
  salesCount: number;

  /** 1 上架 0 下架 */
  @Column({ type: 'tinyint', default: CommonStatus.ENABLED })
  status: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
