import { ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCode } from '../constants/error-code';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * 全局登录守卫（在 AppModule 注册为 APP_GUARD）
 * 被 @Public() 标记的接口直接放行。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(err: Error | null, user: TUser, info: unknown): TUser {
    if (info instanceof Error && info.name === 'TokenExpiredError') {
      throw new BusinessException(ErrorCode.TOKEN_EXPIRED, undefined, HttpStatus.UNAUTHORIZED);
    }
    if (err || !user) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, undefined, HttpStatus.UNAUTHORIZED);
    }
    return user;
  }
}
