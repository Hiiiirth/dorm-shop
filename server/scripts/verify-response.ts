/**
 * 全局响应规范本地验证脚本（不依赖数据库）
 *
 * 用真实的 ResponseInterceptor / AllExceptionFilter / TraceIdMiddleware
 * 起一个最小服务，把成功、分页、日期序列化、业务失败、未捕获异常、404 六种情况各打一遍，
 * 确认响应体格式与设计文档 §2 完全一致。
 *
 * 运行： npx ts-node scripts/verify-response.ts
 */
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { AllExceptionFilter } from '../src/common/filters/all-exception.filter';
import { TraceIdMiddleware } from '../src/common/middleware/trace-id.middleware';
import { BusinessException } from '../src/common/exceptions/business.exception';
import { PageResult } from '../src/common/response/page-result';
import { ErrorCode } from '../src/common/constants/error-code';

@Controller('demo')
class DemoController {
  @Get('ok')
  ok() {
    return { hello: 'world' };
  }

  @Get('page')
  page() {
    return PageResult.of([{ id: 1, name: '可口可乐' }, { id: 2, name: '薯片' }], 128, 1, 10);
  }

  /** 日期序列化专项：负载里的 Date 必须变成毫秒数，同上送进来的字符串不能被改 */
  @Get('date')
  date() {
    return {
      createdAt: new Date('2026-10-07T16:14:40.000Z'),
      nested: { updatedAt: new Date('2026-10-08T01:02:03.000Z') },
      list: [new Date('2026-10-09T00:00:00.000Z')],
      nullAt: null,
      text: '2026-10-07T16:14:40.000Z',
    };
  }

  @Get('biz-error')
  bizError(): never {
    throw new BusinessException(ErrorCode.STOCK_NOT_ENOUGH, '「可口可乐」库存只剩 2 件');
  }

  @Get('boom')
  boom(): never {
    throw new Error('模拟未捕获的运行时异常');
  }
}

@Module({ controllers: [DemoController] })
class DemoModule {}

const CASES = [
  { path: 'ok', desc: '成功' },
  { path: 'page', desc: '分页' },
  { path: 'date', desc: '日期序列化（Date → 毫秒时间戳）' },
  { path: 'biz-error', desc: '业务失败（HTTP 200 + code!=0）' },
  { path: 'boom', desc: '未捕获异常（HTTP 500）' },
  { path: 'not-exist', desc: '路由不存在（HTTP 404）' },
];

async function main(): Promise<void> {
  const app = await NestFactory.create(DemoModule, { logger: false });
  app.setGlobalPrefix('api/v1');

  const traceMw = new TraceIdMiddleware();
  app.use(traceMw.use.bind(traceMw));
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionFilter());

  await app.listen(3100);

  let failed = 0;

  for (const item of CASES) {
    const res = await fetch(`http://127.0.0.1:3100/api/v1/demo/${item.path}`, {
      headers: { 'X-Request-Id': 'test-trace-001' },
    });
    const body = await res.json();

    const shapeOk =
      typeof body.code === 'number' &&
      typeof body.message === 'string' &&
      'data' in body &&
      typeof body.timestamp === 'number' &&
      body.traceId === 'test-trace-001';

    if (!shapeOk) failed += 1;

    // 日期序列化专项断言（架构硬性约定：时间统一毫秒时间戳）
    if (item.path === 'date') {
      const d = (body.data ?? {}) as Record<string, unknown>;
      const nested = (d.nested ?? {}) as Record<string, unknown>;
      const list = Array.isArray(d.list) ? (d.list as unknown[]) : [];
      const dateOk =
        // 顶层 Date → 毫秒数，且值正确
        typeof d.createdAt === 'number' &&
        d.createdAt === Date.parse('2026-10-07T16:14:40.000Z') &&
        // 嵌套对象里的 Date 也要被递归转换
        typeof nested.updatedAt === 'number' &&
        nested.updatedAt === Date.parse('2026-10-08T01:02:03.000Z') &&
        // 数组里的 Date 也要被转换
        typeof list[0] === 'number' &&
        list[0] === Date.parse('2026-10-09T00:00:00.000Z') &&
        // 非 Date 的值不能被动：null 还是 null，ISO 字符串还是字符串
        d.nullAt === null &&
        d.text === '2026-10-07T16:14:40.000Z';

      if (!dateOk) failed += 1;
      console.log(dateOk ? '  ✔ 日期序列化断言通过' : '  ✘ 日期序列化断言失败');
    }

    console.log(`\n[${item.desc}]  GET /api/v1/demo/${item.path}  ->  HTTP ${res.status}`);
    console.log(JSON.stringify(body, null, 2));
  }

  await app.close();

  console.log(
    failed === 0
      ? `\n全部通过：${CASES.length} 种情况的响应体结构均符合规范\n`
      : `\n有 ${failed} 个用例不符合规范\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
