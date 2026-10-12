import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtConfig } from '../../config/configuration';

/**
 * AccessToken 校验策略
 * 校验通过后返回值会挂到 req.user，供 @CurrentUser() 与 RolesGuard 使用。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const jwt = config.get<JwtConfig>('jwt')!;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwt.accessSecret,
    });
  }

  validate(payload: JwtUserPayload): JwtUserPayload {
    return {
      userId: payload.userId,
      currentRole: payload.currentRole,
      roles: payload.roles ?? [],
    };
  }
}
