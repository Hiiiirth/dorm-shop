import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Category } from '../../entities';
import { CommonStatus } from '../../common/constants/enums';
import { CategoryVo, toCategoryVo } from './category.vo';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
  ) {}

  /** 完整分类树（只含启用的分类） */
  async tree(): Promise<CategoryVo[]> {
    const rows = await this.categoryRepo.find({
      where: { status: CommonStatus.ENABLED },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return this.buildTree(rows);
  }

  /** 管理端用：含停用分类的完整树（停用的也得能编辑和重新启用） */
  async treeAll(): Promise<CategoryVo[]> {
    const rows = await this.categoryRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
    return this.buildTree(rows);
  }

  /** 某个父分类下的直接子分类 */
  async listByParent(parentId: number): Promise<CategoryVo[]> {
    const rows = await this.categoryRepo.find({
      where: { parentId, status: CommonStatus.ENABLED },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return rows.map(toCategoryVo);
  }

  /**
   * 拍平的一维列表组装成树。
   *
   * 注意包含两层含义：
   *   1. parentId === 0 的是根节点
   *   2. parentId 指向的分类若被停用/删除，子分类会被"上浮"成根节点，
   *      而不是凭空消失 —— 否则商品会变成孤儿数据
   */
  private buildTree(rows: Category[]): CategoryVo[] {
    const map = new Map<number, CategoryVo>();
    for (const row of rows) {
      map.set(row.id, { ...toCategoryVo(row), children: [] });
    }

    const roots: CategoryVo[] = [];
    for (const node of map.values()) {
      const parent = node.parentId === 0 ? undefined : map.get(node.parentId);
      if (parent) {
        parent.children!.push(node);
      } else {
        roots.push(node);
      }
    }

    this.pruneEmptyChildren(roots);
    return roots;
  }

  /** 叶子节点不返回空的 children 字段，前端少一层判断 */
  private pruneEmptyChildren(nodes: CategoryVo[]): void {
    for (const node of nodes) {
      if (!node.children || node.children.length === 0) {
        delete node.children;
        continue;
      }
      this.pruneEmptyChildren(node.children);
    }
  }
}
