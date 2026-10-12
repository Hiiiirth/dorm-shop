import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** 单个商品最多买 99 件，防止误操作把库存基数打歪 */
export const MAX_CART_QUANTITY = 99;

export class AddCartDto {
  @Type(() => Number)
  @IsInt({ message: 'productId 必须是整数' })
  @Min(1, { message: 'productId 必须大于 0' })
  productId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'quantity 必须是整数' })
  @Min(1, { message: '数量至少为 1' })
  @Max(MAX_CART_QUANTITY, { message: `单品数量最多 ${MAX_CART_QUANTITY} 件` })
  quantity: number = 1;
}

export class UpdateCartDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'quantity 必须是整数' })
  @Min(1, { message: '数量至少为 1' })
  @Max(MAX_CART_QUANTITY, { message: `单品数量最多 ${MAX_CART_QUANTITY} 件` })
  quantity?: number;

  /** 1 勾选 0 取消勾选 */
  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: 'selected 取值 0 或 1' })
  selected?: number;
}
