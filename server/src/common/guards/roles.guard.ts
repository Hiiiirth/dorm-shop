import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../constants/enums';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCode } from '../constants/error-code';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtUserPayload } from '../decorators/current-user.decorator';

/**
 * 身份守卫（在 AppModule 注册为 APP_GUARD）
 *
 * 校验 token 里的 currentRole。用户切换身份后需重新签发 token，
 * 因此这里读到的永远是「当前生效身份」，与小程序端展示的工作台一致。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: JwtUserPayload | undefined = request.user;

    if (!user || !required.includes(user.currentRole)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, undefined, HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
