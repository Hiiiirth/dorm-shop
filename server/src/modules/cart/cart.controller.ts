import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IntParamPipe } from '../../common/pipes/int-param.pipe';
import { AddCartDto, UpdateCartDto } from './dto/cart.dto';
import { CartService } from './cart.service';

/** 购物车全部接口都需要登录（无 @Public，走全局 JwtAuthGuard） */
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /** GET /api/v1/cart —— 购物车列表 + 合计 */
  @Get()
  list(@CurrentUser('userId') userId: number) {
    return this.cartService.list(userId);
  }

  /** POST /api/v1/cart —— 加入购物车 */
  @Post()
  add(@CurrentUser('userId') userId: number, @Body() dto: AddCartDto) {
    return this.cartService.add(userId, dto);
  }

  /** PUT /api/v1/cart/:id —— 改数量 / 勾选 */
  @Put(':id')
  update(
    @CurrentUser('userId') userId: number,
    @Param('id', IntParamPipe) id: number,
    @Body() dto: UpdateCartDto,
  ) {
    return this.cartService.update(userId, id, dto);
  }

  /** DELETE /api/v1/cart/:id —— 删除单项 */
  @Delete(':id')
  remove(@CurrentUser('userId') userId: number, @Param('id', IntParamPipe) id: number) {
    return this.cartService.remove(userId, id);
  }

  /** DELETE /api/v1/cart —— 清空 */
  @Delete()
  clear(@CurrentUser('userId') userId: number) {
    return this.cartService.clear(userId);
  }
}
