/**
 * 分类 / 商品 / 首页 接口 —— 对齐后端
 *   src/modules/category/category.controller.ts
 *   src/modules/product/product.controller.ts
 *   src/modules/home/home.controller.ts
 *
 * 三个接口都是 @Public()，未登录也能浏览 —— 这正是「先逛后登录」的电商体验。
 */
import { http } from '../utils/request';

/** 排序方式，与后端 ProductQueryDto 的 ProductSortBy 一一对应 */
export const SORT_OPTIONS = [
  { value: 'default', label: '综合' },
  { value: 'sales', label: '销量' },
  { value: 'price_asc', label: '价格 ↑' },
  { value: 'price_desc', label: '价格 ↓' },
  { value: 'newest', label: '最新' },
];

export const catalogApi = {
  /** GET /home —— 首屏聚合，categories + hotProducts + newProducts 一次拿齐 */
  home: () => http.get('/home', undefined, { silent: true }),

  /** GET /categories —— 完整分类树；带 parentId 则只返回该父分类的直接子分类 */
  categories: (parentId) =>
    http.get('/categories', parentId === undefined ? undefined : { parentId }, { silent: true }),

  /**
   * GET /products
   * @param {{categoryId?:number, keyword?:string, sortBy?:string, page?:number, pageSize?:number}} params
   *
   * ⚠️ 后端的 categoryId 是**精确匹配**，不包含子分类。
   *    也就是说父分类下如果只在子分类挂了商品，用父分类 id 查会是空列表。
   *    分类页因此会在父分类有子分类时，额外渲染一排子分类 chips 让用户自己下钻。
   */
  products: (params = {}) => http.get('/products', params, { silent: true }),

  /** GET /products/:id —— 已下架的商品**不报错**，会带 status=0 返回，前端要显示「已下架」 */
  product: (id) => http.get(`/products/${id}`, undefined, { silent: true }),
};
