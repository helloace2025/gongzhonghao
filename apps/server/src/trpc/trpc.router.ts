import { INestApplication, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { TrpcService } from '@server/trpc/trpc.service';
import * as trpcExpress from '@trpc/server/adapters/express';
import { TRPCError } from '@trpc/server';
import { PrismaService } from '@server/prisma/prisma.service';
import { statusMap, SEED_TAGS } from '@server/constants';

@Injectable()
export class TrpcRouter {
  constructor(
    private readonly trpcService: TrpcService,
    private readonly prismaService: PrismaService,
  ) {}

  private readonly logger = new Logger(this.constructor.name);

  /** 确保标签存在，返回 id 列表（按名称去重） */
  private async ensureTagsByNames(names: string[]) {
    const cleaned = [
      ...new Set(
        names
          .map((n) => (n || '').trim())
          .filter((n) => n.length > 0 && n.length <= 32),
      ),
    ];
    if (!cleaned.length) return [] as { id: string; name: string }[];

    const result: { id: string; name: string }[] = [];
    for (const name of cleaned) {
      const tag = await this.prismaService.tag.upsert({
        where: { name },
        create: { name },
        update: {},
      });
      result.push({ id: tag.id, name: tag.name });
    }
    return result;
  }

  /** 设置某公众号的标签（全量替换） */
  private async setFeedTags(feedId: string, tagNames: string[]) {
    const tags = await this.ensureTagsByNames(tagNames);
    await this.prismaService.feedTag.deleteMany({ where: { feedId } });
    for (const t of tags) {
      await this.prismaService.feedTag.create({
        data: { feedId, tagId: t.id },
      });
    }
    return tags;
  }

  private mapFeedWithTags<
    T extends {
      tags?: { tag: { id: string; name: string } }[];
    },
  >(feed: T) {
    const { tags, ...rest } = feed as any;
    return {
      ...rest,
      tags: (tags || []).map((ft: any) => ({
        id: ft.tag.id,
        name: ft.tag.name,
      })),
    };
  }

  accountRouter = this.trpcService.router({
    list: this.trpcService.protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(1000).nullish(),
          cursor: z.string().nullish(),
        }),
      )
      .query(async ({ input }) => {
        const limit = input.limit ?? 1000;
        const { cursor } = input;

        const items = await this.prismaService.account.findMany({
          take: limit + 1,
          where: {},
          select: {
            id: true,
            name: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            token: false,
          },
          cursor: cursor
            ? {
                id: cursor,
              }
            : undefined,
          orderBy: {
            createdAt: 'asc',
          },
        });
        let nextCursor: typeof cursor | undefined = undefined;
        if (items.length > limit) {
          // Remove the last item and use it as next cursor

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const nextItem = items.pop()!;
          nextCursor = nextItem.id;
        }

        const disabledAccounts = this.trpcService.getBlockedAccountIds();
        return {
          blocks: disabledAccounts,
          items,
          nextCursor,
        };
      }),
    byId: this.trpcService.protectedProcedure
      .input(z.string())
      .query(async ({ input: id }) => {
        const account = await this.prismaService.account.findUnique({
          where: { id },
        });
        if (!account) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `No account with id '${id}'`,
          });
        }
        return account;
      }),
    add: this.trpcService.protectedProcedure
      .input(
        z.object({
          id: z.string().min(1).max(32),
          token: z.string().min(1),
          name: z.string().min(1),
          status: z.number().default(statusMap.ENABLE),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const account = await this.prismaService.account.upsert({
          where: {
            id,
          },
          update: data,
          create: input,
        });
        this.trpcService.removeBlockedAccount(id);

        return account;
      }),
    edit: this.trpcService.protectedProcedure
      .input(
        z.object({
          id: z.string(),
          data: z.object({
            token: z.string().min(1).optional(),
            name: z.string().min(1).optional(),
            status: z.number().optional(),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, data } = input;
        const account = await this.prismaService.account.update({
          where: { id },
          data,
        });
        this.trpcService.removeBlockedAccount(id);
        return account;
      }),
    delete: this.trpcService.protectedProcedure
      .input(z.string())
      .mutation(async ({ input: id }) => {
        await this.prismaService.account.delete({ where: { id } });
        this.trpcService.removeBlockedAccount(id);

        return id;
      }),
  });

  feedRouter = this.trpcService.router({
    list: this.trpcService.protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(1000).nullish(),
          cursor: z.string().nullish(),
          /** 按标签名筛选；不传则返回全部 */
          tag: z.string().nullish(),
        }),
      )
      .query(async ({ input }) => {
        const limit = input.limit ?? 1000;
        const { cursor, tag } = input;

        const items = await this.prismaService.feed.findMany({
          take: limit + 1,
          where: tag
            ? {
                tags: {
                  some: {
                    tag: { name: tag },
                  },
                },
              }
            : {},
          cursor: cursor
            ? {
                id: cursor,
              }
            : undefined,
          include: {
            tags: {
              include: { tag: true },
            },
          },
          orderBy: [
            {
              sortOrder: 'asc',
            },
            {
              createdAt: 'asc',
            },
          ],
        });
        let nextCursor: typeof cursor | undefined = undefined;
        if (items.length > limit) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const nextItem = items.pop()!;
          nextCursor = nextItem.id;
        }

        return {
          items: items.map((f) => this.mapFeedWithTags(f)),
          nextCursor,
        };
      }),
    byId: this.trpcService.protectedProcedure
      .input(z.string())
      .query(async ({ input: id }) => {
        const feed = await this.prismaService.feed.findUnique({
          where: { id },
          include: {
            tags: { include: { tag: true } },
          },
        });
        if (!feed) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `No feed with id '${id}'`,
          });
        }
        return this.mapFeedWithTags(feed);
      }),
    add: this.trpcService.protectedProcedure
      .input(
        z.object({
          id: z.string(),
          mpName: z.string(),
          mpCover: z.string(),
          mpIntro: z.string(),
          syncTime: z
            .number()
            .optional()
            .default(Math.floor(Date.now() / 1e3)),
          updateTime: z.number(),
          status: z.number().default(statusMap.ENABLE),
          /** 导入时可选绑定标签名 */
          tags: z.array(z.string()).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, tags: tagNames, ...data } = input;
        const maxOrder = await this.prismaService.feed.aggregate({
          _max: { sortOrder: true },
        });
        const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;
        const { tags: _t, ...createData } = input as any;
        const feed = await this.prismaService.feed.upsert({
          where: {
            id,
          },
          update: data,
          create: {
            ...createData,
            sortOrder: nextOrder,
          },
        });

        if (tagNames?.length) {
          await this.setFeedTags(feed.id, tagNames);
        }

        const full = await this.prismaService.feed.findUnique({
          where: { id: feed.id },
          include: { tags: { include: { tag: true } } },
        });
        return this.mapFeedWithTags(full!);
      }),
    edit: this.trpcService.protectedProcedure
      .input(
        z.object({
          id: z.string(),
          data: z.object({
            mpName: z.string().optional(),
            mpCover: z.string().optional(),
            mpIntro: z.string().optional(),
            syncTime: z.number().optional(),
            updateTime: z.number().optional(),
            status: z.number().optional(),
            sortOrder: z.number().optional(),
            /** 传入则全量替换标签 */
            tags: z.array(z.string()).optional(),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, data } = input;
        const { tags: tagNames, ...rest } = data;
        const feed = await this.prismaService.feed.update({
          where: { id },
          data: rest,
        });
        if (tagNames) {
          await this.setFeedTags(id, tagNames);
        }
        const full = await this.prismaService.feed.findUnique({
          where: { id: feed.id },
          include: { tags: { include: { tag: true } } },
        });
        return this.mapFeedWithTags(full!);
      }),
    /** 仅更新某公众号的标签 */
    setTags: this.trpcService.protectedProcedure
      .input(
        z.object({
          id: z.string(),
          tags: z.array(z.string()),
        }),
      )
      .mutation(async ({ input }) => {
        const tags = await this.setFeedTags(input.id, input.tags);
        return { id: input.id, tags };
      }),
    /** 按传入 id 顺序批量更新 sortOrder */
    reorder: this.trpcService.protectedProcedure
      .input(
        z.object({
          orderedIds: z.array(z.string()).min(1),
        }),
      )
      .mutation(async ({ input }) => {
        const { orderedIds } = input;
        await this.prismaService.$transaction(
          orderedIds.map((feedId, index) =>
            this.prismaService.feed.update({
              where: { id: feedId },
              data: { sortOrder: index },
            }),
          ),
        );
        return { ok: true, count: orderedIds.length };
      }),
    delete: this.trpcService.protectedProcedure
      .input(z.string())
      .mutation(async ({ input: id }) => {
        await this.prismaService.feed.delete({ where: { id } });
        return id;
      }),

    refreshArticles: this.trpcService.protectedProcedure
      .input(
        z.object({
          mpId: z.string().optional(),
        }),
      )
      .mutation(async ({ input: { mpId } }) => {
        if (mpId) {
          await this.trpcService.refreshMpArticlesAndUpdateFeed(mpId);
        } else {
          await this.trpcService.refreshAllMpArticlesAndUpdateFeed();
        }
      }),

    isRefreshAllMpArticlesRunning: this.trpcService.protectedProcedure.query(
      async () => {
        return this.trpcService.isRefreshAllMpArticlesRunning;
      },
    ),
    getHistoryArticles: this.trpcService.protectedProcedure
      .input(
        z.object({
          mpId: z.string().optional(),
        }),
      )
      .mutation(async ({ input: { mpId = '' } }) => {
        this.trpcService.getHistoryMpArticles(mpId);
      }),
    getInProgressHistoryMp: this.trpcService.protectedProcedure.query(
      async () => {
        return this.trpcService.inProgressHistoryMp;
      },
    ),
  });

  articleRouter = this.trpcService.router({
    list: this.trpcService.protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(1000).nullish(),
          cursor: z.string().nullish(),
          mpId: z.string().nullish(),
        }),
      )
      .query(async ({ input }) => {
        const limit = input.limit ?? 1000;
        const { cursor, mpId } = input;

        const items = await this.prismaService.article.findMany({
          orderBy: [
            {
              publishTime: 'desc',
            },
          ],
          take: limit + 1,
          where: mpId ? { mpId } : undefined,
          cursor: cursor
            ? {
                id: cursor,
              }
            : undefined,
        });
        let nextCursor: typeof cursor | undefined = undefined;
        if (items.length > limit) {
          // Remove the last item and use it as next cursor

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const nextItem = items.pop()!;
          nextCursor = nextItem.id;
        }

        return {
          items,
          nextCursor,
        };
      }),
    byId: this.trpcService.protectedProcedure
      .input(z.string())
      .query(async ({ input: id }) => {
        const article = await this.prismaService.article.findUnique({
          where: { id },
        });
        if (!article) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `No article with id '${id}'`,
          });
        }
        return article;
      }),

    add: this.trpcService.protectedProcedure
      .input(
        z.object({
          id: z.string(),
          mpId: z.string(),
          title: z.string(),
          picUrl: z.string().optional().default(''),
          publishTime: z.number(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const article = await this.prismaService.article.upsert({
          where: {
            id,
          },
          update: data,
          create: input,
        });

        return article;
      }),
    delete: this.trpcService.protectedProcedure
      .input(z.string())
      .mutation(async ({ input: id }) => {
        await this.prismaService.article.delete({ where: { id } });
        return id;
      }),
  });

  platformRouter = this.trpcService.router({
    getMpArticles: this.trpcService.protectedProcedure
      .input(
        z.object({
          mpId: z.string(),
        }),
      )
      .mutation(async ({ input: { mpId } }) => {
        try {
          const results = await this.trpcService.getMpArticles(mpId);
          return results;
        } catch (err: any) {
          this.logger.log('getMpArticles err: ', err);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: err.response?.data?.message || err.message,
            cause: err.stack,
          });
        }
      }),
    getMpInfo: this.trpcService.protectedProcedure
      .input(
        z.object({
          wxsLink: z
            .string()
            .refine((v) => v.startsWith('https://mp.weixin.qq.com/s/')),
        }),
      )
      .mutation(async ({ input: { wxsLink: url } }) => {
        try {
          const results = await this.trpcService.getMpInfo(url);
          return results;
        } catch (err: any) {
          this.logger.log('getMpInfo err: ', err);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: err.response?.data?.message || err.message,
            cause: err.stack,
          });
        }
      }),

    createLoginUrl: this.trpcService.protectedProcedure.mutation(async () => {
      return this.trpcService.createLoginUrl();
    }),
    getLoginResult: this.trpcService.protectedProcedure
      .input(
        z.object({
          id: z.string(),
        }),
      )
      .query(async ({ input }) => {
        return this.trpcService.getLoginResult(input.id);
      }),
  });

  tagRouter = this.trpcService.router({
    /** 列出全部标签；首次会写入对标 PDF 种子标签 */
    list: this.trpcService.protectedProcedure.query(async () => {
      const count = await this.prismaService.tag.count();
      if (count === 0) {
        for (let i = 0; i < SEED_TAGS.length; i++) {
          await this.prismaService.tag.create({
            data: { name: SEED_TAGS[i], sortOrder: i },
          });
        }
      }
      return this.prismaService.tag.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    }),
    /** 手动写入/补齐种子标签（可重复调用） */
    seed: this.trpcService.protectedProcedure.mutation(async () => {
      let created = 0;
      for (let i = 0; i < SEED_TAGS.length; i++) {
        const name = SEED_TAGS[i];
        const before = await this.prismaService.tag.findUnique({
          where: { name },
        });
        await this.prismaService.tag.upsert({
          where: { name },
          create: { name, sortOrder: i },
          update: { sortOrder: i },
        });
        if (!before) created += 1;
      }
      const items = await this.prismaService.tag.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      return { created, total: items.length, items };
    }),
    create: this.trpcService.protectedProcedure
      .input(z.object({ name: z.string().min(1).max(32) }))
      .mutation(async ({ input }) => {
        const name = input.name.trim();
        return this.prismaService.tag.upsert({
          where: { name },
          create: { name },
          update: {},
        });
      }),
    delete: this.trpcService.protectedProcedure
      .input(z.string())
      .mutation(async ({ input: id }) => {
        await this.prismaService.tag.delete({ where: { id } });
        return id;
      }),
  });

  appRouter = this.trpcService.router({
    feed: this.feedRouter,
    account: this.accountRouter,
    article: this.articleRouter,
    platform: this.platformRouter,
    tag: this.tagRouter,
  });

  async applyMiddleware(app: INestApplication) {
    app.use(
      `/trpc`,
      trpcExpress.createExpressMiddleware({
        router: this.appRouter,
        createContext: () => {
          // AuthCode 门禁已移除，接口直接放行
          return {
            errorMsg: null,
          };
        },
        middleware: (req, res, next) => {
          next();
        },
      }),
    );
  }
}

export type AppRouter = TrpcRouter[`appRouter`];
