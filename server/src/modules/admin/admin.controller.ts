import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { IntParamPipe } from '../../common/pipes/int-param.pipe';
import { UserRole } from '../../common/constants/enums';
import { AdminCategoryService } from './admin-category.service';
import { AdminOrderService } from './admin-order.service';
import { AdminProductService } from './admin-product.service';
import { AdminStatisticsService } from './admin-statistics.service';
import { AdminUserService } from './admin-user.service';
import {
  AdminCancelOrderDto,
  AdminOrderQueryDto,
  AdminProductQueryDto,
  AdminUserQueryDto,
  CreateCategoryDto,
  CreateProductDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/admin.dto';

/**
 * 管理端
 *
 * 整个控制器要求 token 里的 currentRole === ADMIN。
 * 身份守卫校验的是**当前身份**而不是「有没有 ADMIN 身份」——
 * 所以一个同时是管理员和顾客的账号，用顾客身份打进来照样 403，
 * 必须先 POST /auth/switch-role 切到管理员并使用新签发的 token。
 *
 * 路由顺序有讲究：静态段必须写在 `:id` 前面，
 * 否则 `/admin/products/category-options` 会被 `/admin/products/:id` 抢先匹配，
 * 然后在 IntParamPipe 里炸成「路径参数必须是数字」。
 */
@Controller('admin')
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly categoryService: AdminCategoryService,
    private readonly productService: AdminProductService,
    private readonly orderService: AdminOrderService,
    private readonly userService: AdminUserService,
    private readonly statisticsService: AdminStatisticsService,
  ) {}

  // ===============================================================
  // 分类
  // ===============================================================
  /** GET /api/v1/admin/categories —— 完整分类树（含停用的） */
  @Get('categories')
  categoryTree() {
    return this.categoryService.tree();
  }

  /** POST /api/v1/admin/categories —— 新建分类 */
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.categoryService.create(dto);
  }

  /** PUT /api/v1/admin/categories/:id —— 修改分类（改名/换父级/调排序/停启用） */
  @Put('categories/:id')
  updateCategory(@Param('id', IntParamPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.categoryService.update(id, dto);
  }

  /** DELETE /api/v1/admin/categories/:id —— 删除分类（有子分类或有关联商品会被拒） */
  @Delete('categories/:id')
  removeCategory(@Param('id', IntParamPipe) id: number) {
    return this.categoryService.remove(id);
  }

  // ===============================================================
  // 商品
  // ===============================================================
  /** GET /api/v1/admin/products —— 商品列表（含已下架） */
  @Get('products')
  productList(@Query() query: AdminProductQueryDto) {
    return this.productService.list(query);
  }

  /** ⚠️ 必须排在 products/:id 之前 */
  /** GET /api/v1/admin/products/category-options —— 分类下拉框（带各分类商品数） */
  @Get('products/category-options')
  categoryOptions() {
    return this.productService.categoryOptions();
  }

  /** GET /api/v1/admin/products/:id —— 商品详情 */
  @Get('products/:id')
  productDetail(@Param('id', IntParamPipe) id: number) {
    return this.productService.detail(id);
  }

  /** POST /api/v1/admin/products —— 新建商品（price/originalPrice 单位是「分」） */
  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  /** PUT /api/v1/admin/products/:id —— 修改商品 */
  @Put('products/:id')
  updateProduct(@Param('id', IntParamPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.productService.update(id, dto);
  }

  /** DELETE /api/v1/admin/products/:id —— 删除商品（有未完成订单引用会被拒） */
  @Delete('products/:id')
  removeProduct(@Param('id', IntParamPipe) id: number) {
    return this.productService.remove(id);
  }

  // ===============================================================
  // 订单
  // ===============================================================
  /** GET /api/v1/admin/orders —— 全部订单，可按状态/关键词/顾客/日期筛 */
  @Get('orders')
  orderList(@Query() query: AdminOrderQueryDto) {
    return this.orderService.list(query);
  }

  /** ⚠️ 必须排在 orders/:id 之前 */
  /** GET /api/v1/admin/orders/status-options —— 状态字典 */
  @Get('orders/status-options')
  orderStatusOptions() {
    return this.orderService.statusOptions();
  }

  /** GET /api/v1/admin/orders/:id —— 订单详情（含支付信息与状态轨迹） */
  @Get('orders/:id')
  orderDetail(@Param('id', IntParamPipe) id: number) {
    return this.orderService.detail(id);
  }

  /**
   * POST /api/v1/admin/orders/:id/accept —— 接单（PENDING → DELIVERING）
   *
   * 店长看到新单后点「接单」，表示开始处理这一单。
   */
  @Post('orders/:id/accept')
  acceptOrder(
    @Param('id', IntParamPipe) id: number,
    @CurrentUser('userId') operatorId: number,
  ) {
    return this.orderService.accept(id, operatorId);
  }

  /**
   * POST /api/v1/admin/orders/:id/deliver —— 确认送达（→ DELIVERED，终态）
   *
   * 也允许从 PENDING 直接送达（店长已经把货送到了）。
   */
  @Post('orders/:id/deliver')
  deliverOrder(
    @Param('id', IntParamPipe) id: number,
    @CurrentUser('userId') operatorId: number,
  ) {
    return this.orderService.deliver(id, operatorId);
  }

  /**
   * POST /api/v1/admin/orders/:id/cancel —— 管理员强制取消
   *
   * 已送达的订单不能取消。取消会回滚库存和销量。
   */
  @Post('orders/:id/cancel')
  cancelOrder(
    @Param('id', IntParamPipe) id: number,
    @Body() dto: AdminCancelOrderDto,
    @CurrentUser('userId') operatorId: number,
  ) {
    return this.orderService.cancel(id, dto, operatorId);
  }

  // ===============================================================
  // 用户
  // ===============================================================
  /** GET /api/v1/admin/users —— 用户列表 */
  @Get('users')
  userList(@Query() query: AdminUserQueryDto) {
    return this.userService.list(query);
  }

  /** GET /api/v1/admin/users/:id —— 用户详情 */
  @Get('users/:id')
  userDetail(@Param('id', IntParamPipe) id: number) {
    return this.userService.detail(id);
  }

  /**
   * PUT /api/v1/admin/users/:id/role —— 授予 / 撤销身份
   *
   * body: { role: 'ADMIN', action: 'GRANT' | 'REVOKE' }
   * 不能撤销自己的 ADMIN；撤销后若 currentRole 没了会自动落回 CUSTOMER。
   * 改完记得让该用户重新登录/切身份，因为身份是写在 token 里的。
   */
  @Put('users/:id/role')
  updateUserRole(
    @Param('id', IntParamPipe) id: number,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser('userId') operatorId: number,
  ) {
    return this.userService.updateRole(id, dto, operatorId);
  }

  /** PUT /api/v1/admin/users/:id/status —— 启用(1) / 禁用(0) 账号 */
  @Put('users/:id/status')
  updateUserStatus(
    @Param('id', IntParamPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser('userId') operatorId: number,
  ) {
    return this.userService.updateStatus(id, dto, operatorId);
  }

  // ===============================================================
  // 经营看板
  // ===============================================================
  /** GET /api/v1/admin/statistics —— 今日/累计营收、各状态单量、热销 TOP10 */
  @Get('statistics')
  statistics() {
    return this.statisticsService.overview();
  }
}
