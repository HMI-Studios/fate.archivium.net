import Konva from 'konva';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Circle, Group, Image as KonvaImage, Label, Layer, Line, Rect, Stage, Tag, Text } from 'react-konva';
import * as Y from 'yjs';
import { ARCHIVIUM_URL } from '../App';
import { CONSEQUENCE_INVOKES_KEY, consequenceId, consequenceInvokes, fromSceneSheet, parseConsequenceId, parseSheetAspectId, withConsequenceInvokes, SCENE_ASPECTS_KEY, sheetAspectId, sheetInvokes, TEMPORARY_ASPECTS_KEY, toSceneSheet, toSheetAspect, type SceneAspect, type SheetAspect } from '../fate/aspects';
import { initiativeOrder, modeOf, moveInOrder, passTurn, setCurrent, startNextRound, stepTurn, undoPass, waitingToAct, type CombatState, type ConflictKind } from '../fate/combat';
import { fetchSettings, type TurnOrderMode } from '../fate/settings';
import { useTable } from '../fate/table';
import { FATE_CORE_LAYOUT } from '../fate/coreLayout';
import { fatePoints, rollFateDice, ROLL_LOG_SIZE, skillRatings, type InvokeEffect, type Roll, type RollInvoke } from '../fate/dice';
import { galleryImageUrl, portraitId, useCanvasImage } from '../fate/portrait';
import { FATE_SCENE_LAYOUT } from '../fate/sceneLayout';
import { consequenceSlots, stressTracks, takenConsequences, trackKey, withBoxToggled } from '../fate/stress';
import { MONSTER_TYPE, TOKEN_STATES_KEY, tokenActorKey, tokenIdOfActor, tokenSheet, type TokenState } from '../fate/tokenState';
import { getPath, setPath } from '../layout/core';
import { fetchLayoutTab, layoutTabData, updateLayoutTab, updateSheetKey } from '../fate/sheetData';
import { isLive, useSyncedDoc } from '../sync';
import { debounce } from '../util';
import AspectsPanel, { type SceneCharacter } from './AspectsPanel';
import CombatTracker, { type CombatEntry } from './CombatTracker';
import DiceRoller, { type InvokableAspect } from './DiceRoller';
import Journal from './Journal';
import { FullScreen, panelStyle, TOPBAR_HEIGHT, TopBar } from './PlayLayout';
import SideDrawer, { DRAWER_WIDTH } from './SideDrawer';

export type BaseShape = {
  id: string;
  clientID: number;   // 👈 identify the author
};

export type RectShape = BaseShape & {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
};

export type LineShape = BaseShape & {
  type: 'line';
  points: number[];
  stroke: string;
  strokeWidth: number;
  lineCap: 'round';
  lineJoin: 'round';
};

export type TokenShape = BaseShape & {
  type: 'token';
  x: number;
  y: number;
  itemShortname: string;
  itemTitle: string;
  // The item's category; tokens placed before this was recorded look it up instead.
  itemType?: string;
  color: string;
};

export type Shape = RectShape | LineShape | TokenShape;

type MapItem = {
  shortname: string;
  title: string;
  item_type: string;
};

// Scene-wide settings every client needs to follow along, e.g. after the GM
// uploads a new background image.
type SceneMeta = {
  width: number;
  height: number;
  imageStamp: number | null;
};

const TOKEN_CATEGORIES = ['pc', 'npc', 'monster'];

const MIN_SCALE = 0.05;
const MAX_SCALE = 10;

type Camera = { x: number; y: number; scale: number };

function fitCamera(viewWidth: number, viewHeight: number, mapWidth: number, mapHeight: number): Camera {
  const scale = Math.min(viewWidth / mapWidth, viewHeight / mapHeight) * 0.95;
  return {
    scale,
    x: (viewWidth - mapWidth * scale) / 2,
    y: (viewHeight - mapHeight * scale) / 2,
  };
}

// Stretch a shape from one map size to another, so it stays over the same spot
// of the map when the map's dimensions change (e.g. a new background image).
function scaleShape(shape: Shape, sx: number, sy: number): Shape {
  switch (shape.type) {
    case 'rect':
      return { ...shape, x: shape.x * sx, y: shape.y * sy, width: shape.width * sx, height: shape.height * sy };
    case 'token':
      return { ...shape, x: shape.x * sx, y: shape.y * sy };
    case 'line':
      return { ...shape, points: shape.points.map((p, i) => p * (i % 2 === 0 ? sx : sy)) };
  }
}

const TOKEN_RADIUS = 20;

// Archivium can't delete a map's image, so removing the background only hides it:
// the scene item remembers this flag until a new image is uploaded.
const MAP_IMAGE_HIDDEN_KEY = 'mapImageHidden';

