import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../response/api-response';
import { RequestWithTrace } from '../middleware/trace-id.middleware';
import { serializeDates } from '../utils/serialize';

/**
 * 成功响应包装器
 *
 * Controller 只需 return 业务数据，这里统一套上 { code, message, data, timestamp, traceId }。
 * 失败路径由 AllExceptionFilter 负责，两者合起来构成完整的响应规范。
 *
 * 出口处用 `serializeDates` 把负载里的 `Date` 统一转成毫秒时间戳，
 * 兑现「时间：统一毫秒时间戳」的硬性约定（否则 Date 会被 JSON.stringify 成 ISO 字符串）。
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const req = context.switchToHttp().getRequest<RequestWithTrace>();
    const traceId = req.traceId ?? '';
    return next
      .handle()
      .pipe(map((data) => ApiResponse.success<T>(serializeDates(data), traceId)));
  }
}
