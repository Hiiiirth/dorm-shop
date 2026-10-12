import { Category } from '../../entities';

export interface CategoryVo {
  id: number;
  parentId: number;
  name: string;
  icon: string;
  sortOrder: number;
  /** 1 启用 0 停用。顾客端只会看到启用的，管理端会看到全部 */
  status: number;
  /** 一级分类才带，叶子节点不返回该字段 */
  children?: CategoryVo[];
}

export function toCategoryVo(category: Category): CategoryVo {
  return {
    id: category.id,
    parentId: category.parentId,
    name: category.name,
    icon: category.icon,
    sortOrder: category.sortOrder,
    status: category.status,
  };
}
