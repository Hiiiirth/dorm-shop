import { ValidationError } from 'class-validator';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCode } from '../constants/error-code';

/**
 * 把 class-validator 的校验失败转成 BusinessException（HTTP 200 + code 10001）。
 *
 * 默认行为是抛 BadRequestException（HTTP 400），那样前端拦截器就得同时处理
 * 「200 但 code!=0」和「400」两条错误路径。统一成 200 后前端只有一条路径。
 * 传输层状态码只留给真正的传输/鉴权问题：401、403、404、429、500。
 */
export function validationExceptionFactory(errors: ValidationError[]): BusinessException {
  return new BusinessException(ErrorCode.PARAM_INVALID, pickFirstMessage(errors));
}

function pickFirstMessage(errors: ValidationError[]): string {
  for (const error of errors) {
    if (error.constraints) {
      const first = Object.values(error.constraints)[0];
      if (first) return first;
    }
    // 嵌套 DTO / 数组元素
    if (error.children && error.children.length > 0) {
      const nested = pickFirstMessage(error.children);
      if (nested) return nested;
    }
  }
  return '';
}
