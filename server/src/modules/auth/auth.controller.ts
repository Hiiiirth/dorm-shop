import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService, LoginVo } from './auth.service';
import {
  PhoneLoginDto,
  RefreshTokenDto,
  SendSmsDto,
  SwitchRoleDto,
  WxLoginDto,
} from './dto/auth.dto';
import { UserVo } from '../user/user.vo';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 微信静默登录（首次自动注册） */
  @Public()
  @Post('login')
  login(@Body() dto: WxLoginDto): Promise<LoginVo> {
    return this.authService.wxLogin(dto.code);
  }

  /** 发送短信验证码 */
  @Public()
  @Post('sms-code')
  sendSmsCode(@Body() dto: SendSmsDto) {
    return this.authService.sendSmsCode(dto.phone);
  }

  /** 手机号 + 验证码登录 */
  @Public()
  @Post('phone-login')
  phoneLogin(@Body() dto: PhoneLoginDto): Promise<LoginVo> {
    return this.authService.phoneLogin(dto.phone, dto.smsCode);
  }

  /** 刷新 accessToken */
  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto): Promise<LoginVo> {
    return this.authService.refresh(dto.refreshToken);
  }

  /** 切换当前身份，返回新签发的 token */
  @Post('switch-role')
  switchRole(@CurrentUser('userId') userId: number, @Body() dto: SwitchRoleDto): Promise<LoginVo> {
    return this.authService.switchRole(userId, dto.role);
  }

  /** 退出登录 */
  @Post('logout')
  logout(@CurrentUser('userId') userId: number) {
    return this.authService.logout(userId);
  }

  /** 当前用户信息（含 roles / currentRole） */
  @Get('profile')
  profile(@CurrentUser('userId') userId: number): Promise<UserVo> {
    return this.authService.getProfile(userId);
  }
}
