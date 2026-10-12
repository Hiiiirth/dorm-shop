import { ErrorCode, errorMessage } from '../constants/error-code';

/**
 * 全局统一响应体
 *
 * {
 *   "code": 0,
 *   "message": "ok",
 *   "data": {...} | null,
 *   "timestamp": 1791082800000,
 *   "traceId": "8f3c1a2b9d"
 * }
 */
export class ApiResponse<T = unknown> {
  /** 0 表示成功，非 0 为业务错误码 */
  code: number;
  /** 面向用户的中文提示 */
  message: string;
  /** 成功时的业务数据；失败恒为 null */
  data: T | null;
  /** 服务器毫秒时间戳 */
  timestamp: number;
  /** 链路追踪 ID */
  traceId: string;

  private constructor(code: number, message: string, data: T | null, traceId: string) {
    this.code = code;
    this.message = message;
    this.data = data;
    this.timestamp = Date.now();
    this.traceId = traceId;
  }

  static success<T>(data?: T | null, traceId = ''): ApiResponse<T> {
    return new ApiResponse<T>(
      ErrorCode.SUCCESS,
      errorMessage(ErrorCode.SUCCESS),
      data === undefined ? null : data,
      traceId,
    );
  }

  static error(code: number, message?: string, traceId = ''): ApiResponse<never> {
    return new ApiResponse<never>(code, message ?? errorMessage(code), null, traceId);
  }
}
