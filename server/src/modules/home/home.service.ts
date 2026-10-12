import { Injectable } from '@nestjs/common';
import { CategoryService } from '../category/category.service';
import { ProductService } from '../product/product.service';
import { HomeVo } from './home.vo';

/** 首页热销 / 新品各取多少个 */
const HOME_PRODUCT_LIMIT = 6;

@Injectable()
export class HomeService {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly productService: ProductService,
  ) {}

  /**
   * 首页聚合。
   *
   * 三个查询互不依赖，用 Promise.all 并发，别串行 await 三次。
   */
  async overview(): Promise<HomeVo> {
    const [categories, hotProducts, newProducts] = await Promise.all([
      this.categoryService.tree(),
      this.productService.hot(HOME_PRODUCT_LIMIT),
      this.productService.latest(HOME_PRODUCT_LIMIT),
    ]);

    return { categories, hotProducts, newProducts };
  }
}
