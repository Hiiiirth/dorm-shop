import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Order } from '../../entities';

/**
 * 订单号生成
 *
 * 格式：SO + yyyyMMddHHmmss + 4 位随机数，例如 SO202610072214001234
 *   SO  —— 固定前缀，一眼能看出是订单
 *   日期 —— 方便按天排查问题、也便于分期
 *   随机 —— 避免同一秒内的并发重复
 *
 * 生成后仍会查一次库确认唯一；极端冲突则重试，最多 5 次。
 */
@Injectable()
export class OrderNoService {
  private static readonly MAX_RETRY = 5;

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

  async generate(manager?: EntityManager): Promise<string> {
    const orderRepo = manager ? manager.getRepository(Order) : this.orderRepo;

    for (let attempt = 0; attempt < OrderNoService.MAX_RETRY; attempt += 1) {
      const candidate = this.buildCandidate();
      const used = await orderRepo.count({ where: { orderNo: candidate } });
      if (used === 0) return candidate;
    }

    // 连续 5 次撞号，说明随机段太拥挤，退化成毫秒级时间戳兜底
    const fallback = `SO${Date.now()}${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`;
    return fallback;
  }

  private buildCandidate(): string {
    const now = new Date();
    const pad = (value: number, length = 2) => value.toString().padStart(length, '0');

    const stamp =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    const random = pad(Math.floor(Math.random() * 10000), 4);
    return `SO${stamp}${random}`;
  }
}
