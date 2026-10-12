import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../entities';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code';
import { CommonStatus, UserRole } from '../../common/constants/enums';
import { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtConfig } from '../../config/configuration';
import { toUserVo, UserVo } from '../user/user.vo';

/** 登录 / 切换身份统一返回结构 */
export interface LoginVo {
  accessToken: string;
  refreshToken: string;
  user: UserVo;
}

interface WxSessionResult {
  openid?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** MVP 用进程内 Map 存验证码，重启即失效；二期换 Redis */
  private readonly smsStore = new Map<string, { code: string; expireAt: number }>();

  private static readonly SMS_TTL_SECONDS = 300;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------
  // 微信静默登录
  // ---------------------------------------------------------------
  async wxLogin(code: string): Promise<LoginVo> {
    const { openid, unionid } = await this.code2Session(code);

    let user = await this.userRepo.findOne({ where: { openid } });
    if (!user) {
      // 首次登录自动注册，默认身份为顾客
      user = this.userRepo.create({
        openid,
        unionid: unionid ?? null,
        nickname: `舍友${openid.slice(-4)}`,
        roles: [UserRole.CUSTOMER],
        currentRole: UserRole.CUSTOMER,
        status: CommonStatus.ENABLED,
      });
      this.logger.log(`新用户注册: openid=***${openid.slice(-4)}`);
    }

    this.assertUsable(user);
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    return this.issueTokens(user);
  }

  /** 调用微信 code2Session；本地开发走 mock */
  private async code2Session(code: string): Promise<{ openid: string; unionid?: string }> {
    const mock = this.config.get<boolean>('wx.mockLogin');
    const appid = this.config.get<string>('wx.appid');
    const secret = this.config.get<string>('wx.secret');

    if (mock || !appid || !secret) {
      this.logger.warn('WX_MOCK_LOGIN 生效，登录使用 mock openid（仅供本地联调）');
      return { openid: `mock_${code}` };
    }

    const url =
      'https://api.weixin.qq.com/sns/jscode2session' +
      `?appid=${encodeURIComponent(appid)}` +
      `&secret=${encodeURIComponent(secret)}` +
      `&js_code=${encodeURIComponent(code)}` +
      '&grant_type=authorization_code';

    const res = await fetch(url);
    const data = (await res.json()) as WxSessionResult;

    if (!data.openid) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        `微信登录失败：${data.errmsg ?? '未知错误'}`,
      );
    }
    return { openid: data.openid, unionid: data.unionid };
  }

  // ---------------------------------------------------------------
  // 手机号验证码登录
  // ---------------------------------------------------------------
  async sendSmsCode(phone: string): Promise<{ expireIn: number; mockCode?: string }> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.smsStore.set(phone, {
      code,
      expireAt: Date.now() + AuthService.SMS_TTL_SECONDS * 1000,
    });

    this.logger.log(`发送验证码 -> ${this.maskPhone(phone)}`);

    const isDev = this.config.get<string>('nodeEnv') !== 'production';
    // 开发环境把验证码回传，方便没有短信通道时自测；生产环境绝不返回
    return { expireIn: AuthService.SMS_TTL_SECONDS, ...(isDev ? { mockCode: code } : {}) };
  }

  async phoneLogin(phone: string, smsCode: string): Promise<LoginVo> {
    const record = this.smsStore.get(phone);
    if (!record || record.expireAt < Date.now() || record.code !== smsCode) {
      throw new BusinessException(ErrorCode.PARAM_INVALID, '验证码错误或已过期');
    }
    this.smsStore.delete(phone);

    let user = await this.userRepo.findOne({ where: { phone } });
    if (!user) {
      user = this.userRepo.create({
        phone,
        nickname: `舍友${phone.slice(-4)}`,
        roles: [UserRole.CUSTOMER],
        currentRole: UserRole.CUSTOMER,
        status: CommonStatus.ENABLED,
      });
    }

    this.assertUsable(user);
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    return this.issueTokens(user);
  }

  // ---------------------------------------------------------------
  // 身份切换（BOSS 直聘式：一个账号多身份）
  // ---------------------------------------------------------------
  async switchRole(userId: number, role: UserRole): Promise<LoginVo> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BusinessException(ErrorCode.USER_NOT_FOUND);
    this.assertUsable(user);

    if (!(user.roles ?? []).includes(role)) {
      throw new BusinessException(
        ErrorCode.ROLE_NOT_GRANTED,
        `当前账号未开通「${this.roleLabel(role)}」身份`,
      );
    }

    if (user.currentRole !== role) {
      user.currentRole = role;
      await this.userRepo.save(user);
    }

    // 身份变了必须换发 token，否则守卫读到的还是旧身份
    return this.issueTokens(user);
  }

  // ---------------------------------------------------------------
  // 刷新 / 退出 / 资料
  // ---------------------------------------------------------------
  async refresh(refreshToken: string): Promise<LoginVo> {
    const jwt = this.config.get<JwtConfig>('jwt')!;

    let payload: { userId: number };
    try {
      payload = await this.jwtService.verifyAsync<{ userId: number }>(refreshToken, {
        secret: jwt.refreshSecret,
      });
    } catch {
      throw new BusinessException(ErrorCode.TOKEN_EXPIRED, undefined, HttpStatus.UNAUTHORIZED);
    }

    const user = await this.userRepo.findOne({ where: { id: payload.userId } });
    if (!user) {
      throw new BusinessException(ErrorCode.USER_NOT_FOUND, undefined, HttpStatus.UNAUTHORIZED);
    }
    this.assertUsable(user, HttpStatus.UNAUTHORIZED);

    return this.issueTokens(user);
  }

  /** JWT 无状态，登出由前端清 token 完成；二期加 Redis 黑名单做服务端失效 */
  async logout(_userId: number): Promise<{ success: boolean }> {
    return { success: true };
  }

  async getProfile(userId: number): Promise<UserVo> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BusinessException(ErrorCode.USER_NOT_FOUND);
    return toUserVo(user);
  }

  // ---------------------------------------------------------------
  // 内部工具
  // ---------------------------------------------------------------
  private async issueTokens(user: User): Promise<LoginVo> {
    const jwt = this.config.get<JwtConfig>('jwt')!;

    const payload: JwtUserPayload = {
      userId: user.id,
      currentRole: user.currentRole,
      roles: user.roles ?? [],
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwt.accessSecret,
        // @nestjs/jwt 的 expiresIn 类型定义比 string 更窄，这里显式放开
        expiresIn: jwt.accessExpiresIn as never,
      }),
      this.jwtService.signAsync(
        { userId: user.id },
        { secret: jwt.refreshSecret, expiresIn: jwt.refreshExpiresIn as never },
      ),
    ]);

    return { accessToken, refreshToken, user: toUserVo(user) };
  }

  private assertUsable(user: User, httpStatus: HttpStatus = HttpStatus.OK): void {
    if (user.status !== CommonStatus.ENABLED) {
      throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, undefined, httpStatus);
    }
  }

  private roleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
      [UserRole.CUSTOMER]: '顾客',
      [UserRole.ADMIN]: '店长',
    };
    return labels[role] ?? role;
  }

  private maskPhone(phone: string): string {
    return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
  }
}
