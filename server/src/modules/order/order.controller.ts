import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IntParamPipe } from '../../common/pipes/int-param.pipe';
import { CancelOrderDto, CreateOrderDto, OrderQueryDto, PreviewOrderDto } from './dto/order.dto';
import { OrderService } from './order.service';

/**
 * 订单接口（顾客端）
 *
 * 全部需要登录，没有 @Public()，走全局 JwtAuthGuard。
 * 路由顺序注意：静态段 'preview' 必须写在 ':id' 通配之前，否则会被当成 id。
 */
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /** POST /api/v1/orders/preview —— 下单前算价（不落库） */
  @Post('preview')
  preview(@CurrentUser('userId') userId: number, @Body() dto: PreviewOrderDto) {
    return this.orderService.preview(userId, dto);
  }

  /** POST /api/v1/orders —— 提交订单（成功后为「待接单」，等店长在工作台处理） */
  @Post()
  create(@CurrentUser('userId') userId: number, @Body() dto: CreateOrderDto) {
    return this.orderService.create(userId, dto);
  }

  /** GET /api/v1/orders —— 我的订单列表（可按 status 过滤） */
  @Get()
  list(@CurrentUser('userId') userId: number, @Query() query: OrderQueryDto) {
    return this.orderService.listMine(userId, query);
  }

  /** GET /api/v1/orders/:id —— 订单详情（含状态流转轨迹） */
  @Get(':id')
  detail(@CurrentUser('userId') userId: number, @Param('id', IntParamPipe) id: number) {
    return this.orderService.detailMine(userId, id);
  }

  /** POST /api/v1/orders/:id/cancel —— 取消订单（未送达即可取消：待接单 / 处理中） */
  @Post(':id/cancel')
  cancel(
    @CurrentUser('userId') userId: number,
    @Param('id', IntParamPipe) id: number,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orderService.cancel(userId, id, dto);
  }
}
