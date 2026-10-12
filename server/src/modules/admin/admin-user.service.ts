import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../entities';
import { CommonStatus, UserRole } from '../../common/constants/enums';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code';
import { PageResult } from '../../common/response/page-result';
import { toUserVo, UserVo } from '../user/user.vo';
import { AdminUserQueryDto, UpdateUserRoleDto, UpdateUserStatusDto } from './dto/admin.dto';

@Injectable()
export class AdminUserService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async list(query: AdminUserQueryDto): Promise<PageResult<UserVo>> {
    const qb = this.userRepo.createQueryBuilder('u');

    if (query.keyword) {
      qb.andWhere('(u.nickname LIKE :kw OR u.phone LIKE :kw OR u.username LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }
    if (query.status !== undefined) {
      qb.andWhere('u.status = :status', { status: query.status });
    }
    if (query.role) {
      qb.andWhere('JSON_CONTAINS(u.roles, :role)', { role: `"${query.role}"` });
    }

    const [rows, total] = await qb
      .orderBy('u.id', 'DESC')
      .skip(query.skip)
      .take(query.take)
      .getManyAndCount();

    return PageResult.of(rows.map(toUserVo), total, query.page, query.pageSize);
  }

  async detail(id: number): Promise<UserVo> {
    return toUserVo(await this.mustFind(id));
  }

  /**
   * 授予 / 撤销身份
   *
   * 两条硬约束：
   *   1. 不能撤销自己的 ADMIN —— 否则管理员点一下就再也进不来了
   *   2. 撤销的身份正好是 current_role 时，当前身份要落回 CUSTOMER，
   *      不然用户会卡在一个自己没有的工作台里（`switch-role` 也救不了，
   *      因为它要求目标身份在 roles 里）
   */
  async updateRole(id: number, dto: UpdateUserRoleDto, operatorId: number): Promise<UserVo> {
    const user = await this.mustFind(id);
    const roles = new Set(user.roles ?? []);

    if (dto.action === 'GRANT') {
      roles.add(dto.role);
    } else {
      if (id === operatorId && dto.role === UserRole.ADMIN) {
        throw new BusinessException(
          ErrorCode.ROLE_PROTECTED,
          '不能撤销自己的管理员身份，否则你就进不了管理端了',
        );
      }
      if (!roles.has(dto.role)) {
        throw new BusinessException(
          ErrorCode.PARAM_INVALID,
          `该用户本来就没有「${dto.role}」身份，不用撤销`,
        );
      }
      roles.delete(dto.role);

      // 还没有任何身份时兜一个 CUSTOMER，避免出现「零身份」用户
      if (roles.size === 0) roles.add(UserRole.CUSTOMER);
    }

    user.roles = [...roles];
    if (!user.roles.includes(user.currentRole)) {
      user.currentRole = UserRole.CUSTOMER;
    }

    const saved = await this.userRepo.save(user);
    return toUserVo(saved);
  }

  /** 启用 / 禁用账号 */
  async updateStatus(id: number, dto: UpdateUserStatusDto, operatorId: number): Promise<UserVo> {
    if (id === operatorId && dto.status === CommonStatus.DISABLED) {
      throw new BusinessException(ErrorCode.ROLE_PROTECTED, '不能禁用自己');
    }

    const user = await this.mustFind(id);
    user.status = dto.status;
    return toUserVo(await this.userRepo.save(user));
  }

  private async mustFind(id: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new BusinessException(ErrorCode.USER_NOT_FOUND);
    return user;
  }
}
