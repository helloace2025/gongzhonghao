const configuration = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const port = process.env.PORT || 4000;
  const host = process.env.HOST || '0.0.0.0';

  const maxRequestPerMinute = parseInt(
    `${process.env.MAX_REQUEST_PER_MINUTE}|| 60`,
  );

  const authCode = process.env.AUTH_CODE;
  const platformUrl = process.env.PLATFORM_URL || 'https://weread.111965.xyz';
  const originUrl = process.env.SERVER_ORIGIN_URL || '';

  const feedMode = process.env.FEED_MODE as 'fulltext' | '';

  // file: URL 一律按 sqlite；未显式指定时默认 mysql（兼容原版）
  const databaseType =
    process.env.DATABASE_TYPE ||
    (process.env.DATABASE_URL?.startsWith('file:') ? 'sqlite' : 'mysql');

  const updateDelayTime = parseInt(`${process.env.UPDATE_DELAY_TIME} || 60`);

  const enableCleanHtml = process.env.ENABLE_CLEAN_HTML === 'true';
  return {
    server: { isProd, port, host },
    throttler: { maxRequestPerMinute },
    auth: { code: authCode },
    platform: { url: platformUrl },
    feed: {
      originUrl,
      mode: feedMode,
      updateDelayTime,
      enableCleanHtml,
    },
    database: {
      type: databaseType,
    },
  };
};

export default configuration;

export type ConfigurationType = ReturnType<typeof configuration>;
