import { Product } from '../../entities';
import { yuanToFen } from '../../common/utils/money';

/** 列表项：只带列表需要的字段，别把 description 这种大字段拖下来 */
export interface ProductListVo {
  id: number;
  categoryId: number;
  name: string;
  subtitle: string;
  /** v1.3 起可能是 base64 data URL，也可能为空串（没配图 → 前端走字标占位） */
  coverImage: string;
  /** 单位：分 */
  price: number;
  /** 单位：分，无划线价时为 null */
  originalPrice: number | null;
  unit: string;
  stock: number;
  salesCount: number;
  /** 1 上架 0 下架 */
  status: number;
}

/** 详情：在列表项基础上补大字段 */
export interface ProductDetailVo extends ProductListVo {
  description: string | null;
  images: string[] | null;
}

export function toProductListVo(product: Product): ProductListVo {
  return {
    id: product.id,
    categoryId: product.categoryId,
    name: product.name,
    subtitle: product.subtitle,
    // DB 列现在是 nullable 的 mediumtext → 统一成空串，前端只需判 falsy
    coverImage: product.coverImage ?? '',
    price: yuanToFen(product.price),
    originalPrice:
      product.originalPrice === null || product.originalPrice === undefined
        ? null
        : yuanToFen(product.originalPrice),
    unit: product.unit,
    stock: product.stock,
    salesCount: product.salesCount,
    status: product.status,
  };
}

export function toProductDetailVo(product: Product): ProductDetailVo {
  return {
    ...toProductListVo(product),
    description: product.description ?? null,
    images: product.images ?? null,
  };
}
