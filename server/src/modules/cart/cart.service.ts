import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Cart, Product } from '../../entities';
import { CommonStatus } from '../../common/constants/enums';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code';
import { yuanToFen } from '../../common/utils/money';
import { AddCartDto, UpdateCartDto } from './dto/cart.dto';
import { CartItemVo, CartVo } from './cart.vo';

const EMPTY_CART: CartVo = {
  list: [],
  itemCount: 0,
  selectedItemCount: 0,
  totalQuantity: 0,
  totalAmount: 0,
};

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
  ) {}

  /**
   * 增删改一律返回完整购物车。
   *
   * 小程序购物车页每次操作后都要重算合计，返回整车可以让前端直接重渲染，
   * 省掉「改完再查一次」的第二个请求，也不会出现两边不一致。
   */
  async list(userId: number): Promise<CartVo> {
    const rows = await this.cartRepo.find({
      where: { userId },
      order: { id: 'DESC' },
    });
    return this.buildVo(rows);
  }

  /** 加入购物车：同一商品重复加会累加数量，不会产生第二条记录 */
  async add(userId: number, dto: AddCartDto): Promise<CartVo> {
    const product = await this.productRepo.findOne({ where: { id: dto.productId } });
    if (!product) throw new BusinessException(ErrorCode.PRODUCT_NOT_FOUND);
    if (product.status !== CommonStatus.ENABLED) {
      throw new BusinessException(ErrorCode.PRODUCT_OFF_SHELF);
    }

    const existing = await this.cartRepo.findOne({
      where: { userId, productId: dto.productId },
    });
    const targetQuantity = (existing?.quantity ?? 0) + dto.quantity;

    if (targetQuantity > product.stock) {
      throw new BusinessException(
        ErrorCode.STOCK_NOT_ENOUGH,
        `「${product.name}」库存只剩 ${product.stock} ${product.unit}`,
      );
    }

    if (existing) {
      existing.quantity = targetQuantity;
      existing.selected = 1;
      await this.cartRepo.save(existing);
    } else {
      await this.cartRepo.save(
        this.cartRepo.create({
          userId,
          productId: dto.productId,
          quantity: dto.quantity,
          selected: 1,
        }),
      );
    }

    return this.list(userId);
  }

  async update(userId: number, cartId: number, dto: UpdateCartDto): Promise<CartVo> {
    const item = await this.mustFindOwnItem(userId, cartId);

    if (dto.quantity !== undefined) {
      const product = await this.productRepo.findOne({ where: { id: item.productId } });
      if (!product) throw new BusinessException(ErrorCode.PRODUCT_NOT_FOUND);
      if (dto.quantity > product.stock) {
        throw new BusinessException(
          ErrorCode.STOCK_NOT_ENOUGH,
          `「${product.name}」库存只剩 ${product.stock} ${product.unit}`,
        );
      }
      item.quantity = dto.quantity;
    }

    if (dto.selected !== undefined) {
      item.selected = dto.selected;
    }

    await this.cartRepo.save(item);
    return this.list(userId);
  }

  /** 删除单项（cart 表没有 deleted_at，这里是物理删除） */
  async remove(userId: number, cartId: number): Promise<CartVo> {
    await this.mustFindOwnItem(userId, cartId);
    await this.cartRepo.delete(cartId);
    return this.list(userId);
  }

  async clear(userId: number): Promise<CartVo> {
    await this.cartRepo.delete({ userId });
    return this.list(userId);
  }

  // ---------------------------------------------------------------
  // 内部
  // ---------------------------------------------------------------
  private async buildVo(rows: Cart[]): Promise<CartVo> {
    if (rows.length === 0) return EMPTY_CART;

    const products = await this.productRepo.findBy({
      id: In(rows.map((row) => row.productId)),
    });
    const productMap = new Map(products.map((product) => [product.id, product]));

    const list: CartItemVo[] = rows.map((row) => {
      const product = productMap.get(row.productId);
      const price = product ? yuanToFen(product.price) : 0;

      let available = true;
      let unavailableReason: string | null = null;

      if (!product || product.status !== CommonStatus.ENABLED) {
        available = false;
        unavailableReason = '商品已下架';
      } else if (product.stock < row.quantity) {
        available = false;
        unavailableReason = `库存不足，仅剩 ${product.stock} ${product.unit}`;
      }

      return {
        id: row.id,
        productId: row.productId,
        name: product?.name ?? '商品已下架',
        coverImage: product?.coverImage ?? '',
        price,
        originalPrice:
          product?.originalPrice === null || product?.originalPrice === undefined
            ? null
            : yuanToFen(product.originalPrice),
        unit: product?.unit ?? '件',
        stock: product?.stock ?? 0,
        quantity: row.quantity,
        selected: row.selected,
        subtotal: price * row.quantity,
        available,
        unavailableReason,
      };
    });

    const payable = list.filter((item) => item.selected === 1 && item.available);

    return {
      list,
      itemCount: list.length,
      selectedItemCount: payable.length,
      totalQuantity: payable.reduce((sum, item) => sum + item.quantity, 0),
      totalAmount: payable.reduce((sum, item) => sum + item.subtotal, 0),
    };
  }

  /**
   * 取自己的购物车项。
   * 「不存在」和「是别人的」返回同一个错误，避免被用来探测他人购物车。
   */
  private async mustFindOwnItem(userId: number, cartId: number): Promise<Cart> {
    const item = await this.cartRepo.findOne({ where: { id: cartId } });
    if (!item || item.userId !== userId) {
      throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, '购物车里没有该商品');
    }
    return item;
  }
}
