import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ARCHIVIUM_URL } from '../App';

// Breadcrumbs in Archivium's style (#breadcrumbs, links separated by " / "):
// Campaigns / <campaign> / ... Titles are looked up from shortnames, and cached
// so moving between pages doesn't refetch them.

const titles = new Map<string, Promise<string | null>>();

function fetchTitle(path: string): Promise<string | null> {
  let title = titles.get(path);
  if (!title) {
    title = fetch(`${ARCHIVIUM_URL}/api/universes/${path}`, { credentials: 'include' })
      .then(async response => response.ok ? (await response.json()).title as string : null)
      .catch(() => null);
    titles.set(path, title);
  }
  return title;
}

export function useTitle(path: string | null): string | null {
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    setTitle(null);
    if (!path) return;
    let cancelled = false;
    fetchTitle(path).then(t => { if (!cancelled) setTitle(t); });
    return () => { cancelled = true; };
  }, [path]);
  return title;
}

export type Crumb = { label: ReactNode, to?: string };

interface Props {
  campaign?: string;
  // An item whose title ends the trail (unless `current` is given).
  item?: string;
  // Crumbs between the campaign and the item/current page.
  trail?: Crumb[];
  // The last crumb, for the page itself.
  current?: ReactNode;
}

export default function Breadcrumbs({ campaign, item, trail = [], current }: Props) {
  const campaignTitle = useTitle(campaign ?? null);
  const itemTitle = useTitle(campaign && item && current === undefined ? `${campaign}/items/${item}` : null);

  const crumbs: Crumb[] = [{ label: 'Campaigns', to: '/' }];
  if (campaign) crumbs.push({ label: campaignTitle ?? campaign, to: `/campaigns/${campaign}` });
  crumbs.push(...trail);
  if (current !== undefined) crumbs.push({ label: current });
  else if (item) crumbs.push({ label: itemTitle ?? item });

  return (
    <div id='breadcrumbs'>
      {crumbs.map((crumb, i) => (
        <Fragment key={i}>
          {i > 0 && ' / '}
          {crumb.to && i < crumbs.length - 1
            ? <Link className='link link-animated' to={crumb.to}>{crumb.label}</Link>
            : <span>{crumb.label}</span>}
        </Fragment>
      ))}
    </div>
  );
}

export const archiviumItemUrl = (campaign: string, item: string) => `${ARCHIVIUM_URL}/universes/${campaign}/items/${item}`;
export const archiviumUniverseUrl = (campaign: string) => `${ARCHIVIUM_URL}/universes/${campaign}`;
