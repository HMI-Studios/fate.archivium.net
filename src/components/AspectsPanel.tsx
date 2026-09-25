import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ADDABLE_ASPECT_KINDS, aspectKind, sheetAspectId, sheetInvokes, type AspectKind, type SceneAspect, type SheetAspect } from '../fate/aspects';
import { tokenIdOfActor } from '../fate/tokenState';

// Someone in the scene aspects can be attached to. PCs and NPCs are one each, keyed by
// item shortname; each monster token is its own, keyed by tokenActorKey() and scoped to
// the scene (no sheet aspects; its temporary aspects stay in the scene).
export type SceneCharacter = {
  key: string;
  shortname: string;
  title: string;
  scoped?: boolean;
};

const KIND_COLORS: { [kind in AspectKind]: string } = {
  situation: '#4682B4',
  advantage: '#3CB371',
  boost: '#FF7F50',
  temporary: '#C71585',
  consequence: '#DC143C',
  character: '#B8860B',
};

// How each group of aspects is shown, per viewer: folded away, or open either compactly
// (just the aspects, grouped by kind) or for editing (with every input and button).
type GroupView = { folded: boolean, editing: boolean };
const VIEWS_KEY = 'fate.aspectGroupViews';

function loadViews(): { [group: string]: Partial<GroupView> } {
  try {
    const stored = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
}

function useGroupViews(canEdit: boolean) {
  const [views, setViews] = useState(loadViews);
  // The scene's own aspects start out editable; characters start compact.
  const viewOf = (group: string): GroupView => ({ folded: false, editing: group === SCENE_GROUP, ...views[group], ...(canEdit ? {} : { editing: false }) });
  const change = (group: string, changes: Partial<GroupView>) => setViews(current => {
    const next = { ...current, [group]: { ...viewOf(group), ...changes } };
    try { localStorage.setItem(VIEWS_KEY, JSON.stringify(next)); } catch { /* Just not remembered. */ }
    return next;
  });
  return { viewOf, change };
}

const SCENE_GROUP = '(scene)';

// The order kinds are listed in when a group is compact.
const COMPACT_ORDER: AspectKind[] = ['character', 'consequence', 'temporary', 'advantage', 'boost', 'situation'];

const Invokes = ({ count }: { count: number }) => count > 0
  ? <span aria-label={`${count} free invokes`} style={{ whiteSpace: 'nowrap' }}>{' '}{'●'.repeat(count)}</span>
  : null;

// A group's aspects without any controls, listed under one heading per kind.
function CompactAspects({ aspects }: { aspects: SceneAspect[] }) {
  return <div className='d-flex flex-col gap-1'>
    {COMPACT_ORDER.map(kind => {
      const ofKind = aspects.filter(a => a.kind === kind);
      if (ofKind.length === 0) return null;
      return <div key={kind} style={{ borderLeft: `3px solid ${KIND_COLORS[kind]}`, paddingLeft: 6 }}>
        <small style={{ color: KIND_COLORS[kind] }} title={aspectKind(kind).hint}>{aspectKind(kind).label}</small>
        <ul className='ma-0 pa-0' style={{ listStyle: 'none' }}>
          {ofKind.map(aspect => <li key={aspect.id}>
            <i>{aspect.name}</i>
            {(kind === 'character' || kind === 'consequence') && aspect.note && <small style={{ opacity: 0.7 }}> · {aspect.note}</small>}
            <Invokes count={aspect.freeInvokes} />
          </li>)}
        </ul>
      </div>;
    })}
  </div>;
}

// A group's heading: a fold toggle, its title, and (for editors) the edit toggle.
function GroupHeader({ title, view, count, canEdit, onChange }: {
  title: ReactNode,
  view: GroupView,
  count: number,
  canEdit: boolean,
  onChange: (changes: Partial<GroupView>) => void,
}) {
  return <div className='d-flex align-center gap-1 mb-1'>
    <button
      aria-expanded={!view.folded}
      aria-label={view.folded ? 'Show aspects' : 'Hide aspects'}
      title={view.folded ? 'Show aspects' : 'Hide aspects'}
      onClick={() => onChange({ folded: !view.folded })}
      style={{ padding: '0 0.3rem', minWidth: '1.6rem' }}
    >{view.folded ? '▸' : '▾'}</button>
    <h4 className='ma-0' style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h4>
    {view.folded && <small style={{ opacity: 0.7, whiteSpace: 'nowrap' }}>{count === 1 ? '1 aspect' : `${count} aspects`}</small>}
    {canEdit && !view.folded && <button
      aria-pressed={view.editing}
      title={view.editing ? 'Show just the aspects' : 'Edit these aspects and their free invokes'}
      onClick={() => onChange({ editing: !view.editing })}
    >{view.editing ? 'Done' : 'Edit'}</button>}
  </div>;
}

interface Props {
  campaignShortname: string;
  aspects: SceneAspect[];
  // Characters with a token in the scene.
  characters: SceneCharacter[];
  // Temporary aspects kept on each character's sheet. They're edited through the same
  // callbacks, with ids from sheetAspectId().
  sheetAspects: { [shortname: string]: SheetAspect[] };
  // Consequences each character in the scene has taken, by character key, as aspects
  // (with the slot's label as their note). Only their free invokes change here.
  consequences: { [key: string]: SceneAspect[] };
  // Each character's own aspects from their sheet (high concept, trouble...), by
  // character key. They're changed on the sheet, and invoked with a fate point.
  characterAspects: { [key: string]: SceneAspect[] };
  canEdit: boolean;
  // Whether the viewer runs the scene (may end it).
  gm: boolean;
  onAdd: (aspect: Omit<SceneAspect, 'id'>) => void;
  onUpdate: (id: string, changes: Partial<SceneAspect>) => void;
  onRemove: (id: string) => void;
  onKeepOnSheet: (aspect: SceneAspect) => void;
  onEndScene: () => void;
}

function AspectRow({ aspect, onSheet = false, canEdit, onUpdate, onRemove, onKeepOnSheet }: {
  aspect: SceneAspect,
  // Stored on the character's sheet rather than in the scene.
  onSheet?: boolean,
  canEdit: boolean,
  onUpdate: Props['onUpdate'],
  onRemove: Props['onRemove'],
  onKeepOnSheet: Props['onKeepOnSheet'],
}) {
  const kind = aspectKind(aspect.kind);
  // Consequences are named and cleared on the sheet (or a monster's combat card).
  const consequence = aspect.kind === 'consequence';
  // Character aspects are written on the sheet, and have no free invokes to track.
  const fromSheet = aspect.kind === 'character';
  const canRename = canEdit && !consequence && !fromSheet;

  // Spending a boost's last free invoke uses the boost up.
  const spendInvoke = () => {
    if (aspect.kind === 'boost' && aspect.freeInvokes <= 1) onRemove(aspect.id);
    else onUpdate(aspect.id, { freeInvokes: Math.max(0, aspect.freeInvokes - 1) });
  };

  return (
    <li className='d-flex flex-col gap-0' style={{ borderLeft: `3px solid ${KIND_COLORS[aspect.kind]}`, paddingLeft: 6 }}>
      <div className='d-flex align-center gap-1'>
        {canRename && !onSheet && <input
          value={aspect.name}
          aria-label='Aspect name'
          onChange={({ target }) => onUpdate(aspect.id, { name: target.value })}
          style={{ flex: '1 1 auto', minWidth: 0, fontStyle: 'italic' }}
        />}
        {/* Sheets aren't live-synced, so a sheet aspect's name is saved once editing stops. */}
        {canRename && onSheet && <input
          key={aspect.name}
          defaultValue={aspect.name}
          aria-label='Aspect name'
          onBlur={({ target }) => {
            if (target.value.trim() && target.value !== aspect.name) onUpdate(aspect.id, { name: target.value.trim() });
          }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          style={{ flex: '1 1 auto', minWidth: 0, fontStyle: 'italic' }}
        />}
        {!canRename && <i style={{ flex: '1 1 auto' }}>{aspect.name}</i>}
        {canRename && <button
          title={onSheet ? "Remove from the character's sheet" : 'Remove'}
          aria-label={`Remove ${aspect.name}`}
          onClick={() => onRemove(aspect.id)}
        >×</button>}
      </div>
      <div className='d-flex align-center gap-1 flex-wrap'>
        <small style={{ color: KIND_COLORS[aspect.kind] }} title={kind.hint}>{kind.label}{consequence || fromSheet ? ` · ${aspect.note}` : onSheet && ' · on sheet'}</small>
        <span className='d-flex align-center gap-0' aria-label={`${aspect.freeInvokes} free invokes`}>
          {Array.from({ length: aspect.freeInvokes }, (_, i) => (
            <span
              key={i}
              role={canEdit ? 'button' : undefined}
              title={canEdit ? 'Spend a free invoke' : 'Free invoke'}
              onClick={canEdit ? spendInvoke : undefined}
              style={{ cursor: canEdit ? 'pointer' : undefined, fontSize: '1.1em', lineHeight: 1 }}
            >●</span>
          ))}
        </span>
        {canEdit && aspect.kind !== 'boost' && !fromSheet && (
          <button title='Add a free invoke' onClick={() => onUpdate(aspect.id, { freeInvokes: aspect.freeInvokes + 1 })}>+ invoke</button>
        )}
        {canEdit && !onSheet && aspect.kind === 'temporary' && aspect.target && !tokenIdOfActor(aspect.target) && (
          <button title="Move it onto the character's sheet so it outlasts the scene" onClick={() => onKeepOnSheet(aspect)}>Keep on sheet</button>
        )}
      </div>
    </li>
  );
}

export default function AspectsPanel({ campaignShortname, aspects, characters, sheetAspects, consequences, characterAspects, canEdit, gm, onAdd, onUpdate, onRemove, onKeepOnSheet, onEndScene }: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AspectKind>('situation');
  const [target, setTarget] = useState('');
  const [invokes, setInvokes] = useState(aspectKind('situation').defaultInvokes);
  const { viewOf, change } = useGroupViews(canEdit);

  // Characters on the map, plus any an aspect is still attached to after its token was removed.
  const groups: SceneCharacter[] = [...characters];
  for (const aspect of aspects) {
    if (aspect.target && !groups.some(c => c.key === aspect.target)) {
      const scoped = Boolean(tokenIdOfActor(aspect.target));
      groups.push({ key: aspect.target, shortname: scoped ? '' : aspect.target, title: aspect.targetTitle ?? aspect.target, scoped });
    }
  }

  const rowProps = { canEdit, onUpdate, onRemove, onKeepOnSheet };
  const sceneAspects = aspects.filter(a => !a.target);

  // Temporary aspects are kept on a character's sheet, so they need a character.
  const needsCharacter = kind === 'temporary' && !groups.some(c => c.key === target);

  const add = () => {
    if (!name.trim() || needsCharacter) return;
    const character = groups.find(c => c.key === target);
    onAdd({
      name: name.trim(),
      kind,
      freeInvokes: kind === 'boost' ? 1 : Math.max(0, invokes),
      target: character?.key ?? null,
      ...(character ? { targetTitle: character.title } : {}),
    });
    setName('');
  };

  return (
    <div className='d-flex flex-col gap-2'>
      <h3 className='ma-0'>Aspects</h3>

      {(() => {
        const view = viewOf(SCENE_GROUP);
        return <div>
          <GroupHeader title='Scene' view={view} count={sceneAspects.length} canEdit={canEdit} onChange={changes => change(SCENE_GROUP, changes)} />
          {!view.folded && <>
            {sceneAspects.length === 0 && <small>No situation aspects yet.</small>}
            {view.editing
              ? <ul className='ma-0 pa-0 d-flex flex-col gap-1' style={{ listStyle: 'none' }}>
                {sceneAspects.map(aspect => <AspectRow key={aspect.id} aspect={aspect} {...rowProps} />)}
              </ul>
              : <CompactAspects aspects={sceneAspects} />}
          </>}
        </div>;
      })()}

      {groups.map(character => {
        const attached = aspects.filter(a => a.target === character.key);
        const kept: SceneAspect[] = (character.scoped ? [] : sheetAspects[character.shortname] ?? [])
          .map((entry, i) => ({
            id: sheetAspectId(character.shortname, i),
            name: entry.name ?? '',
            kind: 'temporary' as const,
            freeInvokes: sheetInvokes(entry),
            target: character.shortname,
          }))
          .filter(a => a.name);
        const taken = consequences[character.key] ?? [];
        const own = characterAspects[character.key] ?? [];
        const view = viewOf(character.key);
        const count = own.length + kept.length + taken.length + attached.length;
        return (
          <div key={character.key}>
            <GroupHeader
              title={character.shortname
                ? <Link className='link link-animated' to={`/campaigns/${campaignShortname}/characters/${character.shortname}`}>{character.title}</Link>
                : character.title}
              view={view}
              count={count}
              canEdit={canEdit}
              onChange={changes => change(character.key, changes)}
            />
            {!view.folded && <>
              {count === 0 && <small>No aspects in play.</small>}
              {view.editing
                ? <ul className='ma-0 pa-0 d-flex flex-col gap-1' style={{ listStyle: 'none' }}>
                  {own.map(aspect => <AspectRow key={aspect.id} aspect={aspect} {...rowProps} />)}
                  {kept.map(aspect => <AspectRow key={aspect.id} aspect={aspect} onSheet {...rowProps} />)}
                  {taken.map(aspect => <AspectRow key={aspect.id} aspect={aspect} {...rowProps} />)}
                  {attached.map(aspect => <AspectRow key={aspect.id} aspect={aspect} {...rowProps} />)}
                </ul>
                : <CompactAspects aspects={[...own, ...taken, ...kept, ...attached]} />}
            </>}
          </div>
        );
      })}

      {canEdit && (
        <form className='d-flex flex-col gap-1' onSubmit={e => { e.preventDefault(); add(); }}>
          <h4 className='ma-0'>New aspect</h4>
          <input placeholder='Aspect' aria-label='New aspect name' value={name} onChange={({ target }) => setName(target.value)} />
          <div className='d-flex gap-1 flex-wrap'>
            <select aria-label='Kind' value={kind} onChange={({ target }) => {
              const next = target.value as AspectKind;
              setKind(next);
              setInvokes(aspectKind(next).defaultInvokes);
            }}>
              {ADDABLE_ASPECT_KINDS.map(k => <option key={k.kind} value={k.kind} title={k.hint}>{k.label}</option>)}
            </select>
            <select aria-label='Attached to' value={target} onChange={({ target }) => setTarget(target.value)}>
              <option value=''>The scene</option>
              {groups.map(c => <option key={c.key} value={c.key}>{c.title}</option>)}
            </select>
          </div>
          <label className='d-flex align-center gap-1'>
            <small>Free invokes</small>
            <input
              type='number'
              min={0}
              max={9}
              value={kind === 'boost' ? 1 : invokes}
              disabled={kind === 'boost'}
              onChange={({ target }) => setInvokes(Number(target.value))}
              style={{ width: '4em' }}
            />
          </label>
          {needsCharacter && <small>Temporary aspects go on a character's sheet, so pick a character.</small>}
          <button type='submit' disabled={!name.trim() || needsCharacter}>Add aspect</button>
        </form>
      )}

      {canEdit && gm && aspects.length > 0 && (
        <button onClick={onEndScene} title='Clear the situation aspects, advantages and boosts; temporary aspects stay on character sheets'>End scene</button>
      )}
    </div>
  );
}
