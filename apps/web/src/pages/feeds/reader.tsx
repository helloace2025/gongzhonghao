import { FC, useEffect, useMemo, useState } from 'react';
import { Link, Spinner } from '@nextui-org/react';
import dayjs from 'dayjs';
import { serverOriginUrl } from '@web/utils/env';

export type ReaderArticleMeta = {
  id: string;
  title: string;
  publishTime?: number;
  picUrl?: string;
};

type ArticleContentResponse = {
  id: string;
  title: string;
  picUrl: string;
  publishTime: number;
  mpId: string;
  content: string;
  sourceUrl: string;
};

type Props = {
  article: ReaderArticleMeta | null;
};

/** 阅读器正文：Claude 暖色排版 + 统一图片 + 代码块 */
const READER_CSS = `
  :root {
    --wewe-bg: #f5f4ef;
    --wewe-paper: #fffcf7;
    --wewe-text: #1a1915;
    --wewe-muted: #6e6a5e;
    --wewe-accent: #c96442;
    --wewe-accent-soft: #f3e4dc;
    --wewe-border: #e5e3d9;
    --wewe-code-bg: #2a2925;
    --wewe-code-text: #f0eee6;
    --wewe-img-max: 720px;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: var(--wewe-bg);
    color: var(--wewe-text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
      "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    font-size: 17px;
    line-height: 1.85;
    letter-spacing: -0.01em;
    word-wrap: break-word;
    overflow-wrap: break-word;
    -webkit-font-smoothing: antialiased;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  html::-webkit-scrollbar,
  body::-webkit-scrollbar,
  *::-webkit-scrollbar {
    width: 0 !important;
    height: 0 !important;
    display: none !important;
  }

  body { padding: 0; font-weight: 400; font-synthesis: none; }

  .wewe-reader-shell {
    min-height: 100%;
    padding: 16px 16px 40px;
  }

  /* 纯文字正文：不套厚重「纸卡」，避免文末多出一块空白长方形 */
  .wewe-reader-article {
    max-width: min(720px, 100%);
    width: 100%;
    margin: 0 auto;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 8px 20px 24px;
    box-shadow: none;
    font-weight: 400 !important;
    font-size: 16px;
    color: var(--wewe-text);
    font-synthesis: none;
  }

  .wewe-reader-article,
  .wewe-reader-article p,
  .wewe-reader-article section,
  .wewe-reader-article span,
  .wewe-reader-article li,
  .wewe-reader-article div,
  .wewe-reader-article a {
    font-weight: 400 !important;
    font-synthesis: none;
  }

  .wewe-reader-article strong,
  .wewe-reader-article b {
    font-weight: 400 !important;
  }

  .wewe-reader-article h1,
  .wewe-reader-article h2,
  .wewe-reader-article h3,
  .wewe-reader-article h4 {
    font-weight: 600 !important;
    color: var(--wewe-text);
    line-height: 1.4;
    margin: 1.25em 0 0.6em;
    text-align: left;
  }

  .wewe-reader-article,
  .wewe-reader-article p,
  .wewe-reader-article section,
  .wewe-reader-article span,
  .wewe-reader-article li,
  .wewe-reader-article div {
    text-align: left;
  }

  .wewe-reader-article p,
  .wewe-reader-article section {
    margin: 0.75em 0;
    line-height: 1.85;
  }

  .wewe-reader-article a {
    color: var(--wewe-accent);
    text-decoration: underline;
    text-underline-offset: 2px;
    font-weight: 400 !important;
  }

  /* 空壳 / 无 src 图片 / 无内容卡片 不占位 */
  .wewe-reader-article img:not([src]),
  .wewe-reader-article img[src=""],
  .wewe-reader-article img[src="#"],
  .wewe-reader-article .wewe-link-card:empty,
  .wewe-reader-article section:empty,
  .wewe-reader-article div:empty,
  .wewe-reader-article p:empty {
    display: none !important;
  }

  /* 纯文字文：隐藏空卡片、空 section 白块 */
  .wewe-reader-article .wewe-link-card:not(:has(*:not(:empty))),
  .wewe-reader-article section:not(:has(img, video, iframe, table, pre, a)):not(:has(:not(:empty))) {
    display: none !important;
  }

  .wewe-reader-article img,
  .wewe-reader-article .wewe-img {
    display: block !important;
    width: auto !important;
    max-width: min(100%, var(--wewe-img-max)) !important;
    max-height: 520px !important;
    height: auto !important;
    margin: 18px auto !important;
    border-radius: 12px;
    object-fit: contain !important;
    background: transparent;
    box-shadow: none;
  }

  /* 图片加载失败时不留灰底方块 */
  .wewe-reader-article img.wewe-img-broken {
    display: none !important;
  }

  video {
    display: block;
    max-width: min(100%, var(--wewe-img-max));
    margin: 18px auto;
    border-radius: 12px;
  }

  .wewe-reader-article pre,
  .wewe-reader-article pre.wewe-code-block,
  .wewe-reader-article .code-snippet,
  .wewe-reader-article .code-snippet__fix {
    text-align: left !important;
    display: block;
    max-width: 100%;
    margin: 18px auto;
    padding: 14px 16px;
    overflow-x: auto;
    background: var(--wewe-code-bg) !important;
    color: var(--wewe-code-text) !important;
    border-radius: 12px;
    border: 1px solid #3a3732;
    font-size: 13.5px;
    line-height: 1.65;
    white-space: pre !important;
    word-break: normal;
    tab-size: 2;
  }

  .wewe-reader-article pre code,
  .wewe-reader-article code.wewe-code {
    text-align: left !important;
    background: transparent !important;
    color: inherit !important;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: inherit;
    white-space: pre !important;
    padding: 0;
  }

  .wewe-reader-article code.wewe-inline-code,
  .wewe-reader-article :not(pre) > code {
    text-align: left;
    display: inline;
    padding: 0.12em 0.4em;
    margin: 0 0.1em;
    font-size: 0.9em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    background: var(--wewe-accent-soft);
    color: var(--wewe-accent);
    border-radius: 5px;
    white-space: break-spaces;
  }

  .wewe-link-card {
    text-align: left !important;
    max-width: 640px;
    margin: 18px auto;
    border: 1px solid var(--wewe-border);
    border-radius: 12px;
    background: var(--wewe-paper);
    overflow: hidden;
    box-shadow: none;
  }

  /* 链接卡片若几乎无文字，直接隐藏（避免文末空长方形） */
  .wewe-link-card:has(.wewe-link-card__anchor:empty),
  .wewe-link-card:has(.wewe-link-card__title:empty):has(.wewe-link-card__desc:empty) {
    display: none !important;
  }

  .wewe-link-card__anchor {
    display: block;
    padding: 14px 16px;
    text-decoration: none !important;
    color: inherit !important;
  }

  .wewe-link-card__title {
    font-size: 15px;
    font-weight: 600;
    color: var(--wewe-accent);
    margin-bottom: 4px;
    text-align: left !important;
  }

  .wewe-link-card__desc {
    font-size: 13px;
    color: var(--wewe-muted);
    margin-bottom: 6px;
    text-align: left !important;
  }

  .wewe-link-card__url {
    font-size: 12px;
    color: #8f8a7c;
    word-break: break-all;
    text-align: left !important;
  }

  blockquote,
  .wewe-quote {
    text-align: left !important;
    margin: 16px auto;
    max-width: 85%;
    padding: 12px 16px;
    border-left: 3px solid var(--wewe-accent);
    background: var(--wewe-accent-soft);
    color: var(--wewe-muted);
    border-radius: 0 10px 10px 0;
  }

  .wewe-empty {
    text-align: center;
    color: var(--wewe-muted);
    padding: 24px 12px;
  }

  .rich_media_content,
  #js_content {
    color: inherit;
  }

  table {
    margin: 16px auto;
    border-collapse: collapse;
    max-width: 100%;
    font-size: 14px;
    text-align: left !important;
  }

  th, td {
    border: 1px solid var(--wewe-border);
    padding: 8px 10px;
  }
`;

