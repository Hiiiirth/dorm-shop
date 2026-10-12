/**
 * 分页信封：所有列表接口的 data 都长这样
 *
 * {
 *   "list": [],
 *   "page": 1,
 *   "pageSize": 10,
 *   "total": 128,
 *   "hasMore": true
 * }
 */
export class PageResult<T> {
  list: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;

  private constructor(list: T[], page: number, pageSize: number, total: number, hasMore: boolean) {
    this.list = list;
    this.page = page;
    this.pageSize = pageSize;
    this.total = total;
    this.hasMore = hasMore;
  }

  static of<T>(list: T[], total: number, page: number, pageSize: number): PageResult<T> {
    return new PageResult<T>(list, page, pageSize, total, page * pageSize < total);
  }

  /** 把 TypeORM 的 [list, total] 直接转成分页信封 */
  static fromTuple<T>(tuple: [T[], number], page: number, pageSize: number): PageResult<T> {
    return PageResult.of(tuple[0], tuple[1], page, pageSize);
  }
}
