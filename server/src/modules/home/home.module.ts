import { Module } from '@nestjs/common';
import { CategoryModule } from '../category/category.module';
import { ProductModule } from '../product/product.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [CategoryModule, ProductModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
