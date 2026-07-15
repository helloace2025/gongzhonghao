import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@server/prisma/prisma.service';
import { Cron } from '@nestjs/schedule';
import { TrpcService } from '@server/trpc/trpc.service';
import { feedMimeTypeMap, feedTypes } from '@server/constants';
import { ConfigService } from '@nestjs/config';
import { Article, Feed as FeedInfo } from '@prisma/client';
import { ConfigurationType } from '@server/configuration';
import { Feed, Item } from 'feed';
import got, { Got } from 'got';
import { load } from 'cheerio';
import { minify } from 'html-minifier';
import { LRUCache } from 'lru-cache';
import pMap from '@cjs-exporter/p-map';

console.log('CRON_EXPRESSION: ', process.env.CRON_EXPRESSION);

const mpCache = new LRUCache<string, string>({
  max: 5000,
});

@Injectable()
export class FeedsService {
  private readonly logger = new Logger(this.constructor.name);

  private request: Got;
  constructor(
    private readonly prismaService: PrismaService,
    private readonly trpcService: TrpcService,
    private readonly configService: ConfigService,
  ) {
    this.request = got.extend({
      retry: {
        limit: 3,
        methods: ['GET'],
      },
      timeout: 8 * 1e3,
      headers: {
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'max-age=0',
        'sec-ch-ua':
          '" Not A;Brand";v="99", "Chromium";v="101", "Google Chrome";v="101"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36',
      },
      hooks: {
        beforeRetry: [
          async (options, error, retryCount) => {
            this.logger.warn(`retrying ${options.url}...`);
            return new Promise((resolve) =>
              setTimeout(resolve, 2e3 * (retryCount || 1)),
            );
          },
        ],
      },
    });
  }

  @Cron(process.env.CRON_EXPRESSION || '35 5,17 * * *', {
    name: 'updateFeeds',
    timeZone: 'Asia/Shanghai',
  })
  async handleUpdateFeedsCron() {
    this.logger.debug('Called handleUpdateFeedsCron');

    const feeds = await this.prismaService.feed.findMany({
      where: { status: 1 },
    });
    this.logger.debug('feeds length:' + feeds.length);

    const updateDelayTime =
      this.configService.get<ConfigurationType['feed']>(
        'feed',
      )!.updateDelayTime;

    for (const feed of feeds) {
      this.logger.debug('feed', feed.id);
      try {
        await this.trpcService.refreshMpArticlesAndUpdateFeed(feed.id);

        await new Promise((resolve) =>
          setTimeout(resolve, updateDelayTime * 1e3),
        );
      } catch (err) {
        this.logger.error('handleUpdateFeedsCron error', err);
      } finally {
        // wait 30s for next feed
        await new Promise((resolve) => setTimeout(resolve, 30 * 1e3));
      }
    }
  }

  private isAllowedWechatMediaHost(hostname: string) {
    const host = hostname.toLowerCase();
    return (
      host === 'mmbiz.qpic.cn' ||
      host.endsWith('.qpic.cn') ||
      host.endsWith('.qlogo.cn') ||
      host.endsWith('.weixin.qq.com') ||
      host.endsWith('.wechat.com')
    );
  }

