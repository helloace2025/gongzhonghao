import { Module } from '@nestjs/common';
import { FeedsController } from './feeds.controller';
import { ArticlesController } from './articles.controller';
import { FeedsService } from './feeds.service';
import { PrismaModule } from '@server/prisma/prisma.module';
import { TrpcModule } from '@server/trpc/trpc.module';

@Module({
  imports: [PrismaModule, TrpcModule],
  controllers: [FeedsController, ArticlesController],
  providers: [FeedsService],
})
export class FeedsModule {}
