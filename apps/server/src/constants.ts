export const statusMap = {
  // 0:失效 1:启用 2:禁用
  INVALID: 0,
  ENABLE: 1,
  DISABLE: 2,
};

export const feedTypes = ['rss', 'atom', 'json'] as const;

export const feedMimeTypeMap = {
  rss: 'application/rss+xml; charset=utf-8',
  atom: 'application/atom+xml; charset=utf-8',
  json: 'application/feed+json; charset=utf-8',
} as const;

export const defaultCount = 20;

/**
 * 来自《精品对标号_标签_账号对应.pdf》的全部标签（仅标签名）
 */
export const SEED_TAGS: string[] = [
  'AI',
  '三农',
  '个人成长',
  '体制',
  '体育健身',
  '健康养生',
  '其它',
  '军事国际',
  '动漫',
  '历史',
  '商业营销',
  '壁纸头像',
  '娱乐',
  '宠物',
  '家居',
];

