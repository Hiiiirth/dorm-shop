import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, errorMessage } from '../constants/error-code';

/**
 * 业务异常
 *
 * 默认以 HTTP 200 返回，靠 body 里的 code 区分成功/失败，
 * 前端只需处理一套逻辑。鉴权类错误显式传 HttpStatus.UNAUTHORIZED / FORBIDDEN。
 *
 * @example
 *   throw new BusinessException(ErrorCode.ORDER_STATUS_INVALID);
 *   throw new BusinessException(ErrorCode.STOCK_NOT_ENOUGH, '「可口可乐」库存只剩 2 件');
 *   throw new BusinessException(ErrorCode.UNAUTHORIZED, undefined, HttpStatus.UNAUTHORIZED);
 */
export class BusinessException extends HttpException {
  readonly code: ErrorCode;

  constructor(
    code: ErrorCode,
    message?: string,
    httpStatus: HttpStatus = HttpStatus.OK,
  ) {
    super({ code, message: message ?? errorMessage(code) }, httpStatus);
    this.code = code;
  }
}
