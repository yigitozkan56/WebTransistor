import { useCallback, useEffect, useState } from 'react';

export type AppRoute = 'simulator' | 'wiki' | 'projects';

const ROUTE_TO_PATH: Record<AppRoute, string> = {
  simulator: '/',
  wiki: '/wiki',
  projects: '/projeler',
};

/** Maps a URL pathname to one of the 3 application routes. */
export function pathToRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, '').toLowerCase() || '/';
  if (normalized === '/wiki') {
    return 'wiki';
  }
  if (
    normalized === '/projeler' ||
    normalized === '/projects' ||
    normalized === '/examples'
  ) {
    return 'projects';
  }
  return 'simulator';
}

/** Returns the canonical pathname for a given AppRoute. */
export function routeToPath(route: AppRoute): string {
  return ROUTE_TO_PATH[route];
}

/** Reads the initial `?project=<id>` query parameter from the browser URL, if present. */
export function getInitialProjectParam(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('project')?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/** Removes the `project` query parameter using `history.replaceState` while keeping pathname intact. */
export function clearProjectQuery(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('project')) return;
  url.searchParams.delete('project');
  const nextSearch = url.searchParams.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
  window.history.replaceState(window.history.state, '', nextUrl);
}

/** Client-side History API router hook for the 3-page WebTransistor shell. */
export function useRoute() {
  const [route, setRoute] = useState<AppRoute>(() => {
    if (typeof window === 'undefined') return 'simulator';
    return pathToRoute(window.location.pathname);
  });

  useEffect(() => {
    const handlePopState = () => {
      setRoute(pathToRoute(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((nextRoute: AppRoute) => {
    const targetPath = routeToPath(nextRoute);
    if (typeof window !== 'undefined') {
      const currentPath =
        window.location.pathname.replace(/\/+$/, '').toLowerCase() || '/';
      if (currentPath !== targetPath || window.location.search !== '') {
        window.history.pushState({ route: nextRoute }, '', targetPath);
      }
    }
    setRoute(nextRoute);
  }, []);

  return {
    route,
    navigate,
    getInitialProjectParam,
    clearProjectQuery,
  };
}
