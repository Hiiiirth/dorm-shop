import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/** 挂在 req 上的追踪 ID */
export interface RequestWithTrace extends Request {
  traceId?: string;
}

/**
 * 最早执行的中间件：为每个请求分配 traceId。
 * 放在中间件而不是拦截器里，是为了让守卫抛出的异常也能带上 traceId。
 */
@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: RequestWithTrace, _res: Response, next: NextFunction): void {
    const header = req.headers['x-request-id'];
    if (typeof header === 'string' && header.trim()) {
      req.traceId = header.trim().slice(0, 32);
    } else {
      req.traceId = randomUUID().replace(/-/g, '').slice(0, 12);
    }
    next();
  }
}
