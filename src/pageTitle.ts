import { useEffect } from 'react';

export const SITE_NAME = 'Archivium Fate';

// Sets the browser tab's title: the page's own name first, then where it is (e.g. its
// campaign), then the site's. Parts that aren't known yet are left out.
export function usePageTitle(...parts: (string | null | undefined)[]) {
  const title = [...parts.filter((part): part is string => !!part?.trim()), SITE_NAME].join(' · ');
  useEffect(() => {
    document.title = title;
  }, [title]);
}
