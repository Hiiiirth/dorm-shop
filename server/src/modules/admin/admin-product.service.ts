import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Cart, Category, Order, OrderItem, Product } from '../../entities';
import { CommonStatus, OrderStatus } from '../../common/constants/enums';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code';
import { PageResult } from '../../common/response/page-result';
import { fenToYuan } from '../../common/utils/money';
import { ProductDetailVo, ProductListVo, toProductDetailVo, toProductListVo } from '../product/product.vo';
import { AdminProductQueryDto, CreateProductDto, UpdateProductDto } from './dto/admin.dto';

/** 还在办、需要实物配送的订单状态 */
const ACTIVE_ORDER_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.DELIVERING,
];

@Injectable()
export class AdminProductService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>,
  ) {}

  /** 商品列表（含已下架，顾客端看不到的那些管理端要能看到） */
  async list(query: AdminProductQueryDto): Promise<PageResult<ProductListVo>> {
    const qb = this.productRepo.createQueryBuilder('p');

    if (query.categoryId) {
      qb.andWhere('p.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (query.status !== undefined) {
      qb.andWhere('p.status = :status', { status: query.status });
    }
    if (query.keyword) {
      qb.andWhere('(p.name LIKE :kw OR p.subtitle LIKE :kw)', { kw: `%${query.keyword}%` });
    }

    switch (query.sortBy) {
      case 'price_asc':
        qb.orderBy('p.price', 'ASC');
        break;
      case 'price_desc':
        qb.orderBy('p.price', 'DESC');
        break;
      case 'sales':
        qb.orderBy('p.salesCount', 'DESC');
        break;
      case 'stock_asc':
        // 库存告警：优先看快没货的
        qb.orderBy('p.stock', 'ASC');
        break;
      case 'newest':
        qb.orderBy('p.id', 'DESC');
        break;
      default:
        qb.orderBy('p.sortOrder', 'ASC').addOrderBy('p.id', 'ASC');
    }

    const [rows, total] = await qb
      .skip(query.skip)
      .take(query.take)
      .getManyAndCount();

    return PageResult.of(rows.map(toProductListVo), total, query.page, query.pageSize);
  }

  async detail(id: number): Promise<ProductDetailVo> {
    const product = await this.mustFind(id);
    return toProductDetailVo(product);
  }

  async create(dto: CreateProductDto): Promise<ProductDetailVo> {
    await this.assertCategoryUsable(dto.categoryId);

    const saved = await this.productRepo.save(
      this.productRepo.create({
        categoryId: dto.categoryId,
        name: dto.name,
        subtitle: dto.subtitle ?? '',
        description: dto.description ?? null,
        coverImage: dto.coverImage ?? '',
        images: dto.images ?? null,
        // 接口收「分」，落库存「元」
        price: fenToYuan(dto.price),
        originalPrice: this.normalizeOriginalPrice(dto.originalPrice),
        stock: dto.stock,
        unit: dto.unit ?? '件',
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? CommonStatus.ENABLED,
      }),
    );
    return toProductDetailVo(saved);
  }

  async update(id: number, dto: UpdateProductDto): Promise<ProductDetailVo> {
    const product = await this.mustFind(id);

    if (dto.categoryId !== undefined) {
      await this.assertCategoryUsable(dto.categoryId);
      product.categoryId = dto.categoryId;
    }
    if (dto.name !== undefined) product.name = dto.name;
    if (dto.subtitle !== undefined) product.subtitle = dto.subtitle;
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.coverImage !== undefined) product.coverImage = dto.coverImage;
    if (dto.images !== undefined) product.images = dto.images;
    if (dto.price !== undefined) product.price = fenToYuan(dto.price);
    if (dto.originalPrice !== undefined) {
      product.originalPrice = this.normalizeOriginalPrice(dto.originalPrice);
    }
    if (dto.stock !== undefined) product.stock = dto.stock;
    if (dto.unit !== undefined) product.unit = dto.unit;
    if (dto.sortOrder !== undefined) product.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) product.status = dto.status;

    return toProductDetailVo(await this.productRepo.save(product));
  }

  /**
   * 删除商品（软删除）
   *
   * 有未完成订单时不让删 —— 店长还得照着这单备货送货，
   * 把商品删了他回看订单会一脸问号。这种情况应该「下架」。
   *
   * 历史订单不受影响：order_item 存的是下单时的快照。
   */
  async remove(id: number): Promise<{ id: number; deleted: boolean; removedFromCarts?: number }> {
    const product = await this.mustFind(id);

    const activeCount = await this.orderItemRepo
      .createQueryBuilder('oi')
      .innerJoin(Order, 'o', 'o.id = oi.orderId')
      .where('oi.productId = :id', { id })
      .andWhere('o.status IN (:...statuses)', { statuses: ACTIVE_ORDER_STATUSES })
      .getCount();

    if (activeCount > 0) {
      throw new BusinessException(
        ErrorCode.PRODUCT_IN_USE,
        `「${product.name}」还有 ${activeCount} 笔未完成的订单，请先改成「下架」`,
      );
    }

    // 商品没了，购物车里的引用也要清掉，否则用户结算时会报「商品不存在」
    const removedFromCarts = await this.cartRepo.delete({ productId: id });

    await this.productRepo.softDelete(id);
    return { id, deleted: true, ...(removedFromCarts.affected ? { removedFromCarts: removedFromCarts.affected } : {}) };
  }

  /** 分类下拉框：启用中的分类 + 每个分类下的商品数 */
  async categoryOptions(): Promise<{ id: number; name: string; parentId: number; productCount: number }[]> {
    const categories = await this.categoryRepo.find({
      where: { status: CommonStatus.ENABLED },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    const rows = await this.productRepo
      .createQueryBuilder('p')
      .select('p.categoryId', 'categoryId')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('p.categoryId')
      .getRawMany<{ categoryId: string; cnt: string }>();

    const counts = new Map(rows.map((row) => [Number(row.categoryId), Number(row.cnt)]));
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      productCount: counts.get(category.id) ?? 0,
    }));
  }

  // ---------------------------------------------------------------
  private async mustFind(id: number): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throw new BusinessException(ErrorCode.PRODUCT_NOT_FOUND);
    return product;
  }

  private async assertCategoryUsable(categoryId: number): Promise<void> {
    const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!category) throw new BusinessException(ErrorCode.CATEGORY_NOT_FOUND);
  }

  /** 0 或空视为「不设划线价」，存 null */
  private normalizeOriginalPrice(fen: number | undefined): string | null {
    if (fen === undefined || fen === null || fen <= 0) return null;
    return fenToYuan(fen);
  }
}
