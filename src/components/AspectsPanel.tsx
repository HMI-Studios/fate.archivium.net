import { useState } from 'react';
import { Link } from 'react-router';
import { ASPECT_KINDS, aspectKind, type AspectKind, type SceneAspect, type SheetAspect } from '../fate/aspects';

export type SceneCharacter = {
  shortname: string;
  title: string;
};

const KIND_COLORS: { [kind in AspectKind]: string } = {
  situation: '#4682B4',
  advantage: '#3CB371',
  boost: '#FF7F50',
  temporary: '#C71585',
};

interface Props {
  campaignShortname: string;
  aspects: SceneAspect[];
  // Characters with a token in the scene.
  characters: SceneCharacter[];
  // Temporary aspects already kept on each character's sheet.
  sheetAspects: { [shortname: string]: SheetAspect[] };
  canEdit: boolean;
  // Whether the viewer runs the scene (may end it).
  gm: boolean;
  onAdd: (aspect: Omit<SceneAspect, 'id'>) => void;
  onUpdate: (id: string, changes: Partial<SceneAspect>) => void;
  onRemove: (id: string) => void;
  onKeepOnSheet: (aspect: SceneAspect) => void;
  onEndScene: () => void;
}

function AspectRow({ aspect, canEdit, onUpdate, onRemove, onKeepOnSheet }: {
  aspect: SceneAspect,
  canEdit: boolean,
  onUpdate: Props['onUpdate'],
  onRemove: Props['onRemove'],
  onKeepOnSheet: Props['onKeepOnSheet'],
}) {
  const kind = aspectKind(aspect.kind);

  // Spending a boost's last free invoke uses the boost up.
  const spendInvoke = () => {
    if (aspect.kind === 'boost' && aspect.freeInvokes <= 1) onRemove(aspect.id);
    else onUpdate(aspect.id, { freeInvokes: Math.max(0, aspect.freeInvokes - 1) });
  };

  return (
    <li className='d-flex flex-col gap-0' style={{ borderLeft: `3px solid ${KIND_COLORS[aspect.kind]}`, paddingLeft: 6 }}>
      <div className='d-flex align-center gap-1'>
        {canEdit
          ? <input
            value={aspect.name}
            aria-label='Aspect name'
            onChange={({ target }) => onUpdate(aspect.id, { name: target.value })}
            style={{ flex: '1 1 auto', minWidth: 0, fontStyle: 'italic' }}
          />
          : <i style={{ flex: '1 1 auto' }}>{aspect.name}</i>}
        {canEdit && <button title='Remove' aria-label={`Remove ${aspect.name}`} onClick={() => onRemove(aspect.id)}>×</button>}
      </div>
      <div className='d-flex align-center gap-1 flex-wrap'>
        <small style={{ color: KIND_COLORS[aspect.kind] }} title={kind.hint}>{kind.label}</small>
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
        {canEdit && aspect.kind !== 'boost' && (
          <button title='Add a free invoke' onClick={() => onUpdate(aspect.id, { freeInvokes: aspect.freeInvokes + 1 })}>+ invoke</button>
        )}
        {canEdit && aspect.kind === 'temporary' && aspect.target && (
          <button title="Move it onto the character's sheet so it outlasts the scene" onClick={() => onKeepOnSheet(aspect)}>Keep on sheet</button>
        )}
      </div>
    </li>
  );
}

export default function AspectsPanel({ campaignShortname, aspects, characters, sheetAspects, canEdit, gm, onAdd, onUpdate, onRemove, onKeepOnSheet, onEndScene }: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AspectKind>('situation');
  const [target, setTarget] = useState('');
  const [invokes, setInvokes] = useState(aspectKind('situation').defaultInvokes);

  // Characters on the map, plus any an aspect is still attached to after its token was removed.
  const groups: SceneCharacter[] = [...characters];
  for (const aspect of aspects) {
    if (aspect.target && !groups.some(c => c.shortname === aspect.target)) {
      groups.push({ shortname: aspect.target, title: aspect.targetTitle ?? aspect.target });
    }
  }

  const rowProps = { canEdit, onUpdate, onRemove, onKeepOnSheet };
  const sceneAspects = aspects.filter(a => !a.target);

  const add = () => {
    if (!name.trim()) return;
    const character = groups.find(c => c.shortname === target);
    onAdd({
      name: name.trim(),
      kind,
      freeInvokes: kind === 'boost' ? 1 : Math.max(0, invokes),
      target: character?.shortname ?? null,
      ...(character ? { targetTitle: character.title } : {}),
    });
    setName('');
  };

  return (
    <div className='d-flex flex-col gap-2'>
      <h3 className='ma-0'>Aspects</h3>

      <div>
        <h4 className='ma-0 mb-1'>Scene</h4>
        {sceneAspects.length === 0 && <small>No situation aspects yet.</small>}
        <ul className='ma-0 pa-0 d-flex flex-col gap-1' style={{ listStyle: 'none' }}>
          {sceneAspects.map(aspect => <AspectRow key={aspect.id} aspect={aspect} {...rowProps} />)}
        </ul>
      </div>

      {groups.map(character => {
        const attached = aspects.filter(a => a.target === character.shortname);
        const kept = (sheetAspects[character.shortname] ?? []).filter(a => a.name);
        return (
          <div key={character.shortname}>
            <h4 className='ma-0 mb-1'>
              <Link className='link link-animated' to={`/campaigns/${campaignShortname}/characters/${character.shortname}`}>{character.title}</Link>
            </h4>
            {attached.length === 0 && kept.length === 0 && <small>No aspects in play.</small>}
            <ul className='ma-0 pa-0 d-flex flex-col gap-1' style={{ listStyle: 'none' }}>
              {attached.map(aspect => <AspectRow key={aspect.id} aspect={aspect} {...rowProps} />)}
            </ul>
            {kept.length > 0 && (
              <small className='mt-1' style={{ display: 'block' }}>
                On sheet: {kept.map((a, i) => <span key={i}>{i > 0 && ', '}<i>{a.name}</i>{a.note && ` (${a.note})`}</span>)}
              </small>
            )}
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
              {ASPECT_KINDS.map(k => <option key={k.kind} value={k.kind} title={k.hint}>{k.label}</option>)}
            </select>
            <select aria-label='Attached to' value={target} onChange={({ target }) => setTarget(target.value)}>
              <option value=''>The scene</option>
              {groups.map(c => <option key={c.shortname} value={c.shortname}>{c.title}</option>)}
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
          <button type='submit' disabled={!name.trim()}>Add aspect</button>
        </form>
      )}

      {canEdit && gm && aspects.length > 0 && (
        <button onClick={onEndScene} title='Clear the scene’s aspects; temporary aspects on characters move to their sheets'>End scene</button>
      )}
    </div>
  );
}
