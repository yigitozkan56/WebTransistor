import type { MouseEvent } from 'react';
import { BookOpen, Cpu, Download, Layers } from 'lucide-react';
import { EXAMPLE_PROJECTS } from '../data/exampleProjects';
import type { AppRoute } from '../router/useRoute';

export interface SiteHeaderProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

const GITHUB_URL = 'https://github.com/yigitozkan56/WebTransistor';
const DESKTOP_EXE_URL =
  'https://github.com/yigitozkan56/WebTransistor/releases/download/v1.0.0/WebTransistor_1.0.0_x64-setup.exe';

function GitHubMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

/** Persistent 48px navigation bar shared across WebTransistor, Wiki, and Example Projects pages. */
export function SiteHeader({ activeRoute, onNavigate }: SiteHeaderProps) {
  const handleRouteClick = (
    e: MouseEvent<HTMLAnchorElement>,
    target: AppRoute,
  ) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    onNavigate(target);
  };

  return (
    <header className="relative z-50 h-12 w-full shrink-0 border-b border-[#1E2633] bg-[#090C10]/95 backdrop-blur-md">
      <div className="flex h-full w-full items-center justify-between gap-1.5 px-2.5 sm:gap-3 sm:px-4">
        {/* Left: Brand Logo */}
        <a
          href="/"
          onClick={(e) => handleRouteClick(e, 'simulator')}
          className="flex shrink-0 items-center gap-2 rounded-lg py-1 pr-1 transition-opacity hover:opacity-90"
          title="WebTransistor Ana Simülatör"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF] shadow-[0_0_12px_rgba(0,229,255,0.2)]">
            <Cpu className="h-4 w-4" />
          </div>
          <span className="hidden text-sm font-bold tracking-tight text-slate-100 md:inline">
            Web<span className="text-[#00E5FF]">Transistor</span>
          </span>
        </a>

        {/* Center: 3-Page Navigation Tabs */}
        <nav
          aria-label="Ana Gezinme"
          className="flex min-w-0 items-center gap-0.5 rounded-xl border border-[#1E2633] bg-[#0E131A]/90 p-0.5 sm:gap-1 sm:p-1"
        >
          <a
            href="/"
            onClick={(e) => handleRouteClick(e, 'simulator')}
            aria-current={activeRoute === 'simulator' ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold whitespace-nowrap transition-all sm:px-3 sm:text-xs ${
              activeRoute === 'simulator'
                ? 'bg-[#00E5FF]/15 text-[#00E5FF] shadow-[inset_0_0_0_1px_rgba(0,229,255,0.35)]'
                : 'text-slate-400 hover:bg-[#141B24] hover:text-slate-100'
            }`}
          >
            <Cpu className="hidden h-3.5 w-3.5 sm:inline" />
            <span>WebTransistor</span>
          </a>

          <a
            href="/wiki"
            onClick={(e) => handleRouteClick(e, 'wiki')}
            aria-current={activeRoute === 'wiki' ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold whitespace-nowrap transition-all sm:px-3 sm:text-xs ${
              activeRoute === 'wiki'
                ? 'bg-[#00E5FF]/15 text-[#00E5FF] shadow-[inset_0_0_0_1px_rgba(0,229,255,0.35)]'
                : 'text-slate-400 hover:bg-[#141B24] hover:text-slate-100'
            }`}
          >
            <BookOpen className="hidden h-3.5 w-3.5 sm:inline" />
            <span>Wiki</span>
          </a>

          <a
            href="/projeler"
            onClick={(e) => handleRouteClick(e, 'projects')}
            aria-current={activeRoute === 'projects' ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold whitespace-nowrap transition-all sm:px-3 sm:text-xs ${
              activeRoute === 'projects'
                ? 'bg-[#00E5FF]/15 text-[#00E5FF] shadow-[inset_0_0_0_1px_rgba(0,229,255,0.35)]'
                : 'text-slate-400 hover:bg-[#141B24] hover:text-slate-100'
            }`}
          >
            <Layers className="hidden h-3.5 w-3.5 sm:inline" />
            <span className="sm:hidden">Projeler</span>
            <span className="hidden sm:inline">Örnek JSON Projeleri</span>
            <span
              className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none font-bold ${
                activeRoute === 'projects'
                  ? 'bg-[#00E5FF] text-[#090C10]'
                  : 'bg-[#141B24] text-[#00E5FF]'
              }`}
            >
              {EXAMPLE_PROJECTS.length}
            </span>
          </a>
        </nav>

        {/* Right: External GitHub & Desktop Installer */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub Deposu"
            aria-label="GitHub Deposu"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E2633] bg-[#0E131A] px-2 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:bg-[#141B24] hover:text-slate-100 sm:px-2.5"
          >
            <GitHubMark />
            <span className="hidden lg:inline">GitHub</span>
          </a>

          <a
            href={DESKTOP_EXE_URL}
            download="WebTransistor_1.0.0_x64-setup.exe"
            target="_blank"
            rel="noopener noreferrer"
            title="Windows Masaüstü Uygulamasını İndir (.exe)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap text-emerald-300 transition-all hover:border-emerald-400 hover:bg-emerald-500/20 sm:px-2.5 sm:text-xs"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Masaüstü (.exe)</span>
            <span className="sm:hidden">.exe</span>
          </a>
        </div>
      </div>
    </header>
  );
}