const ArticleReader: FC<Props> = ({ article }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ArticleContentResponse | null>(null);

  useEffect(() => {
    if (!article?.id) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const base = serverOriginUrl || '';
        // bust cache after reader pipeline upgrade
        const res = await fetch(
          `${base}/articles/${article.id}/content?v=6`,
          {
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          throw new Error(`加载失败 (${res.status})`);
        }
        const json = (await res.json()) as ArticleContentResponse;
        if (!cancelled) {
          setData(json);
        }
      } catch (e: any) {
        if (cancelled || e?.name === 'AbortError') return;
        setError(e?.message || '加载正文失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [article?.id]);

  const plainTextLen = (html: string) =>
    html.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;

  const srcDoc = useMemo(() => {
    if (!data?.content || plainTextLen(data.content) < 8) return '';

    // 后端有时会包一层 html/body，尽量只取正文
    let bodyHtml = data.content;
    const bodyMatch = bodyHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      bodyHtml = bodyMatch[1];
    }
    // 去掉后端旧版内联 style 壳，避免和阅读器主题冲突
    bodyHtml = bodyHtml
      .replace(/^<html[^>]*>\s*<head>[\s\S]*?<\/head>\s*<body[^>]*>/i, '')
      .replace(/<\/body>\s*<\/html>\s*$/i, '');

    if (plainTextLen(bodyHtml) < 8) return '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base target="_blank" />
  <style>${READER_CSS}</style>
</head>
<body>
  <div class="wewe-reader-shell">
    <article class="wewe-reader-article wewe-text-only">
      ${bodyHtml}
    </article>
  </div>
  <script>
    (function () {
      // 隐藏裂图，避免灰/白方块
      document.querySelectorAll('img').forEach(function (img) {
        img.addEventListener('error', function () {
          img.classList.add('wewe-img-broken');
          img.removeAttribute('src');
        });
        if (img.complete && img.naturalWidth === 0 && img.src) {
          img.classList.add('wewe-img-broken');
        }
      });
      // 去掉文末无文字的空块（纯文字文章常见）
      function scrub() {
        document.querySelectorAll('section, div, p, .wewe-link-card').forEach(function (el) {
          if (el.closest('pre')) return;
          var text = (el.textContent || '').replace(/[\\u200b\\s]/g, '');
          var hasMedia = el.querySelector('img, video, iframe, pre, table, a[href]');
          if (!text && !hasMedia) el.remove();
        });
      }
      scrub();
      setTimeout(scrub, 50);
    })();
  </script>
</body>
</html>`;
  }, [data?.content]);

  if (!article) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--claude-muted)] text-sm px-6 text-center bg-[var(--claude-canvas)]">
        在中间列表点击文章标题，即可在此阅读
      </div>
    );
  }

  // 微信读书/纯文字文有时把整段正文塞进 title，标题只取首行
  const rawTitle = data?.title || article.title || '';
  const title =
    rawTitle
      .split(/\n+/)
      .map((s) => s.trim())
      .find(Boolean)
      ?.slice(0, 120) || rawTitle.slice(0, 120);
  const publishTime = data?.publishTime || article.publishTime;
  const sourceUrl =
    data?.sourceUrl || `https://mp.weixin.qq.com/s/${article.id}`;
  const hasBody = Boolean(srcDoc);

  return (
    <div className="h-full flex flex-col min-w-0 bg-[var(--claude-canvas)]">
      <div className="px-4 py-3 border-b border-[var(--claude-border)] flex items-start gap-3 shrink-0 bg-[var(--claude-paper)]">
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-medium leading-snug break-words tracking-tight text-[var(--claude-ink)]">
            {title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--claude-muted)]">
            {publishTime ? (
              <span>
                {dayjs(publishTime * 1e3).format('YYYY-MM-DD HH:mm')}
              </span>
            ) : null}
            <Link
              href={sourceUrl}
              target="_blank"
              size="sm"
              showAnchorIcon
              className="text-xs text-[var(--claude-accent)]"
            >
              打开原文
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner label="加载正文..." color="primary" />
          </div>
        ) : null}

        {error ? (
          <div className="p-6 text-sm text-danger">
            {error}
            <div className="mt-3">
              <Link href={sourceUrl} target="_blank" showAnchorIcon>
                改去微信原文阅读
              </Link>
            </div>
          </div>
        ) : null}

        {!loading && !error && data && hasBody ? (
          <iframe
            title={title}
            className="w-full h-full border-0 bg-[var(--claude-canvas)]"
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-scripts"
            srcDoc={srcDoc}
          />
        ) : null}

        {!loading && !error && data && !hasBody ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="text-sm text-[var(--claude-muted)] font-normal leading-relaxed max-w-md">
              未能解析正文（常见于纯文字或特殊版式文章）。请打开微信原文阅读。
            </p>
            <Link href={sourceUrl} target="_blank" showAnchorIcon>
              打开原文
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ArticleReader;
