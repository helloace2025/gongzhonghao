import {
  Avatar,
  Button,
  Chip,
  Divider,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
  Textarea,
  Tooltip,
  useDisclosure,
  Link,
} from '@nextui-org/react';
import { PlusIcon } from '@web/components/PlusIcon';
import { trpc } from '@web/utils/trpc';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import ArticleList, { ArticleListItem } from './list';
import ArticleReader from './reader';

type FeedTag = { id: string; name: string };

type FeedItem = {
  id: string;
  mpName: string;
  mpCover: string;
  mpIntro: string;
  status: number;
  syncTime: number;
  updateTime: number;
  hasHistory?: number | null;
  sortOrder?: number;
  tags?: FeedTag[];
};

const Feeds = () => {
  const { id } = useParams();

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const {
    isOpen: isTagModalOpen,
    onOpen: onTagModalOpen,
    onOpenChange: onTagModalOpenChange,
    onClose: onTagModalClose,
  } = useDisclosure();

  /** 当前筛选标签；null = 全部 */
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  /** 导入公众号时勾选的标签 */
  const [importTags, setImportTags] = useState<string[]>([]);
  /** 编辑已有公众号标签 */
  const [editingFeed, setEditingFeed] = useState<FeedItem | null>(null);
  const [editingTags, setEditingTags] = useState<string[]>([]);

  const { data: tagList, refetch: refetchTags } = trpc.tag.list.useQuery(
    undefined,
    { refetchOnWindowFocus: true },
  );
  const { mutateAsync: createTag } = trpc.tag.create.useMutation({});
  const { mutateAsync: deleteTag, isLoading: isDeleteTagLoading } =
    trpc.tag.delete.useMutation({});
  const { mutateAsync: setFeedTags } = trpc.feed.setTags.useMutation({});
  const [newTagName, setNewTagName] = useState('');
  /** 编辑标签模式：可新增 / 删除；默认关闭，只做筛选 */
  const [tagEditMode, setTagEditMode] = useState(false);

  const { refetch: refetchFeedList, data: feedData } = trpc.feed.list.useQuery(
    {
      tag: selectedTag || undefined,
    },
    {
      refetchOnWindowFocus: true,
    },
  );

  /** 拉文依赖「启用中」的微信读书账号；失效时整页提示 */
  const { data: accountData } = trpc.account.list.useQuery(
    {},
    { refetchOnWindowFocus: true },
  );
  const hasEnabledAccount = useMemo(
    () => (accountData?.items || []).some((a) => a.status === 1),
    [accountData?.items],
  );

  const navigate = useNavigate();

  const queryUtils = trpc.useUtils();

  const errMsg = (e: unknown) =>
    (e as { message?: string })?.message || '未知错误';

  const { mutateAsync: getMpInfo, isLoading: isGetMpInfoLoading } =
    trpc.platform.getMpInfo.useMutation({});
  const { mutateAsync: updateMpInfo } = trpc.feed.edit.useMutation({});

  const { mutateAsync: addFeed, isLoading: isAddFeedLoading } =
    trpc.feed.add.useMutation({});
  const { mutateAsync: refreshMpArticles, isLoading: isGetArticlesLoading } =
    trpc.feed.refreshArticles.useMutation();
  const {
    mutateAsync: getHistoryArticles,
    isLoading: isGetHistoryArticlesLoading,
  } = trpc.feed.getHistoryArticles.useMutation();

  const { data: inProgressHistoryMp, refetch: refetchInProgressHistoryMp } =
    trpc.feed.getInProgressHistoryMp.useQuery(undefined, {
      refetchOnWindowFocus: true,
      refetchInterval: 10 * 1e3,
      refetchOnMount: true,
      refetchOnReconnect: true,
    });

  const { data: isRefreshAllMpArticlesRunning } =
    trpc.feed.isRefreshAllMpArticlesRunning.useQuery();

  const { mutateAsync: deleteFeed, isLoading: isDeleteFeedLoading } =
    trpc.feed.delete.useMutation({});
  const { mutateAsync: reorderFeeds } = trpc.feed.reorder.useMutation({});

  const [wxsLink, setWxsLink] = useState('');

  const [currentMpId, setCurrentMpId] = useState(id || '');
  const [selectedArticle, setSelectedArticle] =
    useState<ArticleListItem | null>(null);
  /** 侧边栏本地顺序（拖拽时即时反馈） */
  const [localFeeds, setLocalFeeds] = useState<FeedItem[]>([]);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // 切换订阅源时清空阅读器选中
  useEffect(() => {
    setCurrentMpId(id || '');
    setSelectedArticle(null);
  }, [id]);

  // 同步服务端列表到本地（非拖拽中）
  useEffect(() => {
    if (feedData?.items && !draggingId) {
      setLocalFeeds(feedData.items as FeedItem[]);
    }
  }, [feedData?.items, draggingId]);

  const toggleNameInList = (
    list: string[],
    name: string,
    setList: (v: string[]) => void,
  ) => {
    if (list.includes(name)) {
      setList(list.filter((t) => t !== name));
    } else {
      setList([...list, name]);
    }
  };

  const handleConfirm = async () => {
    console.log('wxsLink', wxsLink);
    const wxsLinks = wxsLink.split('\n').filter((link) => link.trim() !== '');
    for (const link of wxsLinks) {
      console.log('add wxsLink', link);
      try {
        const res = await getMpInfo({ wxsLink: link });
        if (!res[0]) {
          toast.error('添加失败', { description: '请检查链接是否正确' });
          continue;
        }
        const item = res[0];
        await addFeed({
          id: item.id,
          mpName: item.name,
          mpCover: item.cover,
          mpIntro: item.intro,
          updateTime: item.updateTime,
          status: 1,
          tags: importTags,
        });
        try {
          await refreshMpArticles({ mpId: item.id });
          toast.success('添加成功', {
            description: `公众号 ${item.name}${
              importTags.length ? ` · ${importTags.join('、')}` : ''
            }`,
          });
        } catch (refreshErr) {
          toast.warning('公众号已添加，但文章拉取失败', {
            description: `${errMsg(refreshErr)}（可到「账号管理」检查读书账号后点更新）`,
          });
        }
        await queryUtils.article.list.reset();
      } catch (e) {
        toast.error('添加失败', { description: errMsg(e) });
      }
    }
    refetchFeedList();
    setWxsLink('');
    setImportTags([]);
    onClose();
  };

  const handleRefreshArticles = async (mpId?: string) => {
    try {
      await refreshMpArticles(mpId ? { mpId } : {});
      await refetchFeedList();
      await queryUtils.article.list.reset();
      toast.success(mpId ? '更新完成' : '全部更新已触发');
    } catch (e) {
      toast.error('更新失败', { description: errMsg(e) });
    }
  };

  const openEditTags = (feed: FeedItem) => {
    setEditingFeed(feed);
    setEditingTags((feed.tags || []).map((t) => t.name));
    onTagModalOpen();
  };

  const handleSaveFeedTags = async () => {
    if (!editingFeed) return;
    try {
      await setFeedTags({ id: editingFeed.id, tags: editingTags });
      toast.success('标签已更新', { description: editingFeed.mpName });
      await refetchFeedList();
      onTagModalClose();
      setEditingFeed(null);
    } catch (e: any) {
      toast.error('保存失败', { description: e?.message || '请重试' });
    }
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) {
      toast.error('请输入标签名');
      return;
    }
    try {
      await createTag({ name });
      toast.success('标签已添加', { description: name });
      setNewTagName('');
      await refetchTags();
    } catch (e: any) {
      toast.error('添加失败', { description: e?.message || '请重试' });
    }
  };

  const exitTagEditMode = () => {
    setTagEditMode(false);
    setNewTagName('');
  };

  const handleDeleteTag = async (tagId: string, tagName: string) => {
    if (
      !window.confirm(
        `确定删除标签「${tagName}」吗？\n不会删除公众号，只去掉该标签关联。`,
      )
    ) {
      return;
    }
    try {
      await deleteTag(tagId);
      if (selectedTag === tagName) {
        setSelectedTag(null);
      }
      setImportTags((prev) => prev.filter((t) => t !== tagName));
      setEditingTags((prev) => prev.filter((t) => t !== tagName));
      toast.success('标签已删除', { description: tagName });
      await refetchTags();
      await refetchFeedList();
    } catch (e: any) {
      toast.error('删除失败', { description: e?.message || '请重试' });
    }
  };

  const isActive = (key: string) => {
    return currentMpId === key;
  };

  const currentMpInfo = useMemo(() => {
    return localFeeds.find((item) => item.id === currentMpId);
  }, [currentMpId, localFeeds]);

  const handleDeleteFeed = async (feedId: string, feedName: string) => {
    if (
      !window.confirm(
        `确定删除订阅源「${feedName}」吗？\n仅删除订阅，已获取的文章不会被删除。`,
      )
    ) {
      return;
    }
    try {
      await deleteFeed(feedId);
      toast.success('已删除订阅源', { description: feedName });
      if (currentMpId === feedId) {
        navigate('/feeds');
        setCurrentMpId('');
      }
      await refetchFeedList();
    } catch (e: any) {
      toast.error('删除失败', { description: e?.message || '请重试' });
    }
  };

  const handleDragStart = (feedId: string) => (ev: DragEvent) => {
    setDraggingId(feedId);
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', feedId);
  };

  const handleDragOver = (feedId: string) => (ev: DragEvent) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    if (dragOverId !== feedId) setDragOverId(feedId);
  };

  const handleDrop = (targetId: string) => async (ev: DragEvent) => {
    ev.preventDefault();
    const sourceId = ev.dataTransfer.getData('text/plain') || draggingId;
    setDragOverId(null);
    setDraggingId(null);
    if (!sourceId || sourceId === targetId) return;

    const from = localFeeds.findIndex((f) => f.id === sourceId);
    const to = localFeeds.findIndex((f) => f.id === targetId);
    if (from < 0 || to < 0) return;

    const next = [...localFeeds];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setLocalFeeds(next);

    try {
      await reorderFeeds({ orderedIds: next.map((f) => f.id) });
      await refetchFeedList();
    } catch (e: any) {
      toast.error('排序保存失败', { description: e?.message || '请重试' });
      await refetchFeedList();
    }
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  const selectFeed = (feedId: string) => {
    setCurrentMpId(feedId);
    if (feedId) {
      navigate(`/feeds/${feedId}`);
    } else {
      navigate('/feeds');
    }
  };

  // 无「全部」入口：未选中或已删源时默认选中第一个
  useEffect(() => {
    if (!localFeeds.length) return;
    if (!currentMpId || !localFeeds.some((f) => f.id === currentMpId)) {
      const firstId = localFeeds[0].id;
      setCurrentMpId(firstId);
      navigate(`/feeds/${firstId}`);
    }
  }, [localFeeds, currentMpId, navigate]);

  const handleExportOpml = async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!feedData?.items?.length) {
      console.warn('没有订阅源');
      return;
    }

    let opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
    <opml version="2.0">
      <head>
        <title>WeWeRSS 所有订阅源</title>
      </head>
      <body>
    `;

    feedData?.items.forEach((sub) => {
      opmlContent += `    <outline text="${sub.mpName}" type="rss" xmlUrl="${window.location.origin}/feeds/${sub.id}.atom" htmlUrl="${window.location.origin}/feeds/${sub.id}.atom"/>\n`;
    });

    opmlContent += `    </body>
    </opml>`;

    const blob = new Blob([opmlContent], { type: 'text/xml;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'WeWeRSS-All.opml';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="h-full flex flex-col min-h-0 bg-[var(--claude-canvas)]">
        {!hasEnabledAccount && accountData ? (
          <div className="shrink-0 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-900 text-[13px] flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              当前没有可用的微信读书账号，添加/更新公众号将无法拉取文章。
              请到「账号管理」扫码登录，或把已有账号状态改为启用。
            </span>
            <Link
              size="sm"
              href="/accounts"
              className="text-[#07c160] font-medium underline-offset-2"
            >
              去账号管理
            </Link>
          </div>
        ) : null}
        <div className="flex-1 flex min-h-0">
        {/* 左：订阅源栏 */}
        <div className="w-60 shrink-0 border-r border-[var(--claude-border)] p-3 h-full flex flex-col min-h-0 claude-sidebar">
          <div className="pb-3 flex flex-col items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              radius="lg"
              className="font-medium shadow-none w-full max-w-[140px] bg-[#07c160] text-white data-[hover=true]:bg-[#06ad56]"
              onPress={onOpen}
              endContent={<PlusIcon />}
            >
              添加
            </Button>
            <div className="font-normal text-[11px] text-[var(--claude-muted)]">
              共{feedData?.items.length || 0}个订阅
            </div>
          </div>

          <div className="h-px bg-[var(--claude-border)] mx-1 mb-2 shrink-0" />

          {/* 标签：默认筛选；点「编辑标签」后可增删 */}
          <div className="shrink-0 mb-2">
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <span className="text-[10px] text-[var(--claude-muted)]">
                {tagEditMode ? '编辑标签' : '标签筛选'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (tagEditMode) {
                    exitTagEditMode();
                  } else {
                    setTagEditMode(true);
                  }
                }}
                className={`text-[10px] hover:underline ${
                  tagEditMode
                    ? 'text-[var(--claude-muted)]'
                    : 'text-[#07c160]'
                }`}
              >
                {tagEditMode ? '完成' : '编辑标签'}
              </button>
            </div>

            {tagEditMode ? (
              <div className="flex gap-1 mb-1.5">
                <input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateTag();
                    }
                  }}
                  placeholder="输入新标签名"
                  className="flex-1 min-w-0 text-[11px] px-2 py-1 rounded-lg border border-[var(--claude-border)] bg-[var(--claude-paper)] outline-none focus:border-[#07c160]"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreateTag}
                  className="shrink-0 text-[11px] px-2 py-1 rounded-lg bg-[#07c160] text-white"
                >
                  添加
                </button>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto content-start">
              {/* 「全部」仅筛选模式显示，不可删 */}
              {!tagEditMode ? (
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                    selectedTag === null
                      ? 'bg-[#07c160] text-white border-[#07c160]'
                      : 'border-[var(--claude-border)] text-[var(--claude-muted)] hover:bg-[var(--claude-hover)]'
                  }`}
                >
                  全部
                </button>
              ) : null}

              {(tagList || []).map((tag) => {
                const active = selectedTag === tag.name;
                return (
                  <span
                    key={tag.id}
                    className={`relative inline-flex items-center text-[11px] rounded-full border transition-colors select-none ${
                      tagEditMode ? 'pl-2 pr-4 py-0.5' : 'px-2 py-0.5'
                    } ${
                      active && !tagEditMode
                        ? 'bg-[var(--claude-accent)] text-white border-[var(--claude-accent)]'
                        : 'border-[var(--claude-border)] text-[var(--claude-ink)] hover:bg-[var(--claude-accent-soft)]'
                    } ${tagEditMode ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (tagEditMode) return;
                        setSelectedTag(active ? null : tag.name);
                      }}
                      className="max-w-[5.5rem] truncate"
                      title={tag.name}
                    >
                      {tag.name}
                    </button>
                    {tagEditMode ? (
                      <button
                        type="button"
                        disabled={isDeleteTagLoading}
                        onClick={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          handleDeleteTag(tag.id, tag.name);
                        }}
                        className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] leading-none border shadow-sm bg-[var(--claude-paper)] text-[var(--claude-muted)] border-[var(--claude-border)] hover:text-danger hover:border-danger"
                        title={`删除标签 ${tag.name}`}
                        aria-label={`删除标签 ${tag.name}`}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                );
              })}
            </div>
            {tagEditMode ? (
              <div className="mt-1 text-[10px] text-[var(--claude-muted)] px-0.5">
                点标签右上角 × 删除；上方可添加新标签
              </div>
            ) : null}
          </div>

          <div className="h-px bg-[var(--claude-border)] mx-1 mb-2 shrink-0" />

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5 pr-0.5">
              {!localFeeds.length ? (
                <div className="text-xs text-[var(--claude-muted)] text-center py-6 px-2">
                  {selectedTag
                    ? `暂无「${selectedTag}」标签的公众号`
                    : '暂无订阅'}
                </div>
              ) : (
                localFeeds.map((item) => {
                  const active = isActive(item.id);
                  const isDragging = draggingId === item.id;
                  const isOver =
                    dragOverId === item.id && draggingId !== item.id;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={handleDragStart(item.id)}
                      onDragOver={handleDragOver(item.id)}
                      onDrop={handleDrop(item.id)}
                      onDragEnd={handleDragEnd}
                      className={`group flex items-center gap-1 rounded-xl px-1 py-1.5 cursor-grab active:cursor-grabbing border border-transparent transition-colors ${
                        active
                          ? 'claude-item-active font-medium'
                          : 'text-[var(--claude-ink)] claude-item-hover'
                      } ${isDragging ? 'opacity-50' : ''} ${
                        isOver
                          ? 'border-[var(--claude-accent)] border-dashed bg-[var(--claude-accent-soft)]'
                          : ''
                      }`}
                    >
                      <span
                        className="text-[var(--claude-muted)] text-xs px-0.5 select-none shrink-0 opacity-50"
                        title="拖动排序"
                        aria-hidden
                      >
                        ⋮⋮
                      </span>
                      <button
                        type="button"
                        onClick={() => selectFeed(item.id)}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left text-sm"
                      >
                        <Avatar
                          src={item.mpCover}
                          size="sm"
                          className="shrink-0 ring-1 ring-[var(--claude-border)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="truncate block">{item.mpName}</span>
                          {item.tags && item.tags.length > 0 ? (
                            <span className="truncate block text-[10px] font-normal text-[var(--claude-muted)]">
                              {item.tags.map((t) => t.name).join(' · ')}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <Tooltip content="编辑标签">
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            openEditTags(item);
                          }}
                          className="shrink-0 w-6 h-6 rounded-lg text-[var(--claude-muted)] hover:text-[var(--claude-accent)] hover:bg-[var(--claude-accent-soft)] text-[11px] leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                          title="标签"
                          aria-label={`编辑 ${item.mpName} 标签`}
                        >
                          标
                        </button>
                      </Tooltip>
                      <Tooltip content="删除此订阅源">
                        <button
                          type="button"
                          disabled={isDeleteFeedLoading}
                          onClick={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            handleDeleteFeed(item.id, item.mpName);
                          }}
                          className="shrink-0 w-6 h-6 rounded-lg text-[var(--claude-muted)] hover:text-danger hover:bg-danger-50 text-sm leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                          title="删除"
                          aria-label={`删除 ${item.mpName}`}
                        >
                          ×
                        </button>
                      </Tooltip>
                    </div>
                  );
                })
              )}
            </div>
            <div className="pt-2 text-[10px] text-[var(--claude-muted)] text-center shrink-0">
              拖动 ⋮⋮ 可调整顺序
            </div>
          </div>
        </div>

        {/* 中：标题列表 */}
        <div className="w-[340px] shrink-0 border-r border-[var(--claude-border)] h-full flex flex-col min-h-0 bg-[var(--claude-paper)]">
          <div className="px-3.5 py-3.5 border-b border-[var(--claude-border)] shrink-0 space-y-2">
            <h3 className="text-[15px] font-semibold tracking-tight overflow-hidden text-ellipsis break-keep text-nowrap text-[var(--claude-ink)]">
              {currentMpInfo?.mpName || '全部'}
            </h3>
            {currentMpInfo ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--claude-muted)]">
                <span className="font-light">
                  更新于{' '}
                  {dayjs(currentMpInfo.syncTime * 1e3).format('MM-DD HH:mm')}
                </span>
                <Divider orientation="vertical" className="h-3" />
                <Tooltip
                  content="频繁调用可能会导致一段时间内不可用"
                  color="danger"
                >
                  <Link
                    size="sm"
                    href="#"
                    isDisabled={isGetArticlesLoading}
                    onClick={async (ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      await handleRefreshArticles(currentMpInfo.id);
                    }}
                  >
                    {isGetArticlesLoading ? '更新中...' : '更新'}
                  </Link>
                </Tooltip>
                {currentMpInfo.hasHistory === 1 && (
                  <>
                    <Divider orientation="vertical" className="h-3" />
                    <Tooltip
                      content={
                        inProgressHistoryMp?.id === currentMpInfo.id
                          ? `正在获取第${inProgressHistoryMp.page}页...`
                          : `历史文章需要分批次拉取，请耐心等候`
                      }
                      color={
                        inProgressHistoryMp?.id === currentMpInfo.id
                          ? 'primary'
                          : 'danger'
                      }
                    >
                      <Link
                        size="sm"
                        href="#"
                        isDisabled={
                          (inProgressHistoryMp?.id
                            ? inProgressHistoryMp?.id !== currentMpInfo.id
                            : false) ||
                          isGetHistoryArticlesLoading ||
                          isGetArticlesLoading
                        }
                        onClick={async (ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();

                          if (inProgressHistoryMp?.id === currentMpInfo.id) {
                            await getHistoryArticles({
                              mpId: '',
                            });
                          } else {
                            await getHistoryArticles({
                              mpId: currentMpInfo.id,
                            });
                          }

                          await refetchInProgressHistoryMp();
                        }}
                      >
                        {inProgressHistoryMp?.id === currentMpInfo.id
                          ? `停止历史`
                          : `历史`}
                      </Link>
                    </Tooltip>
                  </>
                )}
                <Divider orientation="vertical" className="h-3" />
                <Tooltip content="启用服务端定时更新">
                  <div>
                    <Switch
                      size="sm"
                      onValueChange={async (value) => {
                        await updateMpInfo({
                          id: currentMpInfo.id,
                          data: {
                            status: value ? 1 : 0,
                          },
                        });

                        await refetchFeedList();
                      }}
                      isSelected={currentMpInfo?.status === 1}
                    ></Switch>
                  </div>
                </Tooltip>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 text-xs text-[var(--claude-muted)]">
                <Tooltip
                  content="频繁调用可能会导致一段时间内不可用"
                  color="danger"
                >
                  <Link
                    size="sm"
                    href="#"
                    className="text-[var(--claude-accent)]"
                    isDisabled={
                      isRefreshAllMpArticlesRunning || isGetArticlesLoading
                    }
                    onClick={async (ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      await handleRefreshArticles();
                    }}
                  >
                    {isRefreshAllMpArticlesRunning || isGetArticlesLoading
                      ? '更新中...'
                      : '更新全部'}
                  </Link>
                </Tooltip>
                <Link
                  href="#"
                  className="text-[var(--claude-muted)]"
                  onClick={handleExportOpml}
                  size="sm"
                >
                  导出OPML
                </Link>
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0">
            <ArticleList
              selectedId={selectedArticle?.id}
              onSelect={setSelectedArticle}
            />
          </div>
        </div>

        {/* 右：阅读栏 */}
        <div className="flex-1 min-w-0 h-full bg-[var(--claude-canvas)]">
          <ArticleReader article={selectedArticle} />
        </div>
        </div>
      </div>
      <Modal
        isOpen={isOpen}
        onOpenChange={(open) => {
          onOpenChange();
          if (!open) setImportTags([]);
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                添加公众号源
              </ModalHeader>
              <ModalBody>
                <Textarea
                  value={wxsLink}
                  onValueChange={setWxsLink}
                  autoFocus
                  label="分享链接"
                  placeholder="输入公众号文章分享链接，一行一条，如 https://mp.weixin.qq.com/s/xxxxxx"
                  variant="bordered"
                />
                <div>
                  <div className="text-sm mb-2 text-[var(--claude-ink)]">
                    选择标签（可多选）
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {(tagList || []).map((tag) => {
                      const on = importTags.includes(tag.name);
                      return (
                        <Chip
                          key={tag.id}
                          size="sm"
                          variant={on ? 'solid' : 'bordered'}
                          color={on ? 'primary' : 'default'}
                          className="cursor-pointer"
                          onClick={() =>
                            toggleNameInList(
                              importTags,
                              tag.name,
                              setImportTags,
                            )
                          }
                        >
                          {tag.name}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="flat" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="primary"
                  isDisabled={
                    !wxsLink.startsWith('https://mp.weixin.qq.com/s/')
                  }
                  onPress={handleConfirm}
                  isLoading={
                    isAddFeedLoading ||
                    isGetMpInfoLoading ||
                    isGetArticlesLoading
                  }
                >
                  确定
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 编辑已有公众号标签 */}
      <Modal isOpen={isTagModalOpen} onOpenChange={onTagModalOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                编辑标签
                {editingFeed ? (
                  <span className="text-sm font-normal text-[var(--claude-muted)]">
                    {editingFeed.mpName}
                  </span>
                ) : null}
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
                  {(tagList || []).map((tag) => {
                    const on = editingTags.includes(tag.name);
                    return (
                      <Chip
                        key={tag.id}
                        size="sm"
                        variant={on ? 'solid' : 'bordered'}
                        color={on ? 'primary' : 'default'}
                        className="cursor-pointer"
                        onClick={() =>
                          toggleNameInList(
                            editingTags,
                            tag.name,
                            setEditingTags,
                          )
                        }
                      >
                        {tag.name}
                      </Chip>
                    );
                  })}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="flat" onPress={onClose}>
                  取消
                </Button>
                <Button color="primary" onPress={handleSaveFeedTags}>
                  保存
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};

export default Feeds;
