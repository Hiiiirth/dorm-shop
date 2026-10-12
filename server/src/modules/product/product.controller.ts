import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { IntParamPipe } from '../../common/pipes/int-param.pipe';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductService } from './product.service';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  /** GET /api/v1/products?categoryId=1&keyword=可乐&sortBy=sales&page=1&pageSize=10 */
  @Public()
  @Get()
  list(@Query() query: ProductQueryDto) {
    return this.productService.list(query);
  }

  /** GET /api/v1/products/1 */
  @Public()
  @Get(':id')
  detail(@Param('id', IntParamPipe) id: number) {
    return this.productService.detail(id);
  }
}
