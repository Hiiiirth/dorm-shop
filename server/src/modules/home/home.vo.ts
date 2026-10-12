import { CategoryVo } from '../category/category.vo';
import { ProductListVo } from '../product/product.vo';

/** 首页聚合响应：一次请求拿到首屏需要的全部数据 */
export interface HomeVo {
  categories: CategoryVo[];
  hotProducts: ProductListVo[];
  newProducts: ProductListVo[];
}
