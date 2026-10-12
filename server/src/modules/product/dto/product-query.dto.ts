import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export type ProductSortBy = 'default' | 'sales' | 'price_asc' | 'price_desc' | 'newest';

export const PRODUCT_SORT_OPTIONS: ProductSortBy[] = [
  'default',
  'sales',
  'price_asc',
  'price_desc',
  'newest',
];

export class ProductQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'categoryId 必须是整数' })
  @Min(1, { message: 'categoryId 必须大于 0' })
  categoryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '关键词最长 32 个字符' })
  keyword?: string;

  /**
   * default   综合（sortOrder 升序，同序按 id 倒序）
   * sales     销量优先
   * price_asc 价格升序
   * price_desc价格降序
   * newest    最新上架
   */
  @IsOptional()
  @IsIn(PRODUCT_SORT_OPTIONS, { message: 'sortBy 取值不合法' })
  sortBy: ProductSortBy = 'default';
}
