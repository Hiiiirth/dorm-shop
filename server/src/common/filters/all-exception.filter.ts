import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse } from '../response/api-response';
import { ErrorCode, errorMessage } from '../constants/error-code';
import { RequestWithTrace } from '../middleware/trace-id.middleware';

/**
 * 全局异常兜底
 *
 * 所有异常最终都变成标准响应体，前端永远不用处理第二种格式。
 */
@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithTrace>();
    const traceId = req?.traceId ?? '';

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: number = ErrorCode.SERVER_ERROR;
    let message = errorMessage(ErrorCode.SERVER_ERROR);

    if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null && 'code' in body) {
        // BusinessException 或自定义异常
        const payload = body as { code: number; message?: string };
        code = payload.code;
        message = payload.message ?? errorMessage(code);
      } else {
        // Nest 内置异常：ValidationPipe / NotFoundException / UnauthorizedException ...
        code = this.mapHttpStatusToCode(httpStatus);
        message = this.extractMessage(body) ?? errorMessage(code);
      }
    } else {
      // 未捕获的运行时异常，记录完整堆栈便于排查
      const err = exception as Error;
      this.logger.error(
        `[${traceId}] ${req?.method} ${req?.originalUrl} -> ${err?.message}`,
        err?.stack,
      );
    }

    // Express 对未匹配路由给的默认文案是英文，统一换成中文
    if (
      code === ErrorCode.RESOURCE_NOT_FOUND &&
      /^Cannot (GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/.test(message)
    ) {
      message = '接口不存在';
    }

    res.status(httpStatus).json(ApiResponse.error(code, message, traceId));
  }

  private mapHttpStatusToCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCode.PARAM_INVALID;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.RESOURCE_NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.TOO_MANY_REQUESTS;
      default:
        return ErrorCode.SERVER_ERROR;
    }
  }

  /** Nest 的 message 可能是字符串或字符串数组（class-validator 报错） */
  private extractMessage(body: unknown): string | null {
    if (typeof body === 'string') return body;
    if (typeof body === 'object' && body !== null) {
      const raw = (body as { message?: unknown }).message;
      if (typeof raw === 'string') return raw;
      if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
    }
    return null;
  }
}
