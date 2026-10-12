import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { OrderStatus } from '../../../common/constants/enums';

/** 直接下单时的单行商品 */
export class OrderItemInputDto {
  @Type(() => Number)
  @IsInt({ message: 'productId 必须是整数' })
  @Min(1, { message: 'productId 必须大于 0' })
  productId: number;

  @Type(() => Number)
  @IsInt({ message: 'quantity 必须是整数' })
  @Min(1, { message: '数量至少为 1' })
  @Max(99, { message: '单个商品最多 99 件' })
  quantity: number;
}

/**
 * 下单 / 预览的公共入参
 *
 * 两种下单方式二选一：
 *   - items  ：直接下单（商品详情页「立即购买」）
 *   - cartIds：从购物车勾选项下单
 * 两个都不传由 Service 抛 10001。
 */
export class OrderSourceDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items?: OrderItemInputDto[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  cartIds?: number[];
}

/** 下单预览：只算价不落库 */
export class PreviewOrderDto extends OrderSourceDto {}

/** 创建订单 */
export class CreateOrderDto extends OrderSourceDto {
  @IsString()
  @IsNotEmpty({ message: '宿舍门牌号不能为空' })
  @MaxLength(32, { message: '门牌号最长 32 个字符' })
  roomNo: string;

  @IsString()
  @IsNotEmpty({ message: '收件人不能为空' })
  @MaxLength(32, { message: '收件人最长 32 个字符' })
  contactName: string;

  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '联系电话格式不正确' })
  contactPhone: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '备注最长 255 个字符' })
  remark?: string;
}

/** 我的订单列表 */
export class OrderQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(Object.values(OrderStatus), { message: 'status 取值不合法' })
  status?: OrderStatus;
}

/** 取消订单 */
export class CancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '取消原因最长 255 个字符' })
  reason?: string;
}
