/**
 * 管理端接口 —— 对齐后端 src/modules/admin/admin.controller.ts
 *
 * 三条容易踩的约定：
 *
 * 1) **整个控制器都要求 ADMIN 身份**（`@Roles(UserRole.ADMIN)` + `RolesGuard`）。
 *    守卫读的是 **token 里的 currentRole**，不是「这个账号有没有 ADMIN 角色」。
 *    所以拿顾客 token 打这里会得到 **403 + 20003**，前端表现是 toast
 *    「当前身份没有该权限，请先切换身份」—— 不要试图自动重试或刷 token。
 *
 * 2) **列表 query 的布尔值要传 `0` / `1`，不能传 `true` / `false`**。
 *    后端 `@Type(() => Number)` 会把字符串 `"false"` 变成 `NaN`，
 *    而 `@IsBoolean()` 把 NaN 当 `true`（JS 的 Boolean(NaN) 是 false，但 class-validator
 *    的 @IsBoolean 对 NaN 判定为真）—— 结果筛选条件静默失效。
 *
 * 3) **静态路由写在 `:id` 之前**，这是后端声明顺序决定的。
 *    `status-options` 和 `category-options` 必须放在 `orders/:id` / `products/:id` 前面，
 *    否则会被参数路由抢走。前端不用规避，但要知道为什么这两个 URL 长得这么怪。
 *
 * 金额单位：入参 `price` / `originalPrice` 是**分**；返回的 `totalAmount` / `amount` 也是分。
 * 前端只在 `<input>` 里用「元」，提交前 ×100 —— 见 AdminProductEdit 页。
 */
import { http } from '../utils/request';

export const adminApi = {
  // ======================================================================
  // 经营看板
  // ======================================================================

  /**
   * GET /admin/statistics
   * @returns {Promise<{
   *   today:  { orderCount, deliveredCount, cancelledCount, revenue, newUsers },
   *   total:  { orderCount, deliveredCount, cancelledCount, revenue, userCount, productCount, categoryCount },
   *   statusCounts: Record<'PENDING'|'DELIVERING'|'DELIVERED'|'CANCELLED', number>,
   *   hotProducts: { productId, name, quantity, amount }[]
   * }>}
   */
  statistics: () => http.get('/admin/statistics'),

  // ======================================================================
  // 订单
  // ======================================================================

  /**
   * GET /admin/orders
   * @param {{ status?: string, keyword?: string, userId?: number,
   *           dateFrom?: string, dateTo?: string, page?: number, pageSize?: number }} query
   * @returns {Promise<{list: AdminOrderVo[], page, pageSize, total, hasMore}>}
   */
  orderList: (query) => http.get('/admin/orders', query),

  /** GET /admin/orders/status-options —— 4 个状态 + 中文 label（状态字典的唯一来源） */
  orderStatusOptions: () => http.get('/admin/orders/status-options'),

  /** GET /admin/orders/:id —— 详情比列表多 statusLogs / payType / payStatus */
  orderDetail: (id) => http.get(`/admin/orders/${id}`),

  /** POST /admin/orders/:id/accept —— 接单 PENDING → DELIVERING */
  acceptOrder: (id) => http.post(`/admin/orders/${id}/accept`),

  /**
   * POST /admin/orders/:id/deliver —— 确认送达
   * **允许从 PENDING 直达**（v1.2 起，店长可能已经把货放到门口了）
   */
  deliverOrder: (id) => http.post(`/admin/orders/${id}/deliver`),

  /**
   * POST /admin/orders/:id/cancel —— 店长强制取消
   * 比顾客端宽：DELIVERING 也能取消。`reason` 后端存进 `cancelReason`，
   * 所以前端**必须**让店长填（ConfirmSheet 里带输入框）
   */
  cancelOrder: (id, data) => http.post(`/admin/orders/${id}/cancel`, data),

  // ======================================================================
  // 分类
  // ======================================================================

  /** GET /admin/categories —— **完整树，含已停用**（顾客端 /categories 只给启用的） */
  categoryTree: () => http.get('/admin/categories'),

  /** GET /admin/products/category-options —— 商品表单用的扁平选项 */
  categoryOptions: () => http.get('/admin/products/category-options'),

  /** POST /admin/categories */
  createCategory: (data) => http.post('/admin/categories', data),

  /** PUT /admin/categories/:id —— 字段全可选 */
  updateCategory: (id, data) => http.put(`/admin/categories/${id}`, data),

  /**
   * DELETE /admin/categories/:id —— 软删除
   * 失败码：有子分类 `40005` / 有商品 `40006`。
   * 这两条提示要**原样展示给店长**，不要转成自己的话术（他需要知道到底缺什么）
   */
  removeCategory: (id) => http.delete(`/admin/categories/${id}`),

  // ======================================================================
  // 商品
  // ======================================================================

  /**
   * GET /admin/products
   * @param {{ categoryId?: number, keyword?: string, status?: 0|1, sortBy?: string,
   *           page?: number, pageSize?: number }} query
   */
  productList: (query) => http.get('/admin/products', query),

  /** GET /admin/products/:id */
  productDetail: (id) => http.get(`/admin/products/${id}`),

  /** POST /admin/products —— `price` 单位是**分** */
  createProduct: (data) => http.post('/admin/products', data),

  /** PUT /admin/products/:id */
  updateProduct: (id, data) => http.put(`/admin/products/${id}`, data),

  /**
   * DELETE /admin/products/:id
   * 失败码：有在办订单（PENDING / DELIVERING）→ `40007`，提示改用「下架」。
   * 成功后后端会**同时清掉购物车里引用它的行**
   */
  removeProduct: (id) => http.delete(`/admin/products/${id}`),

  // ======================================================================
  // 用户
  // ======================================================================

  /**
   * GET /admin/users
   * @param {{ keyword?: string, role?: 'CUSTOMER'|'ADMIN', status?: 0|1,
   *           page?: number, pageSize?: number }} query
   */
  userList: (query) => http.get('/admin/users', query),

  /** GET /admin/users/:id */
  userDetail: (id) => http.get(`/admin/users/${id}`),

  /**
   * PUT /admin/users/:id/role
   * @param {{ role: 'CUSTOMER'|'ADMIN', action: 'GRANT'|'REVOKE' }} data
   * 不能撤销自己的 ADMIN → `30004`（前端也要先把按钮禁用掉）
   */
  updateUserRole: (id, data) => http.put(`/admin/users/${id}/role`, data),

  /** PUT /admin/users/:id/status —— `status` 传 `0` / `1`，不能传布尔 */
  updateUserStatus: (id, data) => http.put(`/admin/users/${id}/status`, data),
};