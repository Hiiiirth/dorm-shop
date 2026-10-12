import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Trim } from '../../../common/decorators/trim.decorator';
import { IsImageDataUrl } from '../../../common/validators/image-data-url.validator';
import { OrderStatus, UserRole } from '../../../common/constants/enums';

/** 启用/停用的合法取值（布尔型 query 参数在 query string 里是字符串，"false" 会被转成 true，所以直接用 0/1） */
const STATUS_VALUES = [0, 1];

// ===============================================================
// 分类
// ===============================================================
export class CreateCategoryDto {
  /** 0 = 一级分类 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'parentId 必须是整数' })
  @Min(0, { message: 'parentId 不能为负' })
  parentId?: number;

  @Trim()
  @IsString()
  @IsNotEmpty({ message: '分类名不能为空' })
  @MaxLength(32, { message: '分类名最长 32 个字符' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  icon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sortOrder 必须是整数' })
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn(STATUS_VALUES, { message: 'status 只能是 0 或 1' })
  status?: number;
}

export class UpdateCategoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'parentId 必须是整数' })
  @Min(0, { message: 'parentId 不能为负' })
  parentId?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: '分类名不能为空' })
  @MaxLength(32, { message: '分类名最长 32 个字符' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  icon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sortOrder 必须是整数' })
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn(STATUS_VALUES, { message: 'status 只能是 0 或 1' })
  status?: number;
}

// ===============================================================
// 商品
// ===============================================================
export class CreateProductDto {
  @Type(() => Number)
  @IsInt({ message: 'categoryId 必须是整数' })
  @Min(1, { message: 'categoryId 必须大于 0' })
  categoryId: number;

  @Trim()
  @IsString()
  @IsNotEmpty({ message: '商品名不能为空' })
  @MaxLength(64, { message: '商品名最长 64 个字符' })
  name: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(128, { message: '副标题最长 128 个字符' })
  subtitle?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsImageDataUrl()
  coverImage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  /** ⚠️ 单位是「分」。1 元传 100 */
  @Type(() => Number)
  @IsInt({ message: 'price 必须是整数（单位：分）' })
  @Min(0, { message: 'price 不能为负' })
  price: number;

  /** 划线原价，单位「分」，不填为 null */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'originalPrice 必须是整数（单位：分）' })
  @Min(0, { message: 'originalPrice 不能为负' })
  originalPrice?: number;

  @Type(() => Number)
  @IsInt({ message: 'stock 必须是整数' })
  @Min(0, { message: 'stock 不能为负' })
  stock: number;

  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '单位最长 16 个字符' })
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn(STATUS_VALUES, { message: 'status 只能是 0 或 1（1 上架 0 下架）' })
  status?: number;
}

export class UpdateProductDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'categoryId 必须是整数' })
  @Min(1, { message: 'categoryId 必须大于 0' })
  categoryId?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: '商品名不能为空' })
  @MaxLength(64, { message: '商品名最长 64 个字符' })
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(128)
  subtitle?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsImageDataUrl()
  coverImage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'price 必须是整数（单位：分）' })
  @Min(0, { message: 'price 不能为负' })
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'originalPrice 必须是整数（单位：分）' })
  @Min(0, { message: 'originalPrice 不能为负' })
  originalPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'stock 必须是整数' })
  @Min(0, { message: 'stock 不能为负' })
  stock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn(STATUS_VALUES, { message: 'status 只能是 0 或 1（1 上架 0 下架）' })
  status?: number;
}

export class AdminProductQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'categoryId 必须是整数' })
  categoryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn(STATUS_VALUES, { message: 'status 只能是 0 或 1' })
  status?: number;

  @IsOptional()
  @IsIn(['default', 'newest', 'price_asc', 'price_desc', 'sales', 'stock_asc'], {
    message: 'sortBy 取值不合法',
  })
  sortBy?: string;
}

// ===============================================================
// 订单
// ===============================================================
export class AdminOrderQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(Object.values(OrderStatus), { message: 'status 取值不合法' })
  status?: OrderStatus;

  /** 模糊匹配：订单号 / 门牌号 / 收件人 / 联系电话 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  /** 下单时间起（含），格式 YYYY-MM-DD */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom 格式应为 YYYY-MM-DD' })
  dateFrom?: string;

  /** 下单时间止（含当天），格式 YYYY-MM-DD */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo 格式应为 YYYY-MM-DD' })
  dateTo?: string;
}

/** 管理员强制取消 */
export class AdminCancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '取消原因最长 255 个字符' })
  reason?: string;
}

// ===============================================================
// 用户
// ===============================================================
export class AdminUserQueryDto extends PaginationDto {
  /** 模糊匹配：昵称 / 手机号 / 用户名 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @IsOptional()
  @IsIn(Object.values(UserRole), { message: 'role 取值不合法' })
  role?: UserRole;

  @IsOptional()
  @Type(() => Number)
  @IsIn(STATUS_VALUES, { message: 'status 只能是 0 或 1' })
  status?: number;
}

export class UpdateUserRoleDto {
  @IsIn(Object.values(UserRole), { message: 'role 取值不合法' })
  role: UserRole;

  @IsIn(['GRANT', 'REVOKE'], { message: 'action 只能是 GRANT 或 REVOKE' })
  action: 'GRANT' | 'REVOKE';
}

export class UpdateUserStatusDto {
  @Type(() => Number)
  @IsIn(STATUS_VALUES, { message: 'status 只能是 0 或 1（1 正常 0 禁用）' })
  status: number;
}
