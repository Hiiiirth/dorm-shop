import { ValueTransformer } from 'typeorm';

/**
 * MySQL 的 BIGINT 经 mysql2 驱动读出来是 string，
 * 用这个转换器统一转成 number，避免 id / userId 在业务里类型飘忽。
 *
 * 注意：JS 安全整数上限 2^53-1，ID 到这个量级前不会有问题。
 */
export const bigintTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value === null || value === undefined ? value : Number(value),
};
