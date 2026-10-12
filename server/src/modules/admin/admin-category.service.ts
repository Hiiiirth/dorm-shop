import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { Category, Product } from '../../entities';
import { CommonStatus } from '../../common/constants/enums';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-code';
import { CategoryService } from '../category/category.service';
import { CategoryVo, toCategoryVo } from '../category/category.vo';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/admin.dto';

@Injectable()
export class AdminCategoryService {
  constructor(
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    private readonly categoryService: CategoryService,
  ) {}

  /** 含停用分类的完整树 */
  tree(): Promise<CategoryVo[]> {
    return this.categoryService.treeAll();
  }

  async create(dto: CreateCategoryDto): Promise<CategoryVo> {
    const parentId = dto.parentId ?? 0;
    await this.assertParentExists(parentId);

    const saved = await this.categoryRepo.save(
      this.categoryRepo.create({
        parentId,
        name: dto.name,
        icon: dto.icon ?? '',
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? CommonStatus.ENABLED,
      }),
    );
    return toCategoryVo(saved);
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<CategoryVo> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new BusinessException(ErrorCode.CATEGORY_NOT_FOUND);

    if (dto.parentId !== undefined && dto.parentId !== category.parentId) {
      await this.assertParentExists(dto.parentId);
      await this.assertNoCycle(id, dto.parentId);
      category.parentId = dto.parentId;
    }
    if (dto.name !== undefined) category.name = dto.name;
    if (dto.icon !== undefined) category.icon = dto.icon;
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) category.status = dto.status;

    return toCategoryVo(await this.categoryRepo.save(category));
  }

  /**
   * 删除分类（软删除）
   *
   * 两道闸：还有子分类、还有商品，都不让删。
   * 否则商品会变成孤儿数据 —— 前端按分类翻不到它，但库里又存在。
   */
  async remove(id: number): Promise<{ id: number; deleted: boolean }> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new BusinessException(ErrorCode.CATEGORY_NOT_FOUND);

    const childCount = await this.categoryRepo.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BusinessException(
        ErrorCode.CATEGORY_HAS_CHILDREN,
        `「${category.name}」下还有 ${childCount} 个子分类，请先处理`,
      );
    }

    const productCount = await this.productRepo.count({ where: { categoryId: id } });
    if (productCount > 0) {
      throw new BusinessException(
        ErrorCode.CATEGORY_HAS_PRODUCTS,
        `「${category.name}」下还有 ${productCount} 个商品，请先移走或删除`,
      );
    }

    await this.categoryRepo.softDelete(id);
    return { id, deleted: true };
  }

  // ---------------------------------------------------------------
  private async assertParentExists(parentId: number): Promise<void> {
    if (parentId === 0) return;
    const parent = await this.categoryRepo.findOne({ where: { id: parentId } });
    if (!parent) {
      throw new BusinessException(ErrorCode.CATEGORY_NOT_FOUND, '上级分类不存在');
    }
  }

  /**
   * 防止把分类挂到自己的子孙下面，形成环。
   * 一旦成环，树的构建会把整条链变成孤儿，前端就再也看不到这些分类了。
   */
  private async assertNoCycle(id: number, newParentId: number): Promise<void> {
    if (id === newParentId) {
      throw new BusinessException(ErrorCode.PARAM_INVALID, '不能把分类挂到它自己下面');
    }

    const descendants = await this.categoryRepo.find({
      where: { parentId: Not(0) },
      select: ['id', 'parentId'],
    });
    const parentOf = new Map(descendants.map((row) => [row.id, row.parentId]));

    // 从新父节点一路往上爬，如果能爬到自己，说明新父节点是自己的子孙
    let cursor: number | undefined = newParentId;
    const guard = descendants.length + 1; // 防御性上限，避免脏数据导致死循环
    for (let i = 0; i < guard && cursor; i += 1) {
      if (cursor === id) {
        throw new BusinessException(
          ErrorCode.PARAM_INVALID,
          '不能把分类挂到它自己的子分类下面（会形成环）',
        );
      }
      cursor = parentOf.get(cursor);
    }
  }
}
