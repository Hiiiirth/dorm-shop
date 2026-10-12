import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../constants/enums';

/** JWT 里携带的登录态载荷 */
export interface JwtUserPayload {
  userId: number;
  /** 签发 token 时的当前身份 */
  currentRole: UserRole;
  /** 该账号拥有的全部身份 */
  roles: UserRole[];
}

/**
 * 取当前登录用户
 * @example
 *   findMine(@CurrentUser() user: JwtUserPayload)
 *   findMine(@CurrentUser('userId') userId: number)
 */
export const CurrentUser = createParamDecorator(
  (field: keyof JwtUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: JwtUserPayload | undefined = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