// A token's circle: the character's portrait clipped to it, ringed in the token's
// color, or just the color while there's no portrait (or it hasn't loaded yet).
function TokenFace({ color, portraitUrl, selected }: { color: string, portraitUrl: string | null, selected: boolean }) {
  const image = useCanvasImage(portraitUrl);
  if (!image) {
    return <Circle radius={TOKEN_RADIUS} fill={color} stroke={selected ? 'red' : 'black'} strokeWidth={selected ? 3 : 1} />;
  }
  const inner = TOKEN_RADIUS - 2;
  const scale = Math.max((2 * inner) / image.width, (2 * inner) / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return <>
    <Circle radius={TOKEN_RADIUS} fill={color} />
    <Group clipFunc={ctx => ctx.arc(0, 0, inner, 0, Math.PI * 2)}>
      <KonvaImage image={image} x={-width / 2} y={-height / 2} width={width} height={height} />
    </Group>
    <Circle radius={TOKEN_RADIUS} stroke={selected ? 'red' : color} strokeWidth={selected ? 3 : 2.5} />
  </>;
}

interface Props {
  campaignShortname: string;
  sceneShortname: string;
  // Whether this viewer runs the scene: may replace the background image and end the scene.
  gm?: boolean;
  // The viewer's Archivium username, shown on their dice rolls.
  userName?: string;
  // The start of the top bar: where you are and how to get back.
  header: ReactNode;
  // The end of the top bar, before the scene's own status.
  headerEnd?: ReactNode;
}

// The layout tabs holding characters' sheets (temporary aspects, stress, fate points)
// and a scene's own sheet (its aspects).
const SHEET_TAB = FATE_CORE_LAYOUT.id;
const SCENE_TAB = FATE_SCENE_LAYOUT.id;

export default function SceneCanvas({ campaignShortname, sceneShortname, gm = true, userName = '', header, headerEnd }: Props) {
  const doc = useSyncedDoc(`scene/${campaignShortname}/${sceneShortname}`);
  const live = isLive(doc?.status);
  const canEdit = live && !doc.readOnly;

  const [liveShapes, setLiveShapes] = useState<Shape[]>([]);
  const [savedShapes, setSavedShapes] = useState<Shape[] | null>(null);
  const [liveAspects, setLiveAspects] = useState<SceneAspect[]>([]);
  const [liveCombat, setLiveCombat] = useState<CombatState | null>(null);
  const [savedCombat, setSavedCombat] = useState<CombatState | null>(null);
  const [liveTokenStates, setLiveTokenStates] = useState<{ [tokenId: string]: TokenState }>({});
  const [savedTokenStates, setSavedTokenStates] = useState<{ [tokenId: string]: TokenState }>({});
  const [savedAspects, setSavedAspects] = useState<SceneAspect[]>([]);
  // Sheet data of the characters in the scene, for their temporary aspects, skills and fate points.
  const [sheets, setSheets] = useState<{ [shortname: string]: Record<string, unknown> }>({});
  const [drawing, setDrawing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [meta, setMeta] = useState<SceneMeta>({ width: 1000, height: 1000, imageStamp: null });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const [tokenCandidates, setTokenCandidates] = useState<MapItem[]>([]);
  // The campaign's turn order setting, used when a conflict starts.
  const [turnOrder, setTurnOrder] = useState<TurnOrderMode>('initiative');
  const [tokenPick, setTokenPick] = useState('');

  const [tool, setTool] = useState<'pan' | 'draw'>('pan');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const backgroundInput = useRef<HTMLInputElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const fittedFor = useRef<string | null>(null);

  const myLineId = useRef<string | null>(null);
  const seeded = useRef(false);

  const ydoc = doc?.ydoc;
  const provider = doc?.provider;
  const yShapes = ydoc?.getMap<Shape>('shapes');
  const yMeta = ydoc?.getMap<SceneMeta[keyof SceneMeta]>('meta');
  const yAspects = ydoc?.getMap<SceneAspect>('aspects');
  // The dice log is campaign-wide, kept in the table doc rather than the scene's.
  const table = useTable(campaignShortname, gm);
  const yRolls = table.writableRolls;
  // The conflict's turn order, if one is running (key `state`).
  const yCombat = ydoc?.getMap<CombatState>('combat');
  // Monster tokens' own copies of their changing stats (see fate/tokenState.ts).
  const yTokenStates = ydoc?.getMap<TokenState>(TOKEN_STATES_KEY);

  useEffect(() => {
    fetchSettings(campaignShortname).then(settings => setTurnOrder(settings.turnOrder)).catch(() => {});
  }, [campaignShortname]);

  useEffect(() => {
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok) return;
      const items = await response.json();
      setTokenCandidates(items.filter((item: MapItem) => TOKEN_CATEGORIES.includes(item.item_type)));
    });
  }, [campaignShortname]);

  // The last persisted save: used to seed an empty live doc, and shown as-is when
  // live sync is unavailable.
  useEffect(() => {
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${sceneShortname}`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      const objData = typeof data.obj_data === 'string' ? JSON.parse(data.obj_data) : data.obj_data;
      if (data.map) {
        setMeta(m => ({
          width: data.map.width ?? m.width,
          height: data.map.height ?? m.height,
          imageStamp: objData?.[MAP_IMAGE_HIDDEN_KEY] ? null : data.map.image_id ?? null,
        }));
      }
      // Scenes saved before scene sheets kept their aspects in obj_data.sceneAspects.
      const sceneSheetAspects = layoutTabData(objData, SCENE_TAB)[SCENE_ASPECTS_KEY];
      setSavedAspects(sceneSheetAspects !== undefined ? fromSceneSheet(sceneSheetAspects) : (objData?.sceneAspects ?? []));
      setSavedCombat(objData?.combat ?? null);
      setSavedTokenStates(objData?.[TOKEN_STATES_KEY] ?? {});
      setSavedShapes(objData?.mapData ?? []);
    });
  }, [campaignShortname, sceneShortname]);

  useEffect(() => {
    if (!ydoc || !provider || !yShapes || !yMeta || !yAspects || !yCombat || !yTokenStates) return;

    const updateShapes = () => setLiveShapes(Array.from(yShapes.values()));
    const updateAspects = () => setLiveAspects(Array.from(yAspects.values()));
    const updateCombat = () => setLiveCombat(yCombat.get('state') ?? null);
    const updateTokenStates = () => setLiveTokenStates(Object.fromEntries(yTokenStates.entries()));
    const updateMeta = () => {
      if (!yMeta.has('width')) return;
      setMeta({
        width: yMeta.get('width') as number,
        height: yMeta.get('height') as number,
        imageStamp: (yMeta.get('imageStamp') as number | null) ?? null,
      });
    };
    yShapes.observe(updateShapes);
    yMeta.observe(updateMeta);
    yAspects.observe(updateAspects);
    yCombat.observe(updateCombat);
    yTokenStates.observe(updateTokenStates);
    updateShapes();
    updateMeta();
    updateAspects();
    updateCombat();
    updateTokenStates();

    // Persist our own edits; updates that arrive from the server were saved by
    // whoever made them. The data endpoint merges into obj_data, so this leaves
    // the item's other Archivium content (body, tabs, etc.) untouched. Aspects go on
    // the scene sheet tab, applied over a fresh copy so its other fields (which can
    // be edited in Archivium) and the item's other layout tabs are kept.
    const onUpdate = (_: Uint8Array, origin: unknown) => {
      if (origin === provider) return;
      debounce(`scene-save-${sceneShortname}`, async () => {
        const sceneData = {
          mapData: Array.from(yShapes.values()),
          combat: yCombat.get('state') ?? null,
          [TOKEN_STATES_KEY]: Object.fromEntries(yTokenStates.entries()),
        };
        try {
          await updateLayoutTab(
            campaignShortname,
            sceneShortname,
            SCENE_TAB,
            fresh => ({ ...fresh, [SCENE_ASPECTS_KEY]: toSceneSheet(Array.from(yAspects.values())) }),
            sceneData,
          );
        } catch {
          // Without a fresh copy of the scene sheet, still save the map; aspects
          // are saved with the next change.
          await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${sceneShortname}/data`, {
            credentials: 'include',
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(sceneData),
          }).catch(() => {});
        }
      }, 500);
    };
    ydoc.on('update', onUpdate);

    return () => {
      yShapes.unobserve(updateShapes);
      yMeta.unobserve(updateMeta);
      yAspects.unobserve(updateAspects);
      yCombat.unobserve(updateCombat);
      yTokenStates.unobserve(updateTokenStates);
      ydoc.off('update', onUpdate);
    };
  }, [ydoc]);

  // Seed the live doc from the last save if nobody has loaded this scene since the
  // server last started. Shapes are keyed by id, so two clients seeding at once
  // converge instead of duplicating.
  useEffect(() => {
    if (!canEdit || !ydoc || !yShapes || !yMeta || !yAspects || !yCombat || !yTokenStates || savedShapes === null || seeded.current) return;
    seeded.current = true;
    ydoc.transact(() => {
      if (yShapes.size === 0) savedShapes.forEach(shape => yShapes.set(shape.id, shape));
      if (yAspects.size === 0) savedAspects.forEach(aspect => yAspects.set(aspect.id, aspect));
      if (!yCombat.has('state') && savedCombat) yCombat.set('state', savedCombat);
      if (yTokenStates.size === 0) Object.entries(savedTokenStates).forEach(([id, state]) => yTokenStates.set(id, state));
      if (!yMeta.has('width')) {
        yMeta.set('width', meta.width);
        yMeta.set('height', meta.height);
        yMeta.set('imageStamp', meta.imageStamp);
      }
    });
  }, [canEdit, ydoc, savedShapes]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fit the whole map into view whenever its dimensions change.
  useEffect(() => {
    if (!viewport.width || !viewport.height) return;
    const key = `${meta.width}x${meta.height}`;
    if (fittedFor.current === key) return;
    fittedFor.current = key;
    setCamera(fitCamera(viewport.width, viewport.height, meta.width, meta.height));
  }, [viewport, meta.width, meta.height]);

  useEffect(() => {
    if (meta.imageStamp === null) {
      setBgImage(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'use-credentials';
    img.onload = () => setBgImage(img);
    img.src = `${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${sceneShortname}/map/image?v=${meta.imageStamp}`;
  }, [meta.imageStamp, campaignShortname, sceneShortname]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) return;
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Read-only viewers of a scene nobody has opened yet see the last save instead
  // of an empty doc.
  const showLive = live && (liveShapes.length > 0 || liveAspects.length > 0 || canEdit);
  const shapes = showLive ? liveShapes : (savedShapes ?? []);
  const aspects = showLive ? liveAspects : savedAspects;
  const combat = showLive ? liveCombat : savedCombat;
  const tokenStates = showLive ? liveTokenStates : savedTokenStates;

  const tokens = shapes.filter((shape): shape is TokenShape => shape.type === 'token');
  const isMonster = (token: TokenShape) => (token.itemType ?? tokenCandidates.find(c => c.shortname === token.itemShortname)?.item_type) === MONSTER_TYPE;
  // Several tokens of one character are numbered, e.g. "Goblin 2".
  const tokenLabel = (token: TokenShape) => {
    const same = tokens.filter(t => t.itemShortname === token.itemShortname);
    return same.length > 1 ? `${token.itemTitle} ${same.indexOf(token) + 1}` : token.itemTitle;
  };

  // Who's in the scene: one entry per PC or NPC, and one per monster token.
  const characters: SceneCharacter[] = [];
  for (const token of tokens) {
    if (isMonster(token)) {
      characters.push({ key: tokenActorKey(token.id), shortname: token.itemShortname, title: tokenLabel(token), scoped: true });
    } else if (!characters.some(c => c.key === token.itemShortname)) {
      characters.push({ key: token.itemShortname, shortname: token.itemShortname, title: token.itemTitle });
    }
  }
  const sheetShortnames = [...new Set(tokens.map(t => t.itemShortname))].sort().join(',');

  // The sheet a token plays from: a monster token's own copy of its changing stats over
  // the monster's sheet, otherwise the character's shared sheet.
  const tokenView = (token: TokenShape): Record<string, unknown> | undefined => (
    isMonster(token) ? tokenSheet(sheets[token.itemShortname], tokenStates[token.id]) : sheets[token.itemShortname]
  );
  const actorSheet = (key: string): Record<string, unknown> | undefined => {
    const tokenId = tokenIdOfActor(key);
    if (!tokenId) return sheets[key];
    const token = tokens.find(t => t.id === tokenId);
    return token ? tokenView(token) : undefined;
  };

  const setTokenState = (tokenId: string, update: (state: TokenState) => TokenState) => {
    if (!canEdit || !yTokenStates) return;
    yTokenStates.set(tokenId, update(yTokenStates.get(tokenId) ?? {}));
  };

  const portraitUrl = (shortname: string) => {
    const id = portraitId(sheets[shortname]);
    return id === null ? null : galleryImageUrl(campaignShortname, shortname, id);
  };

  // Every token is a combatant.
  const combatEntries: CombatEntry[] = tokens.map(token => {
    const view = tokenView(token);
    return {
      tokenId: token.id,
      label: tokenLabel(token),
      color: token.color,
      portraitUrl: portraitUrl(token.itemShortname),
      stress: stressTracks(view),
      consequences: takenConsequences(view),
      ...(isMonster(token) ? { consequenceSlots: consequenceSlots(view) } : {}),
    };
  });

  // Ticking a stress box on a card: a monster token changes its own copy; anyone else
  // saves to the freshest copy of their sheet, which all their tokens share.
  const toggleStress = async (tokenId: string, path: string, index: number) => {
    const token = tokens.find(t => t.id === tokenId);
    if (!canEdit || !token) return;
    if (isMonster(token)) {
      const key = trackKey(path);
      setTokenState(token.id, state => ({ ...state, [key]: withBoxToggled(tokenView(token), path, index) }));
      return;
    }
    const shortname = token.itemShortname;
    const key = trackKey(path);
    setSheetKey(shortname, key, withBoxToggled(sheets[shortname], path, index));
    try {
      const saved = await updateSheetKey(campaignShortname, shortname, SHEET_TAB, key, fresh => withBoxToggled({ [key]: fresh }, path, index));
      setSheetKey(shortname, key, saved);
      ySheetStamps?.set(shortname, Date.now());
    } catch {
      window.alert(`Couldn't save ${token.itemTitle}'s stress.`);
      loadSheets([shortname]);
    }
  };

  // A monster token's consequence, typed on its combat card.
  const setConsequence = (tokenId: string, path: string, text: string) => {
    const token = tokens.find(t => t.id === tokenId);
    if (!token || !isMonster(token)) return;
    const key = trackKey(path);
    setTokenState(tokenId, state => ({ ...state, [key]: getPath(setPath(tokenView(token) ?? {}, path, text), key) }));
  };

  const setCombat = (next: CombatState | null) => {
    if (!canEdit || !yCombat) return;
    if (next) yCombat.set('state', next);
    else yCombat.delete('state');
  };

  const startCombat = (kind: ConflictKind) => {
    // In popcorn, initiative only suggests who goes first; the GM can pick someone else.
    const order = initiativeOrder(tokens.map(t => ({ tokenId: t.id, shortname: t.itemShortname })), kind, shortname => skillRatings(sheets[shortname]));
    setCombat({ kind, mode: turnOrder, round: 1, order, current: order[0] ?? null, ...(turnOrder === 'popcorn' ? { acted: [] } : {}) });
  };

  const presentTokens = () => new Set(tokens.map(t => t.id));

  const removeCombatant = (tokenId: string) => {
    if (!combat) return;
    if (modeOf(combat) === 'popcorn') {
      // Removing whoever's acting hands the turn to someone still waiting, if anyone is.
      const next = combat.current === tokenId ? waitingToAct(combat, presentTokens())[0] ?? null : combat.current;
      const order = combat.order.filter(id => id !== tokenId);
      setCombat({ ...combat, order, acted: (combat.acted ?? []).filter(id => id !== tokenId), current: next ?? order[0] ?? null });
      return;
    }
    // Removing whoever's turn it is passes the turn on first.
    const passed = combat.current === tokenId ? stepTurn(combat, presentTokens(), 1) : combat;
    const order = passed.order.filter(id => id !== tokenId);
    setCombat({ ...passed, order, current: passed.current === tokenId ? order[0] ?? null : passed.current });
  };

  const sheetAspects: { [shortname: string]: SheetAspect[] } = Object.fromEntries(Object.entries(sheets).map(([shortname, root]) => {
    const list = root[TEMPORARY_ASPECTS_KEY];
    return [shortname, Array.isArray(list) ? list as SheetAspect[] : []];
  }));

  // The consequences each character in the scene has taken, as aspects.
  const consequenceAspects: { [key: string]: SceneAspect[] } = Object.fromEntries(characters.map(character => {
    const sheet = actorSheet(character.key);
    return [character.key, consequenceSlots(sheet).filter(slot => slot.text.trim()).map(slot => ({
      id: consequenceId(character.key, slot.path),
      name: slot.text,
      kind: 'consequence' as const,
      freeInvokes: consequenceInvokes(sheet, slot.path, slot.text),
      target: character.key,
      targetTitle: character.title,
      note: slot.label,
    }))];
  }));

  const setSheetKey = (shortname: string, key: string, value: unknown) => {
    setSheets(current => ({ ...current, [shortname]: { ...current[shortname], [key]: value } }));
  };

  const loadSheets = (shortnames: string[]) => {
    shortnames.forEach(shortname => {
      fetchLayoutTab(campaignShortname, shortname, SHEET_TAB)
        .then(root => setSheets(current => ({ ...current, [shortname]: root })))
        .catch(() => {});
    });
  };

  useEffect(() => {
    if (sheetShortnames) loadSheets(sheetShortnames.split(','));
  }, [sheetShortnames]);

  // Sheets aren't live-synced, so whoever changes a character's sheet aspects from a
  // scene bumps a stamp in the scene doc, and everyone else reloads that sheet.
  const ySheetStamps = ydoc?.getMap<number>('sheetStamps');
  useEffect(() => {
    if (!ySheetStamps) return;
    const onStamp = (event: Y.YMapEvent<number>) => {
      if (!event.transaction.local) loadSheets(Array.from(event.keysChanged));
    };
    ySheetStamps.observe(onStamp);
    return () => ySheetStamps.unobserve(onStamp);
  }, [ydoc]);

  // Change a character's sheet aspects: shown straight away, then applied to the
  // freshest copy of the sheet. Resolves to whether it was saved.
  const changeSheetAspects = async (shortname: string, update: (list: SheetAspect[]) => SheetAspect[]): Promise<boolean> => {
    if (!canEdit) return false;
    setSheetKey(shortname, TEMPORARY_ASPECTS_KEY, update(sheetAspects[shortname] ?? []));
    try {
      const saved = await updateSheetKey<SheetAspect[]>(campaignShortname, shortname, SHEET_TAB, TEMPORARY_ASPECTS_KEY, list => update(Array.isArray(list) ? list : []));
      setSheetKey(shortname, TEMPORARY_ASPECTS_KEY, saved);
      ySheetStamps?.set(shortname, Date.now());
      return true;
    } catch {
      window.alert("Couldn't save the change to the character's sheet.");
      loadSheets([shortname]);
      return false;
    }
  };

  // A consequence's free invokes: a monster token's own copy, or else the character's
  // sheet, remembering which consequence they're for.
  const setConsequenceInvokes = async (actorKey: string, path: string, invokes: number) => {
    const text = consequenceAspects[actorKey]?.find(a => a.id === consequenceId(actorKey, path))?.name;
    if (!canEdit || text === undefined) return;
    const tokenId = tokenIdOfActor(actorKey);
    if (tokenId) {
      setTokenState(tokenId, state => ({ ...state, [CONSEQUENCE_INVOKES_KEY]: withConsequenceInvokes(actorSheet(actorKey)?.[CONSEQUENCE_INVOKES_KEY], path, text, invokes) }));
      return;
    }
    setSheetKey(actorKey, CONSEQUENCE_INVOKES_KEY, withConsequenceInvokes(sheets[actorKey]?.[CONSEQUENCE_INVOKES_KEY], path, text, invokes));
    try {
      const saved = await updateSheetKey(campaignShortname, actorKey, SHEET_TAB, CONSEQUENCE_INVOKES_KEY, fresh => withConsequenceInvokes(fresh, path, text, invokes));
      setSheetKey(actorKey, CONSEQUENCE_INVOKES_KEY, saved);
      ySheetStamps?.set(actorKey, Date.now());
    } catch {
      window.alert(`Couldn't save the free invokes on ${titleOf(actorKey)}'s consequence.`);
      loadSheets([actorKey]);
    }
  };

  // Find a panel row's entry in a (possibly fresher) copy of the list: the same
  // position if it still holds the same aspect, otherwise the first with its name.
  const locateSheetAspect = (list: SheetAspect[], shortname: string, index: number) => {
    const name = sheetAspects[shortname]?.[index]?.name;
    if (list[index]?.name === name) return index;
    return list.findIndex(entry => entry.name === name);
  };

  // Tags beside a token: its character's sheet's temporary aspects, then the scene's.
  // A monster token only has its own scene aspects.
  const tokenTags = (token: TokenShape): { name: string, freeInvokes: number }[] => {
    if (isMonster(token)) return [...consequenceAspects[tokenActorKey(token.id)] ?? [], ...aspects.filter(a => a.target === tokenActorKey(token.id))];
    return [
      ...(sheetAspects[token.itemShortname] ?? []).filter(a => a.name).map(a => ({ name: a.name!, freeInvokes: sheetInvokes(a) })),
      ...consequenceAspects[token.itemShortname] ?? [],
      ...aspects.filter(a => a.target === token.itemShortname),
    ];
  };

  // Everything that can be invoked on a roll: the scene's aspects, the temporary
  // aspects on the sheets of characters in the scene, and their consequences.
  const titleOf = (key: string) => characters.find(c => c.key === key)?.title ?? key;
  const invokableAspects: InvokableAspect[] = [
    ...aspects.map(a => ({ id: a.id, name: a.name, freeInvokes: a.freeInvokes, ownerTitle: a.target ? a.targetTitle ?? titleOf(a.target) : 'Scene' })),
    // (Only PCs' and NPCs' sheets: a monster's sheet aspects belong to no token in particular.)
    ...Object.entries(sheetAspects).filter(([shortname]) => characters.some(c => c.key === shortname)).flatMap(([shortname, list]) => list
      .map((entry, i) => ({ id: sheetAspectId(shortname, i), name: entry.name ?? '', freeInvokes: sheetInvokes(entry), ownerTitle: titleOf(shortname) }))
      .filter(a => a.name)),
    ...Object.values(consequenceAspects).flat().map(a => ({ id: a.id, name: a.name, freeInvokes: a.freeInvokes, ownerTitle: a.targetTitle ?? titleOf(a.target!) })),
  ];

  const addRoll = (roll: Pick<Roll, 'character' | 'skill' | 'skillRating' | 'modifier'>) => {
    if (!yRolls) return;
    const at = Date.now();
    const entry: Roll = { ...roll, id: `roll-${at}-${Math.random().toString(36).slice(2, 6)}`, at, by: userName, dice: rollFateDice(), invokes: [] };
    yRolls.doc!.transact(() => {
      yRolls.set(entry.id, entry);
      const stale = Array.from(yRolls.values()).sort((a, b) => b.at - a.at).slice(ROLL_LOG_SIZE);
      stale.forEach(r => yRolls.delete(r.id));
    });
  };

  // Invoking on a roll (+2 or a reroll) spends one of the aspect's free invokes, or
  // else a fate point from the rolling character's sheet (a roll with no character
  // is the GM's).
  const invokeOnRoll = async (rollId: string, aspectId: string, effect: InvokeEffect) => {
    const roll = yRolls?.get(rollId);
    const aspect = invokableAspects.find(a => a.id === aspectId);
    if (!yRolls || !roll || !aspect) return;

    let paidWith: RollInvoke['paidWith'] = 'fate point';
    if (aspect.freeInvokes > 0) {
      paidWith = 'free invoke';
      const sceneAspect = aspects.find(a => a.id === aspectId);
      if (sceneAspect?.kind === 'boost' && sceneAspect.freeInvokes <= 1) removeAspect(aspectId);
      else updateAspect(aspectId, { freeInvokes: aspect.freeInvokes - 1 });
    } else if (roll.character && tokenIdOfActor(roll.character.key)) {
      // A monster token pays from its own fate points.
      const current = fatePoints(actorSheet(roll.character.key!));
      if (current <= 0) return;
      setTokenState(tokenIdOfActor(roll.character.key)!, state => ({ ...state, fatePoints: current - 1 }));
    } else if (roll.character) {
      const shortname = roll.character.shortname;
      const current = fatePoints(sheets[shortname]);
      if (current <= 0) return;
      setSheetKey(shortname, 'fatePoints', current - 1);
      try {
        const saved = await updateSheetKey<number>(campaignShortname, shortname, SHEET_TAB, 'fatePoints', fresh => Math.max(0, (typeof fresh === 'number' ? fresh : current) - 1));
        setSheetKey(shortname, 'fatePoints', saved);
        ySheetStamps?.set(shortname, Date.now());
      } catch {
        window.alert(`Couldn't take a fate point from ${roll.character.title}'s sheet.`);
        loadSheets([shortname]);
        return;
      }
    }
    const latest = yRolls.get(rollId) ?? roll;
    const invoke: RollInvoke = effect === 'reroll'
      ? { aspect: aspect.name, paidWith, effect, previousDice: latest.dice }
      : { aspect: aspect.name, paidWith, effect };
    yRolls.set(rollId, {
      ...latest,
      ...(effect === 'reroll' ? { dice: rollFateDice() } : {}),
      invokes: [...latest.invokes, invoke],
    });
  };

  const writableAspects = (): Y.Map<SceneAspect> | null => (canEdit && yAspects) ? yAspects : null;

  const addAspect = (aspect: Omit<SceneAspect, 'id'>) => {
    // Temporary character aspects go straight onto the sheet so they outlast the scene;
    // a monster token's stay in the scene with it.
    if (aspect.kind === 'temporary' && aspect.target && !tokenIdOfActor(aspect.target)) {
      changeSheetAspects(aspect.target, list => [...list, toSheetAspect(aspect)]);
      return;
    }
    const id = `aspect-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    writableAspects()?.set(id, { ...aspect, id });
  };

  const updateAspect = (id: string, changes: Partial<SceneAspect>) => {
    const consequence = parseConsequenceId(id);
    if (consequence) {
      // Only its free invokes change here; the rest is the sheet's.
      if (changes.freeInvokes !== undefined) setConsequenceInvokes(consequence.actorKey, consequence.path, changes.freeInvokes);
      return;
    }
    const onSheet = parseSheetAspectId(id);
    if (onSheet) {
      changeSheetAspects(onSheet.shortname, list => {
        const i = locateSheetAspect(list, onSheet.shortname, onSheet.index);
        if (i < 0) return list;
        const entry = list[i];
        const next: SheetAspect = {
          ...entry,
          ...(changes.name !== undefined ? { name: changes.name } : {}),
          ...(changes.freeInvokes !== undefined ? { invokes: toSheetAspect({ name: '', freeInvokes: changes.freeInvokes }).invokes } : {}),
        };
        return list.map((e, j) => j === i ? next : e);
      });
      return;
    }
    const target = writableAspects();
    const aspect = target?.get(id);
    if (target && aspect) target.set(id, { ...aspect, ...changes });
  };

  const removeAspect = (id: string) => {
    // Consequences are cleared on the sheet (recovery), not from the scene.
    if (parseConsequenceId(id)) return;
    const onSheet = parseSheetAspectId(id);
    if (onSheet) {
      changeSheetAspects(onSheet.shortname, list => {
        const i = locateSheetAspect(list, onSheet.shortname, onSheet.index);
        return i < 0 ? list : list.filter((_, j) => j !== i);
      });
      return;
    }
    writableAspects()?.delete(id);
  };

  // Move a temporary aspect from the scene onto its character's sheet, where it
  // outlasts the scene. (New temporary aspects go straight to the sheet; this is for
  // ones added to the scene before that.)
  const keepOnSheet = async (aspect: SceneAspect) => {
    if (!aspect.target || tokenIdOfActor(aspect.target)) return;
    if (await changeSheetAspects(aspect.target, list => [...list, toSheetAspect(aspect)])) {
      writableAspects()?.delete(aspect.id);
    }
  };

  const endScene = async () => {
    const kept = aspects.filter(a => a.kind === 'temporary' && a.target && !tokenIdOfActor(a.target));
    if (!window.confirm("End the scene? Its situation aspects, advantages and boosts will be cleared, and monsters' stress, consequences and fate points reset. Temporary aspects stay on character sheets.")) return;
    // A temporary aspect that couldn't be moved to its sheet stays in the scene.
    for (const aspect of kept) await keepOnSheet(aspect);
    const target = writableAspects();
    if (!target || !ydoc || !yTokenStates) return;
    ydoc.transact(() => {
      aspects.filter(a => !kept.includes(a)).forEach(a => target.delete(a.id));
      yTokenStates.clear();
    });
  };

  const writableShapes = (): Y.Map<Shape> | null => (canEdit && yShapes) ? yShapes : null;

  const deleteSelected = () => {
    const target = writableShapes();
    if (!selectedId || !target || !ydoc) return;
    ydoc.transact(() => {
      target.delete(selectedId);
      // A token's scene-scoped state and aspects go with it.
      yTokenStates?.delete(selectedId);
      aspects.filter(a => a.target === tokenActorKey(selectedId)).forEach(a => yAspects?.delete(a.id));
    });
    setSelectedId(null);
  };

  // Center of the visible area, in map coordinates.
  const viewCenter = () => ({
    x: (viewport.width / 2 - camera.x) / camera.scale,
    y: (viewport.height / 2 - camera.y) / camera.scale,
  });

  const addRect = () => {
    const target = writableShapes();
    if (!target || !ydoc) return;

    const center = viewCenter();
    const rect: RectShape = {
      id: `rect-${Date.now()}`,
      clientID: ydoc.clientID,
      type: 'rect',
      x: center.x - 50,
      y: center.y - 40,
      width: 100,
      height: 80,
      fill: 'skyblue'
    };
    target.set(rect.id, rect);
  };

  const addToken = () => {
    const target = writableShapes();
    if (!target || !ydoc || !tokenPick) return;
    const item = tokenCandidates.find(i => i.shortname === tokenPick);
    if (!item) return;

    const center = viewCenter();
    const token: TokenShape = {
      id: `token-${Date.now()}`,
      clientID: ydoc.clientID,
      type: 'token',
      x: center.x,
      y: center.y,
      itemShortname: item.shortname,
      itemTitle: item.title,
      itemType: item.item_type,
      color: item.item_type === 'pc' ? '#deddca' : item.item_type === 'monster' ? '#ba40f2' : '#e82c17',
    };
    target.set(token.id, token);
  };

  const handleDragMove = (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const target = writableShapes();
    if (!target) return;
    const node = e.target;
    const shape = target.get(id);
    if (!shape) return;

    const updated: Shape =
      shape.type === 'rect' || shape.type === 'token'
        ? { ...shape, x: node.x(), y: node.y() }
        : shape;

    target.set(id, updated);
  };

  const startDraw = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const target = writableShapes();
    if (!target || !ydoc || tool !== 'draw') return;
    if (e.target !== e.target.getStage()) return;
    const pos = e.target.getStage()!.getRelativePointerPosition();
    if (!pos) return;
    setDrawing(true);
    const newLine: LineShape = {
      id: `line-${Date.now()}`,
      clientID: ydoc.clientID,
      type: 'line',
      points: [pos.x, pos.y],
      stroke: 'black',
      strokeWidth: 2,
      lineCap: 'round',
      lineJoin: 'round'
    };
    myLineId.current = newLine.id;
    target.set(newLine.id, newLine);
  };

  const draw = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const target = writableShapes();
    if (!drawing || !target || !ydoc) return;
    const point = e.target.getStage()!.getRelativePointerPosition();
    const id = myLineId.current;
    if (id == null || !point) return;

    const current = target.get(id) as LineShape | undefined;
    if (!current || current.clientID !== ydoc.clientID) return;

    const updated: LineShape = {
      ...current,
      points: current.points.concat([point.x, point.y])
    };

    target.set(id, updated);
  };

  const endDraw = () => {
    setDrawing(false);
    myLineId.current = null;
  };

  const uploadImage = async (file: File) => {
    if (!canEdit || !ydoc || !yShapes || !yMeta) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${sceneShortname}/map/upload`, {
      credentials: 'include',
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      setUploading(false);
      return;
    }

    // Archivium resizes the map to the uploaded image's pixel dimensions, so
    // rescale existing shapes to keep them over the same part of the map.
    const itemResponse = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${sceneShortname}`, { credentials: 'include' });
    const data = itemResponse.ok ? await itemResponse.json() : null;
    const newWidth = data?.map?.width ?? meta.width;
    const newHeight = data?.map?.height ?? meta.height;
    ydoc.transact(() => {
      if (newWidth !== meta.width || newHeight !== meta.height) {
        const sx = newWidth / meta.width;
        const sy = newHeight / meta.height;
        Array.from(yShapes.values()).forEach(shape => yShapes.set(shape.id, scaleShape(shape, sx, sy)));
      }
      yMeta.set('width', newWidth);
      yMeta.set('height', newHeight);
      yMeta.set('imageStamp', Date.now());
    });
    await setMapImageHidden(false);
    setUploading(false);
  };

  const setMapImageHidden = (hidden: boolean) => fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${sceneShortname}/data`, {
    credentials: 'include',
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ [MAP_IMAGE_HIDDEN_KEY]: hidden }),
  });

  const removeBackground = async () => {
    if (!canEdit || !yMeta) return;
    if (!window.confirm('Remove the background image? Shapes and tokens stay where they are.')) return;
    yMeta.set('imageStamp', null);
    await setMapImageHidden(true);
  };

  const zoomAt = (point: { x: number, y: number }, factor: number) => {
    setCamera(cam => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * factor));
      const worldX = (point.x - cam.x) / cam.scale;
      const worldY = (point.y - cam.y) / cam.scale;
      return { scale, x: point.x - worldX * scale, y: point.y - worldY * scale };
    });
  };

  const zoomAtCenter = (factor: number) => zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, factor);

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = e.target.getStage()!.getPointerPosition();
    if (!pointer) return;
    zoomAt(pointer, Math.exp(-e.evt.deltaY * 0.0015));
  };

  // Shape drags bubble up to the stage, so only treat drags of the stage itself as panning.
  const handleStageDrag = (e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage();
    if (e.target !== stage) return;
    setCamera(cam => ({ ...cam, x: stage.x(), y: stage.y() }));
  };

  const clearSelection = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage()) {
      setSelectedId(null);
    }
  };

  const activeTool = canEdit ? tool : 'pan';

  const status = doc?.status === 'connecting' ? 'Connecting…'
    : doc?.status === 'offline' ? 'Offline: last saved version, read-only'
    : doc?.status === 'reconnecting' ? 'Reconnecting… changes will sync when it’s back'
    : null;

  // Floating panels sit between the drawers, clear of their tabs.
  const [aspectsOpen, setAspectsOpen] = useState(false);
  const [diceOpen, setDiceOpen] = useState(false);
  const between = {
    left: aspectsOpen ? `calc(${DRAWER_WIDTH} + 2.5rem)` : '3rem',
    right: diceOpen ? `calc(${DRAWER_WIDTH} + 2.5rem)` : '3rem',
  };

  const divider = <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--menu-border-color, #6e6e6e)' }} />;

  return (
    <FullScreen>
      <TopBar
        left={header}
        right={<>
          {headerEnd}
          {status && <small title={status} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{status}</small>}
        </>}
      />
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: TOPBAR_HEIGHT,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          touchAction: 'none',
          cursor: activeTool === 'pan' ? 'grab' : 'crosshair',
        }}
      >
        <Stage
          width={viewport.width}
          height={viewport.height}
          x={camera.x}
          y={camera.y}
          scaleX={camera.scale}
          scaleY={camera.scale}
          draggable={activeTool === 'pan'}
          onDragMove={handleStageDrag}
          onDragEnd={handleStageDrag}
          onWheel={handleWheel}
          onMouseDown={(e) => { clearSelection(e); startDraw(e); }}
          onMousemove={draw}
          onMouseup={endDraw}
          onTouchStart={(e) => { clearSelection(e); startDraw(e); }}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        >
          <Layer>
            <Rect x={0} y={0} width={meta.width} height={meta.height} fill='rgba(255, 255, 255, 0.05)' stroke='#888' strokeWidth={1} strokeScaleEnabled={false} listening={false} />
            {bgImage && <KonvaImage image={bgImage} x={0} y={0} width={meta.width} height={meta.height} listening={false} />}
            {/* Draw tokens last so drawings can never cover them. */}
            {[...shapes].sort((a, b) => Number(a.type === 'token') - Number(b.type === 'token')).map(s => {
              const selected = s.id === selectedId;
              const select = canEdit ? () => setSelectedId(s.id) : undefined;
              if (s.type === 'rect') {
                return (
                  <Rect
                    key={s.id}
                    {...s}
                    draggable={canEdit}
                    stroke={selected ? 'red' : undefined}
                    strokeWidth={selected ? 3 : 0}
                    onClick={select}
                    onTap={select}
                    onDragMove={e => handleDragMove(s.id, e)}
                    onDragEnd={e => handleDragMove(s.id, e)}
                  />
                );
              }
              if (s.type === 'token') {
                return (
                  <Group
                    key={s.id}
                    x={s.x}
                    y={s.y}
                    draggable={canEdit}
                    onClick={select}
                    onTap={select}
                    onDragMove={e => handleDragMove(s.id, e)}
                    onDragEnd={e => handleDragMove(s.id, e)}
                  >
                    {s.id === combat?.current && <Circle radius={TOKEN_RADIUS + 5} stroke='#f5c542' strokeWidth={3} listening={false} />}
                    <TokenFace color={s.color} portraitUrl={portraitUrl(s.itemShortname)} selected={selected} />
                    <Text text={tokenLabel(s)} y={24} offsetX={30} width={60} align='center' fontSize={12} />
                    {/* The character's aspects in play, as tags beside the token. */}
                    {tokenTags(s).map((tag, i) => (
                      <Label key={i} x={26} y={-18 + i * 18} listening={false}>
                        <Tag fill='#fffbe6' stroke='#8a7a3a' strokeWidth={0.5} cornerRadius={3} />
                        <Text text={tag.freeInvokes > 0 ? `${tag.name} ${'●'.repeat(tag.freeInvokes)}` : tag.name} fontStyle='italic' fontSize={11} padding={3} fill='#222' />
                      </Label>
                    ))}
                  </Group>
                );
              }
              return (
                <Line
                  key={s.id}
                  {...s}
                  hitStrokeWidth={12}
                  stroke={selected ? 'red' : s.stroke}
                  onClick={select}
                  onTap={select}
                />
              );
            })}
          </Layer>
        </Stage>
      </div>

      {/* The turn order floats over the top of the map, between the drawers' tabs. */}
      <div style={{ position: 'absolute', top: `calc(${TOPBAR_HEIGHT} + 0.5rem)`, ...between, zIndex: 15, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', maxWidth: '100%', minWidth: 0 }}>
          <CombatTracker
            state={combat}
            entries={combatEntries}
            canRun={canEdit && gm}
            canMarkStress={canEdit}
            onToggleStress={toggleStress}
            onSetConsequence={setConsequence}
            onStart={startCombat}
            onStep={direction => combat && setCombat(stepTurn(combat, presentTokens(), direction))}
            onEnd={() => setCombat(null)}
            onMove={(tokenId, direction) => combat && setCombat(moveInOrder(combat, tokenId, direction))}
            onRemove={removeCombatant}
            onAdd={tokenId => combat && setCombat({ ...combat, order: [...combat.order, tokenId], current: combat.current ?? tokenId })}
            canPass={canEdit}
            onPass={tokenId => combat && setCombat(passTurn(combat, tokenId))}
            onNextRound={tokenId => combat && setCombat(startNextRound(combat, tokenId))}
            onUndo={() => combat && setCombat(undoPass(combat))}
            onSetCurrent={tokenId => combat && setCombat(setCurrent(combat, tokenId))}
          />
        </div>
      </div>

      {/* Tools float along the bottom of the map. */}
      <div style={{ position: 'absolute', bottom: '0.75rem', ...between, zIndex: 15, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div className='d-flex align-center gap-1 flex-wrap' style={{ ...panelStyle, pointerEvents: 'auto', padding: '0.35rem 0.5rem', justifyContent: 'center' }}>
          {canEdit && <>
            <button onClick={() => setTool('pan')} disabled={tool === 'pan'} title='Drag to move around the map, and to move tokens'>Pan</button>
            <button onClick={() => setTool('draw')} disabled={tool === 'draw'} title='Drag to draw on the map'>Draw</button>
            {divider}
          </>}
          <button onClick={() => zoomAtCenter(1 / 1.25)} aria-label='Zoom out'>−</button>
          <span style={{ display: 'inline-block', minWidth: 44, textAlign: 'center' }}>{Math.round(camera.scale * 100)}%</span>
          <button onClick={() => zoomAtCenter(1.25)} aria-label='Zoom in'>+</button>
          <button onClick={() => setCamera(fitCamera(viewport.width, viewport.height, meta.width, meta.height))}>Fit</button>
          {canEdit && <>
            {divider}
            <select value={tokenPick} onChange={({ target }) => setTokenPick(target.value)} aria-label='Character to add a token for' style={{ maxWidth: '12rem' }}>
              <option value=''>Add a token…</option>
              {tokenCandidates.map(item => (
                <option key={item.shortname} value={item.shortname}>{item.title}</option>
              ))}
            </select>
            <button onClick={addToken} disabled={!tokenPick}>Add</button>
            <button onClick={addRect}>Rectangle</button>
            <button onClick={deleteSelected} disabled={!selectedId} title='Delete the selected token or shape (Delete key)'>Delete</button>
          </>}
          {canEdit && gm && <>
            {divider}
            <button onClick={() => backgroundInput.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : meta.imageStamp !== null ? 'Change background' : 'Set background'}
            </button>
            <input
              ref={backgroundInput}
              type='file'
              accept='image/*'
              aria-label='Background image'
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadImage(file);
                e.target.value = '';
              }}
            />
            {meta.imageStamp !== null && <button onClick={removeBackground} disabled={uploading}>Remove background</button>}
          </>}
        </div>
      </div>

      <SideDrawer title='Aspects' side='left' storageKey='fate.aspectsDrawerOpen' defaultOpen={window.innerWidth >= 900} onOpenChange={setAspectsOpen}>
        <AspectsPanel
          campaignShortname={campaignShortname}
          aspects={aspects}
          characters={characters}
          sheetAspects={sheetAspects}
          consequences={consequenceAspects}
          canEdit={canEdit}
          gm={gm}
          onAdd={addAspect}
          onUpdate={updateAspect}
          onRemove={removeAspect}
          onKeepOnSheet={keepOnSheet}
          onEndScene={endScene}
        />
      </SideDrawer>
      <DiceRoller
        rolls={table.rolls.slice(0, 20)}
        characters={characters}
        skills={Object.fromEntries(characters.map(c => [c.key, skillRatings(actorSheet(c.key))]))}
        fatePoints={Object.fromEntries(characters.filter(c => actorSheet(c.key)).map(c => [c.key, fatePoints(actorSheet(c.key))]))}
        aspects={invokableAspects}
        canRoll={Boolean(yRolls)}
        onRoll={addRoll}
        onInvoke={invokeOnRoll}
        journal={<Journal table={table} />}
        onOpenChange={setDiceOpen}
      />
    </FullScreen>
  );
}
