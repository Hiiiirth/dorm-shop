import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * 分页入参（所有列表接口继承它）
 * 约定：page 从 1 开始，pageSize 上限 50
 */
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须是整数' })
  @Min(1, { message: 'page 最小为 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须是整数' })
  @Min(1, { message: 'pageSize 最小为 1' })
  @Max(50, { message: 'pageSize 最大为 50' })
  pageSize: number = 10;

  /** TypeORM skip */
  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }

  /** TypeORM take */
  get take(): number {
    return this.pageSize;
  }
}
