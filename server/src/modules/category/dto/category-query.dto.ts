import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class CategoryQueryDto {
  /**
   * 传了返回该父分类下的直接子分类；
   * 不传则返回完整的分类树。
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'parentId 必须是整数' })
  @Min(0, { message: 'parentId 不能为负数' })
  parentId?: number;
}
