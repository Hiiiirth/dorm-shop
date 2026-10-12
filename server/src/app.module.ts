import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import configuration from './config/configuration';
import { ALL_ENTITIES } from './entities';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TraceIdMiddleware } from './common/middleware/trace-id.middleware';

import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { CategoryModule } from './modules/category/category.module';
import { HealthModule } from './modules/health/health.module';
import { HomeModule } from './modules/home/home.module';
import { OrderModule } from './modules/order/order.module';
import { ProductModule } from './modules/product/product.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [configuration],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql' as const,
        host: config.get<string>('db.host'),
        port: config.get<number>('db.port'),
        username: config.get<string>('db.username'),
        password: config.get<string>('db.password'),
        database: config.get<string>('db.database'),
        entities: ALL_ENTITIES,
        // 开发期可置 true 自动建表；正式环境必须用 db/01-schema.sql，保持 false
        synchronize: config.get<boolean>('db.synchronize'),
        logging: config.get<boolean>('db.logging'),
        timezone: '+08:00',
        charset: 'utf8mb4',
      }),
    }),

    HealthModule,
    AuthModule,
    UserModule,
    CategoryModule,
    ProductModule,
    HomeModule,
    CartModule,
    OrderModule,
    AdminModule,
  ],
  providers: [
    // 全局登录守卫（@Public() 可放行）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 全局身份守卫（@Roles() 生效）
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // traceId 必须最早注入，守卫抛错时也能带上
    consumer.apply(TraceIdMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
