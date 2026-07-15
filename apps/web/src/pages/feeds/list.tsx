import { FC, useMemo } from 'react';
import { Button, Spinner } from '@nextui-org/react';
import { trpc } from '@web/utils/trpc';
import dayjs from 'dayjs';
import { useParams } from 'react-router-dom';

export type ArticleListItem = {
  id: string;
  title: string;
  publishTime: number;
  picUrl?: string;
  mpId?: string;
};

type Props = {
  selectedId?: string | null;
  onSelect?: (article: ArticleListItem) => void;
};

const ArticleList: FC<Props> = ({ selectedId, onSelect }) => {
  const { id } = useParams();

  const mpId = id || '';

  const { data, fetchNextPage, isLoading, hasNextPage, isFetchingNextPage } =
    trpc.article.list.useInfiniteQuery(
      {
        limit: 20,
        mpId: mpId,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );

  const items = useMemo(() => {
    const items = data
      ? data.pages.reduce(
          (acc, page) => [...acc, ...page.items],
          [] as ArticleListItem[],
        )
      : [];

    return items;
  }, [data]);

  return (
    <div className="h-full flex flex-col min-h-0 bg-[var(--claude-paper)]">
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner color="primary" />
          </div>
        ) : !items.length ? (
          <div className="text-center text-[var(--claude-muted)] text-sm py-10">
            暂无数据
          </div>
        ) : (
          <ul className="divide-y divide-[var(--claude-border)]">
            {items.map((item) => {
              const active = selectedId === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect?.(item)}
                    className={`w-full text-left px-3.5 py-3.5 transition-colors ${
                      active
                        ? 'bg-[var(--claude-accent-soft)] border-l-[3px] border-[var(--claude-accent)]'
                        : 'border-l-[3px] border-transparent hover:bg-[var(--claude-hover)]'
                    }`}
                  >
                    <div
                      className={`text-[13.5px] leading-snug line-clamp-2 tracking-tight font-normal ${
                        active
                          ? 'text-[var(--claude-accent)]'
                          : 'text-[var(--claude-ink)]'
                      }`}
                    >
                      {/* 部分公众号把首段塞进 title，列表只展示首行 */}
                      {item.title
                        .split(/\n+/)
                        .map((s) => s.trim())
                        .find(Boolean) || item.title}
                    </div>
                    <div className="mt-1.5 text-[11px] text-[var(--claude-muted)]">
                      {dayjs(item.publishTime * 1e3).format(
                        'YYYY-MM-DD HH:mm',
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {hasNextPage ? (
        <div className="p-2.5 border-t border-[var(--claude-border)] shrink-0">
          <Button
            className="w-full font-medium"
            isDisabled={isLoading || isFetchingNextPage}
            variant="flat"
            size="sm"
            radius="lg"
            onPress={() => {
              fetchNextPage();
            }}
          >
            {isFetchingNextPage ? <Spinner color="current" size="sm" /> : null}
            加载更多
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default ArticleList;
