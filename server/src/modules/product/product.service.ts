import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { Product } from '../../entities';
import { CommonStatus } from '../../common/constants/enums';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code';
import { PageResult } from '../../common/response/page-result';
import { ProductQueryDto, ProductSortBy } from './dto/product-query.dto';
import { ProductDetailVo, ProductListVo, toProductDetailVo, toProductListVo } from './product.vo';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
  ) {}

  /** 商品列表（只返回上架商品，分页） */
  async list(query: ProductQueryDto): Promise<PageResult<ProductListVo>> {
    const qb = this.baseQuery();
    this.applyFilters(qb, query);
    this.applySort(qb, query.sortBy);

    qb.skip(query.skip).take(query.take);

    const [rows, total] = await qb.getManyAndCount();
    return PageResult.of(rows.map(toProductListVo), total, query.page, query.pageSize);
  }

  /**
   * 商品详情
   *
   * 已下架的商品**不报错**，而是把 status=0 一起返回，
   * 让前端能在商详页和购物车里显示「已下架」而不是一片空白。
   * 真正拦截下单的校验放在购物车 / 下单环节（错误码 40002）。
   */
  async detail(id: number): Promise<ProductDetailVo> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throw new BusinessException(ErrorCode.PRODUCT_NOT_FOUND);
    return toProductDetailVo(product);
  }

  /** 热销榜（首页用） */
  async hot(limit: number): Promise<ProductListVo[]> {
    const rows = await this.baseQuery()
      .orderBy('p.salesCount', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .take(limit)
      .getMany();
    return rows.map(toProductListVo);
  }

  /** 最新上架（首页用） */
  async latest(limit: number): Promise<ProductListVo[]> {
    const rows = await this.baseQuery()
      .orderBy('p.createdAt', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .take(limit)
      .getMany();
    return rows.map(toProductListVo);
  }

  // ---------------------------------------------------------------
  // 内部
  // ---------------------------------------------------------------
  private baseQuery(): SelectQueryBuilder<Product> {
    return this.productRepo
      .createQueryBuilder('p')
      .where('p.status = :status', { status: CommonStatus.ENABLED });
  }

  private applyFilters(qb: SelectQueryBuilder<Product>, query: ProductQueryDto): void {
    if (query.categoryId !== undefined) {
      qb.andWhere('p.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (query.keyword) {
      qb.andWhere('(p.name LIKE :kw OR p.subtitle LIKE :kw)', { kw: `%${query.keyword}%` });
    }
  }

  private applySort(qb: SelectQueryBuilder<Product>, sortBy: ProductSortBy): void {
    switch (sortBy) {
      case 'sales':
        qb.orderBy('p.salesCount', 'DESC').addOrderBy('p.id', 'DESC');
        break;
      case 'price_asc':
        qb.orderBy('p.price', 'ASC').addOrderBy('p.id', 'DESC');
        break;
      case 'price_desc':
        qb.orderBy('p.price', 'DESC').addOrderBy('p.id', 'DESC');
        break;
      case 'newest':
        qb.orderBy('p.createdAt', 'DESC').addOrderBy('p.id', 'DESC');
        break;
      default:
        qb.orderBy('p.sortOrder', 'ASC').addOrderBy('p.id', 'DESC');
    }
  }
}
