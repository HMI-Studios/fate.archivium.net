import { useEffect, useState, type FormEvent } from 'react';
import { archiviumItemUrl } from './Breadcrumbs';
import { createStunt, fetchStunt, listStunts, type Stunt } from '../fate/stunts';

type Props = {
  campaign: string,
  universeObjData: unknown,
  // Whether the viewer may add stunts (players and GMs).
  canCreate: boolean,
};

// The campaign's shared stunts, with what they do, and a form to add one.
export default function CampaignStunts({ campaign, universeObjData, canCreate }: Props) {
  // Undefined while loading.
  const [stunts, setStunts] = useState<Stunt[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStunts(undefined);
    setLoadError(null);
    // The item list has no bodies, so each stunt is fetched for its description.
    listStunts(campaign)
      .then(summaries => Promise.all(summaries.map(summary => fetchStunt(campaign, summary.shortname)
        .catch(() => ({ ...summary, description: '', plain: true })))))
      .then(loaded => { if (!cancelled) setStunts(loaded); })
      .catch(e => { if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [campaign]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const stunt = await createStunt(campaign, universeObjData, name, description);
      setStunts(current => [...(current ?? []), stunt].sort((a, b) => a.title.localeCompare(b.title)));
      setName('');
      setDescription('');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const exists = stunts?.some(stunt => stunt.title.trim().toLowerCase() === name.trim().toLowerCase());

  return <div className='d-flex flex-col gap-3'>
    <p className='ma-0' style={{ color: 'var(--light-text-color)' }}>
      Stunts are shared by everyone in the campaign. Pick one on a character sheet to give it to that
      character; changing what a stunt does changes it for everyone who has it.
    </p>

    {canCreate && <form onSubmit={create} className='d-flex flex-col gap-1' style={{ maxWidth: '36rem' }}>
      <input aria-label='New stunt name' placeholder='New stunt name' value={name} disabled={creating} onChange={({ target }) => setName(target.value)} />
      <textarea
        aria-label='What the new stunt does'
        placeholder='What the stunt does'
        rows={3}
        value={description}
        disabled={creating}
        onChange={({ target }) => setDescription(target.value)}
        style={{ font: 'inherit', resize: 'vertical' }}
      />
      <div className='d-flex align-center gap-2'>
        <button type='submit' disabled={creating || !name.trim()}>{creating ? 'Adding...' : 'Add Stunt'}</button>
        {exists && <span style={{ color: 'var(--light-text-color)' }}>There's already a stunt with that name.</span>}
        {createError && <span className='color-error'>{createError}</span>}
      </div>
    </form>}

    {loadError && <span className='color-error'>{loadError}</span>}
    {!loadError && stunts === undefined && <div className='loader' />}
    {stunts?.length === 0 && <p className='ma-0'>No stunts yet.</p>}
    {stunts && stunts.length > 0 && <ul className='d-flex flex-col gap-2 ma-0 pa-0' style={{ listStyle: 'none' }}>
      {stunts.map(stunt => (
        <li key={stunt.shortname}>
          <a className='link link-animated' href={archiviumItemUrl(campaign, stunt.shortname)}><b>{stunt.title}</b></a>
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {stunt.description || <i style={{ color: 'var(--light-text-color)' }}>No description yet.</i>}
          </div>
        </li>
      ))}
    </ul>}
  </div>;
}
