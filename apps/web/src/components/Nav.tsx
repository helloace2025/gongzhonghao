import {
  Badge,
  Image,
  Link,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  Tooltip,
} from '@nextui-org/react';
import { ThemeSwitcher } from './ThemeSwitcher';
import { GitHubIcon } from './GitHubIcon';
import { useLocation } from 'react-router-dom';
import { appVersion, serverOriginUrl } from '@web/utils/env';
import { useEffect, useState } from 'react';

const navbarItemLink = [
  {
    href: '/feeds',
    name: '公众号源',
  },
  {
    href: '/accounts',
    name: '账号管理',
  },
];

const Nav = () => {
  const { pathname } = useLocation();
  const [releaseVersion, setReleaseVersion] = useState(appVersion);

  useEffect(() => {
    fetch('https://api.github.com/repos/cooderl/wewe-rss/releases/latest')
      .then((res) => res.json())
      .then((data) => {
        setReleaseVersion(data.name.replace('v', ''));
      })
      .catch(() => undefined);
  }, []);

  const isFoundNewVersion = releaseVersion > appVersion;

  return (
    <div className="claude-nav shrink-0">
      <Navbar
        maxWidth="full"
        height="3.25rem"
        classNames={{
          base: 'bg-transparent shadow-none border-none',
          wrapper: 'px-4 max-w-full',
        }}
        isBordered={false}
      >
        <Tooltip
          content={
            <div className="p-1 text-sm">
              {isFoundNewVersion && (
                <Link
                  href={`https://github.com/cooderl/wewe-rss/releases/latest`}
                  target="_blank"
                  className="mb-1 block text-sm text-primary"
                >
                  发现新版本：v{releaseVersion}
                </Link>
              )}
              当前版本: v{appVersion}
            </div>
          }
          placement="bottom-start"
        >
          <NavbarBrand className="cursor-default gap-2">
            <Badge
              content={isFoundNewVersion ? '' : null}
              color="danger"
              size="sm"
            >
              <Image
                width={26}
                alt="WeWe RSS"
                className="rounded-md"
                src={
                  serverOriginUrl
                    ? `${serverOriginUrl}/favicon.ico`
                    : 'https://r2-assets.111965.xyz/wewe-rss.png'
                }
              />
            </Badge>
            <p className="font-semibold tracking-tight text-[15px] text-[var(--claude-ink)]">
              WeWe RSS
            </p>
          </NavbarBrand>
        </Tooltip>
        <NavbarContent className="hidden sm:flex gap-1" justify="center">
          {navbarItemLink.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <NavbarItem key={item.href} isActive={active}>
                <Link
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-[var(--claude-accent-soft)] text-[var(--claude-accent)] font-medium'
                      : 'text-[var(--claude-muted)] hover:bg-[var(--claude-hover)] hover:text-[var(--claude-ink)]'
                  }`}
                >
                  {item.name}
                </Link>
              </NavbarItem>
            );
          })}
        </NavbarContent>
        <NavbarContent justify="end" className="gap-2">
          <ThemeSwitcher />
          <Link
            href="https://github.com/cooderl/wewe-rss"
            target="_blank"
            className="text-[var(--claude-muted)] hover:text-[var(--claude-ink)] p-1.5 rounded-lg hover:bg-[var(--claude-hover)]"
          >
            <GitHubIcon />
          </Link>
        </NavbarContent>
      </Navbar>
    </div>
  );
};

export default Nav;
