import { Injectable, ParseIntPipe } from '@nestjs/common';
import { ErrorCode } from '../constants/error-code';
import { BusinessException } from '../exceptions/business.exception';

/**
 * 路径参数整数管道
 *
 * Nest 自带的 ParseIntPipe 遇到非数字会抛 BadRequestException，
 * 返回 HTTP 400 —— 这违反了我们的响应规范（业务失败一律 HTTP 200 + code != 0，
 * 只有 401/403/404/429/500 才用传输状态码）。
 * 这里把它的异常工厂换掉，统一成 200 + 10001。
 */
@Injectable()
export class IntParamPipe extends ParseIntPipe {
  constructor() {
    super({
      exceptionFactory: () => new BusinessException(ErrorCode.PARAM_INVALID, '路径参数必须是数字'),
    });
  }
}
