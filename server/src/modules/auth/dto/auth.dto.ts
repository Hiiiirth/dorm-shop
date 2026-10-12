import { IsEnum, IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { UserRole } from '../../../common/constants/enums';

/** 微信静默登录 */
export class WxLoginDto {
  @IsString({ message: 'code 必须是字符串' })
  @IsNotEmpty({ message: 'code 不能为空' })
  code: string;
}

/** 发送短信验证码 */
export class SendSmsDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone: string;
}

/** 手机号 + 验证码登录 */
export class PhoneLoginDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone: string;

  @IsString()
  @Length(6, 6, { message: '验证码为 6 位数字' })
  smsCode: string;
}

/** 切换当前身份 */
export class SwitchRoleDto {
  @IsEnum(UserRole, { message: 'role 取值必须是 CUSTOMER / ADMIN' })
  role: UserRole;
}

/** 刷新 accessToken */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'refreshToken 不能为空' })
  refreshToken: string;
}
