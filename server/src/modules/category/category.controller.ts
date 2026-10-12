import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CategoryQueryDto } from './dto/category-query.dto';
import { CategoryService } from './category.service';
import { CategoryVo } from './category.vo';

@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /**
   * GET /api/v1/categories           -> 分类树
   * GET /api/v1/categories?parentId=1 -> 1 号分类的子分类
   */
  @Public()
  @Get()
  list(@Query() query: CategoryQueryDto): Promise<CategoryVo[]> {
    return query.parentId === undefined
      ? this.categoryService.tree()
      : this.categoryService.listByParent(query.parentId);
  }
}
