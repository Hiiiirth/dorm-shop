import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { HomeService } from './home.service';
import { HomeVo } from './home.vo';

@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  /** GET /api/v1/home —— 首页聚合，未登录也能访问 */
  @Public()
  @Get()
  overview(): Promise<HomeVo> {
    return this.homeService.overview();
  }
}