  /** 代理拉取微信图片，带上正确 Referer 绕过防盗链 */
  async fetchProxiedImage(rawUrl: string): Promise<{
    buffer: Buffer;
    contentType: string;
  }> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new HttpException('无效的图片地址', HttpStatus.BAD_REQUEST);
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new HttpException('不支持的协议', HttpStatus.BAD_REQUEST);
    }

    if (!this.isAllowedWechatMediaHost(parsed.hostname)) {
      throw new HttpException('不允许的图片域名', HttpStatus.FORBIDDEN);
    }

    const response = await this.request(parsed.toString(), {
      responseType: 'buffer',
      headers: {
        Referer: 'https://mp.weixin.qq.com/',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    const contentType =
      response.headers['content-type']?.toString() || 'image/jpeg';

    return {
      buffer: response.body as Buffer,
      contentType,
    };
  }

  /** 把正文里的微信图片改写到本地代理，解决阅读器防盗链 */
  rewriteMediaForReader(html: string) {
    const feedCfg =
      this.configService.get<ConfigurationType['feed']>('feed')!;
    const serverCfg =
      this.configService.get<ConfigurationType['server']>('server')!;
    // srcdoc iframe 内相对路径会失效，必须用绝对地址
    const origin =
      feedCfg.originUrl ||
      `http://127.0.0.1:${serverCfg.port || 4000}`;

    const $ = load(html, { decodeEntities: false });

    const toProxy = (src?: string | null) => {
      if (!src) return null;
      const trimmed = src.trim();
      if (
        !trimmed ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('blob:') ||
        trimmed.includes('/articles/proxy/image')
      ) {
        return null;
      }
      try {
        const u = new URL(trimmed, 'https://mp.weixin.qq.com');
        if (!this.isAllowedWechatMediaHost(u.hostname)) {
          return null;
        }
        return `${origin.replace(/\/$/, '')}/articles/proxy/image?url=${encodeURIComponent(u.toString())}`;
      } catch {
        return null;
      }
    };

    $('img').each((_, el) => {
      const node = $(el);
      const src = node.attr('src') || node.attr('data-src') || node.attr('data-original');
      const proxied = toProxy(src);
      if (proxied) {
        node.attr('src', proxied);
      }
      node.removeAttr('data-src');
      node.removeAttr('data-original');
      node.attr('referrerpolicy', 'no-referrer');
      node.attr('loading', 'lazy');
      // 微信常把真实尺寸写在 data-ratio，清理可能的 0 宽高
      const w = node.attr('width');
      const h = node.attr('height');
      if (w === '0') node.removeAttr('width');
      if (h === '0') node.removeAttr('height');
    });

    // 处理 style 里的 background-image
    $('[style*="url("]').each((_, el) => {
      const node = $(el);
      const style = node.attr('style') || '';
      const next = style.replace(
        /url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi,
        (match, quote, url) => {
          const proxied = toProxy(url);
          return proxied ? `url(${quote || ''}${proxied}${quote || ''})` : match;
        },
      );
      if (next !== style) {
        node.attr('style', next);
      }
    });

    // source / video poster
    $('source').each((_, el) => {
      const node = $(el);
      const src = node.attr('src');
      const proxied = toProxy(src);
      if (proxied) node.attr('src', proxied);
    });
    $('video').each((_, el) => {
      const node = $(el);
      const poster = node.attr('poster');
      const proxied = toProxy(poster);
      if (proxied) node.attr('poster', proxied);
    });

    return $.html();
  }

  async cleanHtml(source: string) {
    const $ = load(source, { decodeEntities: false });

    const contentNode =
      $('.rich_media_content').first().length > 0
        ? $('.rich_media_content').first()
        : $('#js_content').first();

    const dirtyHtml = contentNode.length ? $.html(contentNode) : '';

    const html = dirtyHtml
      .replace(/data-src=/g, 'src=')
      .replace(/opacity: 0( !important)?;/g, '')
      .replace(/visibility: hidden;/g, '');

    const content =
      '<style> .rich_media_content,#js_content {overflow: hidden;color: #222;font-size: 17px;word-wrap: break-word;-webkit-hyphens: auto;-ms-hyphens: auto;hyphens: auto;text-align: justify;position: relative;z-index: 0;}.rich_media_content,#js_content {font-size: 18px;} img{max-width:100%;height:auto;display:block;margin:12px auto;} </style>' +
      html;

    const result = minify(content, {
      removeAttributeQuotes: true,
      collapseWhitespace: true,
    });

    return result;
  }

  /**
   * 阅读器专用清洗：保留代码块空白，还原微信特殊组件（代码块/链接卡片等）
   * 注意：不能对 pre/code 做 collapseWhitespace，否则代码库内容会丢
   */
  prepareReaderHtml(source: string): string {
    const $ = load(source, {
      decodeEntities: false,
      // 保留正文结构，便于处理微信自定义标签
      xmlMode: false,
    });

    // 去掉脚本，避免污染正文
    $('script').remove();

    const contentNode =
      $('.rich_media_content').first().length > 0
        ? $('.rich_media_content').first()
        : $('#js_content').first();

    if (!contentNode.length) {
      return '';
    }

    // lazy 资源
    contentNode.find('[data-src]').each((_, el) => {
      const node = $(el);
      if (!node.attr('src')) {
        node.attr('src', node.attr('data-src') || '');
      }
    });

    // 取消微信隐藏样式（会影响代码块显示）
    contentNode.find('[style]').each((_, el) => {
      const node = $(el);
      const style = node.attr('style') || '';
      const cls =
        `${node.attr('class') || ''} ${node.parent().attr('class') || ''}`;
      const isCodeLike = /code|pre|snippet|highlight|prettyprint/i.test(cls);
      const hasText = (node.text() || '').trim().length > 0;
      let next = style
        .replace(/opacity\s*:\s*0\s*(!important)?;?/gi, '')
        .replace(/visibility\s*:\s*hidden\s*;?/gi, '');
      if (isCodeLike || hasText) {
        next = next.replace(/display\s*:\s*none\s*;?/gi, isCodeLike ? 'display:block;' : '');
      }
      if (next !== style) node.attr('style', next);
    });

    // --- 微信代码块 / 代码库 ---
    // 1) 标准 pre/code
    contentNode.find('pre').each((_, el) => {
      const node = $(el);
      node.addClass('wewe-code-block');
      // 去掉行号列表干扰（若有并列 ul）
      node.find('.code-snippet__line-index').remove();
      let text = node.text();
      // 若 pre 被压成一行空内容，尝试从 code 子节点拼
      if (!text.trim()) {
        const chunks: string[] = [];
        node.find('code, .code-snippet_line, li, span[leaf]').each((__, line) => {
          const t = $(line).text();
          if (t != null) chunks.push(t);
        });
        text = chunks.join('\n');
      }
      if (text.trim()) {
        // 规范化为干净 pre>code，避免微信复杂 DOM 在 iframe 里丢样式/丢字
        const code = $('<code class="wewe-code"></code>');
        code.text(text.replace(/\u00a0/g, ' '));
        const pre = $('<pre class="wewe-code-block"></pre>');
        pre.append(code);
        node.replaceWith(pre);
      }
    });

    // 2) code-snippet 容器（无 pre 时）
    contentNode
      .find(
        '.code-snippet, .code-snippet__fix, section.code-snippet__fix, [class*="code-snippet"]',
      )
      .each((_, el) => {
        const node = $(el);
        if (node.closest('pre.wewe-code-block').length) return;
        if (node.find('pre.wewe-code-block').length) return;

        const lines: string[] = [];
        const lineNodes = node.find(
          '.code-snippet_line, .code-snippet__line, li, code span, span[leaf]',
        );
        if (lineNodes.length) {
          lineNodes.each((__, line) => {
            lines.push($(line).text());
          });
        } else {
          lines.push(node.text());
        }
        const text = lines.join('\n').replace(/\u00a0/g, ' ').trim();
        if (!text) return;

        const code = $('<code class="wewe-code"></code>');
        code.text(text);
        const pre = $('<pre class="wewe-code-block"></pre>');
        pre.append(code);
        node.replaceWith(pre);
      });

    // 3) 仅有 code 标签、外包一层
    contentNode.find('code').each((_, el) => {
      const node = $(el);
      if (node.closest('pre').length) return;
      const text = node.text().replace(/\u00a0/g, ' ');
      // 多行才当代码块，单行行内 code 保留
      if (!text.includes('\n') && text.length < 80) {
        node.addClass('wewe-inline-code');
        return;
      }
      const code = $('<code class="wewe-code"></code>');
      code.text(text);
      const pre = $('<pre class="wewe-code-block"></pre>');
      pre.append(code);
      node.replaceWith(pre);
    });

    // --- 链接卡片 / 仓库引用（常被 JS 渲染，静态页只剩空壳或 a）---
    const promoteLinkCard = (
      href: string,
      title: string,
      desc?: string,
    ) => {
      const safeHref = href.trim();
      if (!safeHref) return null;
      const card = $(
        '<div class="wewe-link-card"><a class="wewe-link-card__anchor" target="_blank" rel="noopener noreferrer"></a></div>',
      );
      const a = card.find('a');
      a.attr('href', safeHref);
      const titleEl = $('<div class="wewe-link-card__title"></div>').text(
        title || safeHref,
      );
      a.append(titleEl);
      if (desc) {
        a.append($('<div class="wewe-link-card__desc"></div>').text(desc));
      }
      a.append(
        $('<div class="wewe-link-card__url"></div>').text(safeHref),
      );
      return card;
    };

    // github / gitee / gitlab 链接提出来做卡片
    contentNode.find('a[href]').each((_, el) => {
      const node = $(el);
      const href = node.attr('href') || '';
      if (
        !/github\.com|gitee\.com|gitlab\.com|gitcode\.net|bitbucket\.org/i.test(
          href,
        )
      ) {
        return;
      }
      // 已在卡片内跳过
      if (node.closest('.wewe-link-card').length) return;
      const title =
        node.attr('data-title') ||
        node.attr('title') ||
        node.text().trim() ||
        href;
      const card = promoteLinkCard(href, title);
      if (card) {
        // 若父级几乎只有这一个链接，替换父级，避免重复
        const parent = node.parent();
        if (parent.length && parent.text().trim() === node.text().trim()) {
          parent.replaceWith(card);
        } else {
          node.replaceWith(card);
        }
      }
    });

    // 处理带 data-url / data-link 的卡片壳
    contentNode.find('[data-url], [data-link], [data-srcurl]').each((_, el) => {
      const node = $(el);
      if (node.closest('.wewe-link-card, pre, a').length) return;
      const href =
        node.attr('data-url') ||
        node.attr('data-link') ||
        node.attr('data-srcurl') ||
        '';
      if (!/^https?:\/\//i.test(href)) return;
      if (
        !/github\.com|gitee\.com|gitlab\.com|gitcode|mp\.weixin\.qq\.com/i.test(
          href,
        ) &&
        !node.is('section, div')
      ) {
        return;
      }
      const title =
        node.attr('data-title') ||
        node.find('.js_title, .title, strong').first().text().trim() ||
        node.text().replace(/\s+/g, ' ').trim().slice(0, 80) ||
        href;
      const card = promoteLinkCard(href, title);
      if (card && !(node.text() || '').trim().length) {
        node.replaceWith(card);
      } else if (card && /github\.com|gitee\.com|gitlab\.com/i.test(href)) {
        node.replaceWith(card);
      }
    });

    // blockquote 标记
    contentNode.find('blockquote').addClass('wewe-quote');

    // 去掉宽高写死的属性，交给阅读器 CSS 统一控制图片尺寸
    contentNode.find('img').each((_, el) => {
      const node = $(el);
      const src = (node.attr('src') || '').trim();
      // 无有效 src 的空图占位（易形成白长条）
      if (
        !src ||
        src === '#' ||
        src.startsWith('data:image/svg') ||
        /placeholder|blank|transparent/i.test(src)
      ) {
        node.remove();
        return;
      }
      node.removeAttr('width');
      node.removeAttr('height');
      node.removeAttr('data-w');
      node.addClass('wewe-img');
    });

    // 去掉空链接卡片 / 空壳区块（纯文字文末常见无用白条）
    contentNode
      .find(
        '.wewe-link-card, section, div, p, span, mpprofile, mp-common-profile, iframe',
      )
      .each((_, el) => {
        const node = $(el);
        if (node.closest('pre, .wewe-code-block').length) return;
        const text = (node.text() || '').replace(/\u200b|\s/g, '');
        const hasMedia =
          node.find('img, video, iframe, pre, table').length > 0 ||
          node.is('img, video, iframe, pre, table');
        if (!text && !hasMedia) {
          node.remove();
        }
      });

    // 多轮清理嵌套空壳
    for (let i = 0; i < 3; i++) {
      contentNode.find('section, div, p').each((_, el) => {
        const node = $(el);
        if (node.closest('pre').length) return;
        const text = (node.text() || '').replace(/\u200b|\s/g, '');
        const hasMedia = node.find('img, video, iframe, pre, table').length > 0;
        if (!text && !hasMedia) node.remove();
      });
    }

    // 去掉行内强制加粗/字重样式，交给阅读器统一正文字重
    contentNode.find('[style]').each((_, el) => {
      const node = $(el);
      let style = node.attr('style') || '';
      const next = style
        .replace(/font-weight\s*:\s*[^;]+;?/gi, '')
        .replace(/font-family\s*:\s*[^;]+;?/gi, '');
      if (next !== style) {
        if (next.replace(/\s|;/g, '')) node.attr('style', next);
        else node.removeAttr('style');
      }
    });
    // strong/b 降为普通语义，避免全文“假加粗”
    contentNode.find('strong, b').each((_, el) => {
      const node = $(el);
      node.replaceWith(`<span>${node.html() || node.text()}</span>`);
    });

    // 输出：仅正文内部 HTML，样式由前端 iframe 注入
    let html = contentNode.html() || '';
    html = html
      .replace(/data-src=/g, 'src=')
      .replace(/\u200b/g, '');

    return html;
  }

  async getHtmlByUrl(url: string) {
    const html = await this.request(url, { responseType: 'text' }).text();
    if (
      this.configService.get<ConfigurationType['feed']>('feed')!.enableCleanHtml
    ) {
      const result = await this.cleanHtml(html);
      return result;
    }

    return html;
  }

  async tryGetContent(id: string) {
    let content = mpCache.get(id);
    if (content) {
      return content;
    }
    const url = `https://mp.weixin.qq.com/s/${id}`;
    content = await this.getHtmlByUrl(url).catch((e) => {
      this.logger.error(`getHtmlByUrl(${url}) error: ${e.message}`);

      return '获取全文失败，请重试~';
    });
    mpCache.set(id, content);
    return content;
  }

  /**
   * 微信「纯文字/特殊版式」文章（item_show_type=10 等）没有 #js_content，
   * 正文在页面脚本的 content_noencode 字段里（含 \x0a、\x3c 等转义）。
   */
  extractWechatContentNoencode(rawHtml: string): string {
    if (!rawHtml) return '';
    const m =
      rawHtml.match(/content_noencode\s*:\s*'((?:\\'|[^'])*)'/) ||
      rawHtml.match(/content_noencode\s*:\s*"((?:\\"|[^"])*)"/);
    if (!m?.[1]) return '';

    let text = m[1]
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\t/g, '\t')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');

    // 去掉 script，按空行分段成正常正文（可含内联 a 等标签）
    let safe = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    const paragraphs = safe
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n/g, '').trim())
      .filter(Boolean);
    if (!paragraphs.length) {
      const one = safe.replace(/\s+/g, ' ').trim();
      return one
        ? /<\/?[a-z]/i.test(one)
          ? `<p>${one}</p>`
          : `<p>${this.escapeHtml(one)}</p>`
        : '';
    }
    return paragraphs
      .map((p) => {
        // 已含标签则保留（微信纯文字里常见内嵌 a），否则转义后包段落
        if (/<\/?[a-z][\s\S]*>/i.test(p)) {
          return `<p>${p}</p>`;
        }
        return `<p>${this.escapeHtml(p)}</p>`;
      })
      .join('');
  }

  private escapeHtml(s: string) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 统计可读中文/正文长度（忽略 style/script 与标签） */
  private readableTextLen(html: string) {
    if (!html) return 0;
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, '')
      .trim().length;
  }

  /** 阅读器专用：始终清洗正文 HTML，并改写图片到本地代理 */
  async getReaderContent(id: string) {
    // v6：content_noencode 分段段落；去空壳白块；正常字重
    const cacheKey = `reader:v6:${id}`;
    const cached = mpCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const url = `https://mp.weixin.qq.com/s/${id}`;
    try {
      const rawHtml = await this.request(url, { responseType: 'text' }).text();
      let cleaned = this.prepareReaderHtml(rawHtml);

      if (this.readableTextLen(cleaned) < 20) {
        const legacy = await this.cleanHtml(rawHtml);
        if (this.readableTextLen(legacy) >= 20) {
          cleaned = legacy;
        }
      }

      if (this.readableTextLen(cleaned) < 20) {
        // 纯文字/特殊版式：从 content_noencode 还原
        const plain = this.extractWechatContentNoencode(rawHtml);
        if (this.readableTextLen(plain) >= 20) {
          cleaned = plain;
          this.logger.log(
            `getReaderContent(${id}) using content_noencode fallback, len=${plain.length}`,
          );
        }
      }

      if (this.readableTextLen(cleaned) < 20) {
        // 空内容：不返回装饰性空壳，前端据此隐藏白块
        mpCache.set(cacheKey, '');
        return '';
      }

      cleaned = this.rewriteMediaForReader(cleaned);
      // rewriteMediaForReader 可能包一层 html/body，这里再剥回正文，避免双层纸卡
      const $ = load(cleaned, { decodeEntities: false });
      const bodyHtml = $('body').length ? $('body').html() || cleaned : cleaned;
      // 去掉仅剩的空壳
      const $body = load(`<div id="r">${bodyHtml}</div>`, {
        decodeEntities: false,
      });
      $body('#r')
        .find('section, div, p, span, .wewe-link-card')
        .each((_, el) => {
          const node = $body(el);
          if (node.closest('pre').length) return;
          const t = (node.text() || '').replace(/\u200b|\s/g, '');
          const hasMedia =
            node.find('img, video, iframe, pre, table, a').length > 0;
          if (!t && !hasMedia) node.remove();
        });
      // 去掉纯 style 残留
      $body('#r').find('style').remove();
      cleaned = $body('#r').html() || bodyHtml;

      mpCache.set(cacheKey, cleaned);
      return cleaned;
    } catch (e: any) {
      this.logger.error(`getReaderContent(${url}) error: ${e.message}`);
      return '';
    }
  }

  async renderFeed({
    type,
    feedInfo,
    articles,
    mode,
  }: {
    type: string;
    feedInfo: FeedInfo;
    articles: Article[];
    mode?: string;
  }) {
    const { originUrl, mode: globalMode } =
      this.configService.get<ConfigurationType['feed']>('feed')!;

    const link = `${originUrl}/feeds/${feedInfo.id}.${type}`;

    const feed = new Feed({
      title: feedInfo.mpName,
      description: feedInfo.mpIntro,
      id: link,
      link: link,
      language: 'zh-cn', // optional, used only in RSS 2.0, possible values: http://www.w3.org/TR/REC-html40/struct/dirlang.html#langcodes
      image: feedInfo.mpCover,
      favicon: feedInfo.mpCover,
      copyright: '',
      updated: new Date(feedInfo.updateTime * 1e3),
      generator: 'WeWe-RSS',
      author: { name: feedInfo.mpName },
    });

    feed.addExtension({
      name: 'generator',
      objects: `WeWe-RSS`,
    });

    const feeds = await this.prismaService.feed.findMany({
      select: { id: true, mpName: true },
    });

    /**mode 高于 globalMode。如果 mode 值存在，取 mode 值*/
    const enableFullText =
      typeof mode === 'string'
        ? mode === 'fulltext'
        : globalMode === 'fulltext';

    const showAuthor = feedInfo.id === 'all';

    const mapper = async (item) => {
      const { title, id, publishTime, picUrl, mpId } = item;
      const link = `https://mp.weixin.qq.com/s/${id}`;

      const mpName = feeds.find((item) => item.id === mpId)?.mpName || '-';
      const published = new Date(publishTime * 1e3);

      let content = '';
      if (enableFullText) {
        content = await this.tryGetContent(id);
      }

      feed.addItem({
        id,
        title,
        link: link,
        guid: link,
        content,
        date: published,
        image: picUrl,
        author: showAuthor ? [{ name: mpName }] : undefined,
      });
    };

    await pMap(articles, mapper, { concurrency: 2, stopOnError: false });

    return feed;
  }

  async handleGenerateFeed({
    id,
    type,
    limit,
    page,
    mode,
    title_include,
    title_exclude,
  }: {
    id?: string;
    type: string;
    limit: number;
    page: number;
    mode?: string;
    title_include?: string;
    title_exclude?: string;
  }) {
    if (!feedTypes.includes(type as any)) {
      type = 'atom';
    }

    let articles: Article[];
    let feedInfo: FeedInfo;
    if (id) {
      feedInfo = (await this.prismaService.feed.findFirst({
        where: { id },
      }))!;

      if (!feedInfo) {
        throw new HttpException('不存在该feed！', HttpStatus.BAD_REQUEST);
      }

      articles = await this.prismaService.article.findMany({
        where: { mpId: id },
        orderBy: { publishTime: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      });
    } else {
      articles = await this.prismaService.article.findMany({
        orderBy: { publishTime: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      });

      const { originUrl } =
        this.configService.get<ConfigurationType['feed']>('feed')!;
      feedInfo = {
        id: 'all',
        mpName: 'WeWe-RSS All',
        mpIntro: 'WeWe-RSS 全部文章',
        mpCover: originUrl
          ? `${originUrl}/favicon.ico`
          : 'https://r2-assets.111965.xyz/wewe-rss.png',
        status: 1,
        syncTime: 0,
        updateTime: Math.floor(Date.now() / 1e3),
        hasHistory: -1,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    this.logger.log('handleGenerateFeed articles: ' + articles.length);
    const feed = await this.renderFeed({ feedInfo, articles, type, mode });

    if (title_include) {
      const includes = title_include.split('|');
      feed.items = feed.items.filter((i: Item) =>
        includes.some((k) => i.title.includes(k)),
      );
    }
    if (title_exclude) {
      const excludes = title_exclude.split('|');
      feed.items = feed.items.filter(
        (i: Item) => !excludes.some((k) => i.title.includes(k)),
      );
    }

    switch (type) {
      case 'rss':
        return { content: feed.rss2(), mimeType: feedMimeTypeMap[type] };
      case 'json':
        return { content: feed.json1(), mimeType: feedMimeTypeMap[type] };
      case 'atom':
      default:
        return { content: feed.atom1(), mimeType: feedMimeTypeMap[type] };
    }
  }

  async getFeedList() {
    const data = await this.prismaService.feed.findMany();

    return data.map((item) => {
      return {
        id: item.id,
        name: item.mpName,
        intro: item.mpIntro,
        cover: item.mpCover,
        syncTime: item.syncTime,
        updateTime: item.updateTime,
      };
    });
  }

  async updateFeed(id: string) {
    try {
      await this.trpcService.refreshMpArticlesAndUpdateFeed(id);
    } catch (err) {
      this.logger.error('updateFeed error', err);
    } finally {
      // wait 30s for next feed
      await new Promise((resolve) => setTimeout(resolve, 30 * 1e3));
    }
  }
}
