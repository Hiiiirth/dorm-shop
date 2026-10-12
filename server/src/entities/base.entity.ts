import { Column, CreateDateColumn, DeleteDateColumn, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../common/transformers/bigint.transformer';

/**
 * 带软删除的基础实体
 *
 * ⚠️ 只要有 @DeleteDateColumn，TypeORM 的 find 系列会自动追加 `deleted_at IS NULL`。
 *    所以没有 deleted_at 列的表（如 cart）绝不能继承本类。
 */
export abstract class BaseEntity {
  @Column({
    type: 'bigint',
    unsigned: true,
    primary: true,
    generated: 'increment',
    transformer: bigintTransformer,
  })
  id: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt: Date | null;
}

/** 只追加不修改的日志类实体：只有 id 和 created_at */
export abstract class SimpleLogEntity {
  @Column({
    type: 'bigint',
    unsigned: true,
    primary: true,
    generated: 'increment',
    transformer: bigintTransformer,
  })
  id: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
