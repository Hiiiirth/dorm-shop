import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';

/**
 * 健康检查 —— 也是「全局响应规范」的最小验证入口
 *
 * GET /api/v1/health
 * -> { "code": 0, "message": "ok", "data": {...}, "timestamp": ..., "traceId": "..." }
 */
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get()
  check() {
    return {
      status: 'up',
      env: this.config.get<string>('nodeEnv'),
      uptime: Math.floor(process.uptime()),
      now: Date.now(),
    };
  }
}
