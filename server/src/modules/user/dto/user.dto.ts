import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Gender } from '../../../common/constants/enums';
import { IsImageDataUrl } from '../../../common/validators/image-data-url.validator';

/** 更新个人资料 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: '昵称最长 64 个字符' })
  nickname?: string;

  /**
   * 头像：v1.3 起是**客户端压缩后的 base64 data URL**（约 80~160KB），
   * 所以不能再写 @MaxLength(255)。改由自定义校验器管「格式 + 体量」，
   * 传空串 = 清掉头像（保留 `@IsString()` 让空串能过 —— @IsNotEmpty 会拒空串）。
   */
  @IsOptional()
  @IsString()
  @IsImageDataUrl()
  avatar?: string;

  @IsOptional()
  @IsIn([Gender.UNKNOWN, Gender.MALE, Gender.FEMALE], { message: 'gender 取值 0/1/2' })
  gender?: number;

  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '门牌号最长 32 个字符' })
  defaultRoom?: string;
}

/** 新增收货地址 */
export class CreateAddressDto {
  @IsString()
  @IsNotEmpty({ message: '收件人不能为空' })
  @MaxLength(32)
  contactName: string;

  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '联系电话格式不正确' })
  contactPhone: string;

  @IsString()
  @IsNotEmpty({ message: '宿舍门牌号不能为空' })
  @MaxLength(32)
  roomNo: string;

  @IsOptional()
  @IsIn([0, 1], { message: 'isDefault 取值 0/1' })
  isDefault?: number;
}

/** 修改收货地址（字段全可选，不引入 PartialType 以免多装一个包） */
export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '联系电话格式不正确' })
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  roomNo?: string;

  @IsOptional()
  @IsIn([0, 1], { message: 'isDefault 取值 0/1' })
  isDefault?: number;
}
