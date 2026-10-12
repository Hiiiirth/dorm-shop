import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionFilter } from './common/filters/all-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { validationExceptionFactory } from './common/pipes/validation-exception.factory';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  const config = app.get(ConfigService);
  const prefix = config.get<string>('apiPrefix') ?? 'api/v1';
  const port = config.get<number>('port') ?? 3000;

  /**
   * 提高 JSON body 体积上限
   *
   * 起因（v1.3）：商品封面图与用户头像改成 base64 data URL 直接落库，
   * 单张压缩后约 80~160KB，而 Express 内置的 `json()` **默认上限只有 100kb** ——
   * 表现是上传头像直接报 `PayloadTooLargeError` → 被兜底过滤器转成 90001
   * 「服务开小差了」，看起来像后端崩了，其实是传输层就拒了。
   *
   * 2mb 的取值依据：单张图上限约 400KB（极端情况），
   * 留 5 倍余量；同时它明显小于 MySQL `max_allowed_packet` 默认的 64MB，
   * 所以 body 能进来就一定能写进库，不会出现「收下了但存不进」的中间态。
   *
   * ⚠️ 这里是**第一道闸门**，第二道是 DTO 上的 `IsImageDataUrl`
   *    （1.5MB 字符上限 + MIME 白名单）。超出这里的是 413 → 90001；
   *    超第二道的才是业务失败 10001。两道都要在。
   */
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  app.setGlobalPrefix(prefix);

  // 参数校验：剔除未声明字段 + 自动转型
  // 校验失败统一转成 BusinessException（HTTP 200 + code 10001），保持单一错误路径
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      stopAtFirstError: true,
      forbidNonWhitelisted: false,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // 成功响应统一包装
  app.useGlobalInterceptors(new ResponseInterceptor());

  // 异常统一兜底（必须最后注册，覆盖全部异常）
  app.useGlobalFilters(new AllExceptionFilter());

  await app.listen(port);

  Logger.log(`接口地址: http://localhost:${port}/${prefix}`, 'Bootstrap');
  Logger.log(`健康检查: http://localhost:${port}/${prefix}/health`, 'Bootstrap');
}

void bootstrap();
