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

  body { padding: 0; }

  .wewe-reader-shell {
    min-height: 100%;
    padding: 16px 16px 48px;
  }

  .wewe-reader-article {
    max-width: min(720px, 100%);
    width: 100%;
    margin: 0 auto;
    background: var(--wewe-paper);
    border: 1px solid var(--wewe-border);
    border-radius: 16px;
    padding: 28px 32px 36px;
    box-shadow: 0 1px 2px rgba(26,25,21,0.04), 0 12px 32px rgba(26,25,21,0.05);
    /* 正文字重：不要默认加粗 */
    font-weight: 400 !important;
    color: var(--wewe-text);
  }

  .wewe-reader-article,
  .wewe-reader-article * {
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

  /* 纯文字：左对齐更易读，避免居中导致“假加粗/难看” */
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
    margin: 0.85em 0;
    line-height: 1.9;
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
    background: #f0eee6;
    box-shadow: 0 2px 10px rgba(26, 25, 21, 0.05);
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
    background: #fff;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(26, 25, 21, 0.04);
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
          `${base}/articles/${article.id}/content?v=4`,
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

  const srcDoc = useMemo(() => {
    if (!data?.content) return '';

    // 后端有时会包一层 html/body，尽量只取正文
    let bodyHtml = data.content;
    const bodyMatch = bodyHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      bodyHtml = bodyMatch[1];
    }
    // 去掉后端旧版内联 style 壳，避免和阅读器主题冲突
    bodyHtml = bodyHtml.replace(
      /^<html[^>]*>\s*<head>[\s\S]*?<\/head>\s*<body[^>]*>/i,
      '',
    );

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
    <article class="wewe-reader-article">
      ${bodyHtml}
    </article>
  </div>
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

  const title = data?.title || article.title;
  const publishTime = data?.publishTime || article.publishTime;
  const sourceUrl =
    data?.sourceUrl || `https://mp.weixin.qq.com/s/${article.id}`;

  return (
    <div className="h-full flex flex-col min-w-0 bg-[var(--claude-canvas)]">
      <div className="px-4 py-3 border-b border-[var(--claude-border)] flex items-start gap-3 shrink-0 bg-[var(--claude-paper)]">
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold leading-snug break-words tracking-tight text-[var(--claude-ink)]">
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

        {!loading && !error && data ? (
          <iframe
            title={title}
            className="w-full h-full border-0 bg-[var(--claude-canvas)]"
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            srcDoc={srcDoc}
          />
        ) : null}
      </div>
    </div>
  );
};

export default ArticleReader;
