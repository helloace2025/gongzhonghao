import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  Response,
} from '@nestjs/common';
import { FeedsService } from './feeds.service';
import { PrismaService } from '@server/prisma/prisma.service';
import { Response as Res } from 'express';

@Controller('articles')
export class ArticlesController {
  private readonly logger = new Logger(this.constructor.name);

  constructor(
    private readonly feedsService: FeedsService,
    private readonly prismaService: PrismaService,
  ) {}

  /**
   * 微信图片防盗链代理
   * 注意：必须声明在 :id/content 之前，避免被动态路由吞掉
   */
  @Get('proxy/image')
  async proxyImage(@Query('url') url: string, @Response() res: Res) {
    if (!url) {
      return res.status(400).send('missing url');
    }

    try {
      const { buffer, contentType } =
        await this.feedsService.fetchProxiedImage(url);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(buffer);
    } catch (e: any) {
      this.logger.warn(`proxyImage failed: ${url} -> ${e?.message || e}`);
      const status = e?.status || e?.statusCode || 502;
      return res.status(typeof status === 'number' ? status : 502).send('image proxy failed');
    }
  }

  @Get(':id/content')
  async getArticleContent(@Param('id') id: string) {
    this.logger.log(`getArticleContent: ${id}`);

    const article = await this.prismaService.article.findUnique({
      where: { id },
    });

    const content = await this.feedsService.getReaderContent(id);

    return {
      id,
      title: article?.title ?? '',
      picUrl: article?.picUrl ?? '',
      publishTime: article?.publishTime ?? 0,
      mpId: article?.mpId ?? '',
      content,
      sourceUrl: `https://mp.weixin.qq.com/s/${id}`,
    };
  }
}
