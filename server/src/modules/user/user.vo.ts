import { User } from '../../entities';
import { UserRole } from '../../common/constants/enums';

/**
 * 对外暴露的用户结构 —— 绝不包含 passwordHash / openid 等敏感字段
 */
export interface UserVo {
  id: number;
  nickname: string;
  /** v1.3 起是 base64 data URL；没设头像时是空串（DB 里存 NULL） */
  avatar: string;
  phone: string | null;
  gender: number;
  roles: UserRole[];
  currentRole: UserRole;
  defaultRoom: string;
  status: number;
  createdAt: Date;
}

export function toUserVo(user: User): UserVo {
  return {
    id: user.id,
    nickname: user.nickname,
    // DB 列 nullable → 对外统一空串，前端只判 falsy（不用区分 null 和 ''）
    avatar: user.avatar ?? '',
    phone: user.phone,
    gender: user.gender,
    roles: user.roles ?? [],
    currentRole: user.currentRole,
    defaultRoom: user.defaultRoom,
    status: user.status,
    createdAt: user.createdAt,
  };
}
