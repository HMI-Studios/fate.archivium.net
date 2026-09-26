import Konva from 'konva';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Circle, Group, Image as KonvaImage, Label, Layer, Line, Rect, Stage, Tag, Text, Transformer } from 'react-konva';
import * as Y from 'yjs';
import { ARCHIVIUM_URL } from '../App';
import { ASPECT_INVOKES_KEY, aspectInvokes, CONSEQUENCE_INVOKES_KEY, consequenceId, consequenceInvokes, fromSceneSheet, mainAspectId, mainAspects, parseConsequenceId, parseMainAspectId, parseSheetAspectId, withAspectInvokes, withConsequenceInvokes, SCENE_ASPECTS_KEY, sheetAspectId, sheetInvokes, TEMPORARY_ASPECTS_KEY, toSceneSheet, toSheetAspect, type SceneAspect, type SheetAspect } from '../fate/aspects';
import { initiativeOrder, modeOf, moveInOrder, passTurn, setCurrent, startNextRound, stepTurn, undoPass, waitingToAct, type CombatState, type ConflictKind } from '../fate/combat';
import { fetchSettings, type TurnOrderMode } from '../fate/settings';
import { useTable } from '../fate/table';
import { FATE_CORE_LAYOUT } from '../fate/coreLayout';
import { fatePoints, paidInvokeUsed, rollFateDice, ROLL_LOG_SIZE, skillRatings, type InvokeEffect, type Roll, type RollInvoke } from '../fate/dice';
import { galleryImageUrl, portraitId, useCanvasImage } from '../fate/portrait';
import { glass, GLASS, hasBackdrop, useTheme } from '../theme';
import { FATE_SCENE_LAYOUT } from '../fate/sceneLayout';
import { consequenceSlots, stressTracks, takenConsequences, trackKey, withBoxToggled, withHit } from '../fate/stress';
import { MONSTER_TYPE, TOKEN_STATES_KEY, tokenActorKey, tokenIdOfActor, tokenSheet, type TokenState } from '../fate/tokenState';
import { getPath, setPath } from '../layout/core';
import { fetchLayoutTab, layoutTabData, updateLayoutTab, updateSheetKey } from '../fate/sheetData';
import { isLive, useSyncedDoc } from '../sync';
import { debounce } from '../util';
import AspectsPanel, { type SceneCharacter } from './AspectsPanel';
import CombatTracker, { type CombatEntry } from './CombatTracker';
import type { Hit } from './TakeHitDialog';
import DiceRoller, { SCENE_OWNER, type InvokableAspect } from './DiceRoller';
import Journal from './Journal';
import { FullScreen, MenuButton, panelStyle, TOPBAR_HEIGHT, TopBar } from './PlayLayout';
import SideDrawer, { DRAWER_WIDTH } from './SideDrawer';

export type BaseShape = {
  id: string;
  clientID: number;   // 👈 identify the author
  // The Archivium user id of whoever made it. Players may only change their own
  // shapes (and move any token); the GM may change anything. Older shapes have none.
  author?: number;
  // Shapes sharing a group are selected, moved and deleted together.
  group?: string;
  // Locked shapes stay put: they can be selected (to unlock them), but not moved,
  // resized, recoloured, erased or deleted, and a selection box passes over them.
  locked?: boolean;
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
  // Where the points are drawn from, once the line has been moved (0, 0 until then).
  x?: number;
  y?: number;
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
  // A name for this token on the map, instead of the character's.
  nickname?: string;
};

export type TextShape = BaseShape & {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fill: string;
};

export type Shape = RectShape | LineShape | TokenShape | TextShape;

type Point = { x: number, y: number };

const shapePosition = (shape: Shape): Point => ({ x: shape.x ?? 0, y: shape.y ?? 0 });

// Tools for the map. Pan also moves things; Select drags out a box to select what it touches.
type Tool = 'pan' | 'select' | 'draw' | 'erase' | 'text';

const TOOLS: { tool: Tool, label: string, hint: string }[] = [
  { tool: 'pan', label: 'Pan', hint: 'Drag to move around the map, and to move tokens and shapes. Shift- or Ctrl-click to select several.' },
  { tool: 'select', label: 'Select', hint: 'Drag a box to select everything it touches (hold Shift to add to the selection), then drag any of it to move it all' },
  { tool: 'draw', label: 'Draw', hint: 'Drag to draw on the map' },
  { tool: 'erase', label: 'Erase', hint: 'Drag over drawn lines to erase them' },
  { tool: 'text', label: 'Text', hint: 'Click the map to write on it, or click text to edit it (double-click text to edit it with any tool)' },
];

const TOOL_CURSORS: { [tool in Tool]: string } = { pan: 'grab', select: 'default', draw: 'crosshair', erase: 'cell', text: 'text' };

// Line thicknesses, in map units.
const LINE_WIDTHS: { width: number, label: string }[] = [
  { width: 2, label: 'Thin' },
  { width: 5, label: 'Medium' },
  { width: 10, label: 'Thick' },
  { width: 20, label: 'Heavy' },
];

// New text is this big on screen at the zoom it's written at.
const TEXT_SCREEN_SIZE = 20;

// The colour a shape is drawn in, for the ones that can be recoloured.
function colorOf(shape: Shape): string | null {
  if (shape.type === 'rect' || shape.type === 'text') return shape.fill;
  if (shape.type === 'line') return shape.stroke;
  return null;
}

function withColor(shape: Shape, color: string): Shape {
  if (shape.type === 'rect' || shape.type === 'text') return { ...shape, fill: color };
  if (shape.type === 'line') return { ...shape, stroke: color };
  return shape;
}

// Colour inputs only take #rrggbb, but older rectangles have CSS colour names.
function toHex(color: string): string {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return '#000000';
  ctx.fillStyle = '#000000';
  ctx.fillStyle = color;
  return ctx.fillStyle.startsWith('#') ? ctx.fillStyle : '#000000';
}

const TOKEN_GROUPS: { type: string, label: string }[] = [
  { type: 'pc', label: 'Player characters' },
  { type: 'npc', label: 'NPCs' },
  { type: 'monster', label: 'Monsters' },
];

// The list in the "Add token" menu, with a filter once it gets long.
function TokenPicker({ items, onPick }: { items: MapItem[], onPick: (item: MapItem) => void }) {
  const [query, setQuery] = useState('');
  const matching = items.filter(item => item.title.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className='d-flex flex-col gap-2'>
      {items.length > 8 && <input autoFocus placeholder='Find a character' aria-label='Find a character' value={query} onChange={({ target }) => setQuery(target.value)} />}
      {items.length === 0 && <small>No characters, NPCs or monsters in this campaign yet.</small>}
      {items.length > 0 && matching.length === 0 && <small>Nobody matches.</small>}
      {TOKEN_GROUPS.map(group => {
        const members = matching.filter(item => item.item_type === group.type);
        if (!members.length) return null;
        return (
          <div key={group.type}>
            <small><b>{group.label}</b></small>
            <ul className='ma-0 pa-0 d-flex flex-col gap-0' style={{ listStyle: 'none' }}>
              {members.map(item => (
                <li key={item.shortname}>
                  <a className='link link-animated' style={{ cursor: 'pointer' }} onClick={() => onPick(item)}>{item.title}</a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// The eraser's reach, and how far apart it checks along a fast stroke, in screen pixels.
const ERASER_RADIUS = 8;
const ERASER_STEP = 4;

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Whether any part of a drawn line comes within `reach` of a point (map coordinates).
function lineNear(line: LineShape, p: Point, reach: number): boolean {
  const { x, y } = shapePosition(line);
  const at = (i: number) => ({ x: x + line.points[i], y: y + line.points[i + 1] });
  const within = reach + line.strokeWidth / 2;
  if (line.points.length < 4) return line.points.length === 2 && Math.hypot(p.x - at(0).x, p.y - at(0).y) <= within;
  for (let i = 0; i + 3 < line.points.length; i += 2) {
    if (distanceToSegment(p, at(i), at(i + 2)) <= within) return true;
  }
  return false;
}

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
  // Where the background image sits, in map coordinates; null for the whole map.
  // It stops matching the map once the map area is resized.
  imageRect: MapRect | null;
};

type MapRect = { x: number, y: number, width: number, height: number };

// The map area's size (and the image's place in it) once it's been resized here, kept
// on the scene item; Archivium's own map size follows the uploaded image.
const MAP_AREA_KEY = 'mapArea';

// The smallest the map area can be resized to, in map units.
const MIN_MAP_SIZE = 100;
// Room left around everything when fitting the map area to what's on it.
const FIT_MARGIN = 40;

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
      return {
        ...shape,
        ...(shape.x !== undefined ? { x: shape.x * sx } : {}),
        ...(shape.y !== undefined ? { y: shape.y * sy } : {}),
        points: shape.points.map((p, i) => p * (i % 2 === 0 ? sx : sy)),
      };
    case 'text':
      return { ...shape, x: shape.x * sx, y: shape.y * sy };
  }
}

function translateShape(shape: Shape, dx: number, dy: number): Shape {
  if (shape.type === 'line') return { ...shape, x: (shape.x ?? 0) + dx, y: (shape.y ?? 0) + dy };
  return { ...shape, x: shape.x + dx, y: shape.y + dy };
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
  // The viewer's Archivium user id, recorded on the shapes they make.
  userId?: number;
  // The start of the top bar: where you are and how to get back.
  header: ReactNode;
  // The end of the top bar, before the scene's own status.
  headerEnd?: ReactNode;
}

// The layout tabs holding characters' sheets (temporary aspects, stress, fate points)
// and a scene's own sheet (its aspects).
const SHEET_TAB = FATE_CORE_LAYOUT.id;
const SCENE_TAB = FATE_SCENE_LAYOUT.id;

export default function SceneCanvas({ campaignShortname, sceneShortname, gm = false, userName = '', userId, header, headerEnd }: Props) {
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // A selection box being dragged out, in map coordinates.
  const [marquee, setMarquee] = useState<{ from: Point, to: Point, additive: boolean } | null>(null);

  const [meta, setMeta] = useState<SceneMeta>({ width: 1000, height: 1000, imageStamp: null, imageRect: null });
  // Whether the GM is dragging the map area's edges.
  const [resizingMap, setResizingMap] = useState(false);
  const mapAreaRef = useRef<Konva.Rect | null>(null);
  const mapTransformerRef = useRef<Konva.Transformer | null>(null);
  const theme = useTheme();
  const backdrop = hasBackdrop(theme);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const [tokenCandidates, setTokenCandidates] = useState<MapItem[]>([]);
  // The campaign's turn order setting, used when a conflict starts.
  const [turnOrder, setTurnOrder] = useState<TurnOrderMode>('initiative');
  // The colour new lines and text are drawn in.
  const [penColor, setPenColor] = useState('#000000');
  const [penWidth, setPenWidth] = useState(LINE_WIDTHS[0].width);
  // Text being written or edited in place, in map coordinates; id is null for new text.
  const [textEdit, setTextEdit] = useState<{ id: string | null, x: number, y: number, text: string, fontSize: number, fill: string } | null>(null);
  // A token being renamed, in place under it.
  const [nameEdit, setNameEdit] = useState<{ id: string, text: string } | null>(null);

  const [tool, setTool] = useState<Tool>('pan');
  // The shapes being dragged together, with where each started.
  const dragGroup = useRef<{ [id: string]: Point } | null>(null);
  // While erasing, where the pointer last was (map coordinates).
  const eraserAt = useRef<Point | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  // The last text edit saved or cancelled, so Enter and the blur after it save only once.
  const finishedTextEdit = useRef<object | null>(null);
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
      const area = objData?.[MAP_AREA_KEY];
      if (data.map || area) {
        setMeta(m => ({
          width: area?.width ?? data.map?.width ?? m.width,
          height: area?.height ?? data.map?.height ?? m.height,
          imageStamp: objData?.[MAP_IMAGE_HIDDEN_KEY] ? null : data.map?.image_id ?? null,
          imageRect: area?.imageRect ?? null,
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
        imageRect: (yMeta.get('imageRect') as MapRect | null) ?? null,
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
          ...(yMeta.has('width') ? {
            [MAP_AREA_KEY]: { width: yMeta.get('width'), height: yMeta.get('height'), imageRect: yMeta.get('imageRect') ?? null },
          } : {}),
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
        yMeta.set('imageRect', meta.imageRect);
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
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) deleteSelected();
      if (e.key === 'Escape') setSelectedIds([]);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection();
        else groupSelection();
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
  // A token's own name if it's been given one; otherwise several tokens of one character
  // are numbered, e.g. "Goblin 2" (counting named ones, so naming one renumbers no others).
  const tokenLabel = (token: TokenShape) => {
    if (token.nickname) return token.nickname;
    const same = tokens.filter(t => t.itemShortname === token.itemShortname);
    return same.length > 1 ? `${token.itemTitle} ${same.indexOf(token) + 1}` : token.itemTitle;
  };

  // Who's in the scene: one entry per PC or NPC, and one per monster token.
  const characters: SceneCharacter[] = [];
  for (const token of tokens) {
    if (isMonster(token)) {
      characters.push({ key: tokenActorKey(token.id), shortname: token.itemShortname, title: tokenLabel(token), scoped: true });
    } else if (!characters.some(c => c.key === token.itemShortname)) {
      // Called by the name on one of their tokens, if one has one.
      const named = tokens.find(t => t.itemShortname === token.itemShortname && t.nickname);
      characters.push({ key: token.itemShortname, shortname: token.itemShortname, title: named?.nickname ?? token.itemTitle });
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
      slots: consequenceSlots(view),
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

  // A hit worked out on a combat card: a monster token marks its own copy; anyone
  // else marks their sheet, applied to its freshest copy.
  const takeHit = async (tokenId: string, hit: Hit) => {
    const token = tokens.find(t => t.id === tokenId);
    if (!canEdit || !token) return;
    if (isMonster(token)) {
      setTokenState(token.id, state => {
        const { sheet, keys } = withHit(tokenView(token), hit);
        return { ...state, ...Object.fromEntries(keys.map(key => [key, getPath(sheet, key)])) };
      });
      return;
    }
    const shortname = token.itemShortname;
    const { sheet, keys } = withHit(sheets[shortname], hit);
    keys.forEach(key => setSheetKey(shortname, key, getPath(sheet, key)));
    try {
      for (const key of keys) {
        const saved = await updateSheetKey(campaignShortname, shortname, SHEET_TAB, key, fresh => getPath(withHit({ [key]: fresh }, hit).sheet, key));
        setSheetKey(shortname, key, saved);
      }
      ySheetStamps?.set(shortname, Date.now());
    } catch {
      window.alert(`Couldn't save the hit on ${token.itemTitle}'s sheet.`);
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

  // Each character's own aspects (high concept, trouble...), from their sheet.
  const characterAspects: { [key: string]: SceneAspect[] } = Object.fromEntries(characters.map(character => [
    character.key,
    mainAspects(actorSheet(character.key)).map(aspect => ({
      id: mainAspectId(character.key, aspect.path),
      name: aspect.text,
      kind: 'character' as const,
      freeInvokes: aspectInvokes(actorSheet(character.key), aspect.path, aspect.text),
      target: character.key,
      targetTitle: character.title,
      note: aspect.label,
    })),
  ]));

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
  // Free invokes on a consequence or one of a character's own aspects, kept on the sheet
  // (or a monster token's own copy) under `key`, with the aspect's text.
  const setStoredInvokes = async (key: typeof CONSEQUENCE_INVOKES_KEY | typeof ASPECT_INVOKES_KEY, actorKey: string, path: string, invokes: number) => {
    const consequence = key === CONSEQUENCE_INVOKES_KEY;
    const list = consequence ? consequenceAspects[actorKey] : characterAspects[actorKey];
    const text = list?.find(a => a.id === (consequence ? consequenceId : mainAspectId)(actorKey, path))?.name;
    if (!canEdit || text === undefined) return;
    const withInvokes = consequence ? withConsequenceInvokes : withAspectInvokes;
    const tokenId = tokenIdOfActor(actorKey);
    if (tokenId) {
      setTokenState(tokenId, state => ({ ...state, [key]: withInvokes(actorSheet(actorKey)?.[key], path, text, invokes) }));
      return;
    }
    setSheetKey(actorKey, key, withInvokes(sheets[actorKey]?.[key], path, text, invokes));
    try {
      const saved = await updateSheetKey(campaignShortname, actorKey, SHEET_TAB, key, fresh => withInvokes(fresh, path, text, invokes));
      setSheetKey(actorKey, key, saved);
      ySheetStamps?.set(actorKey, Date.now());
    } catch {
      window.alert(`Couldn't save the free invokes on ${titleOf(actorKey)}'s ${consequence ? 'consequence' : 'aspect'}.`);
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
  // A character's own aspects are only shown while they have free invokes on them.
  const tokenTags = (token: TokenShape): { name: string, freeInvokes: number }[] => {
    const key = isMonster(token) ? tokenActorKey(token.id) : token.itemShortname;
    const invokedOwn = (characterAspects[key] ?? []).filter(a => a.freeInvokes > 0);
    if (isMonster(token)) return [...invokedOwn, ...consequenceAspects[key] ?? [], ...aspects.filter(a => a.target === key)];
    return [
      ...invokedOwn,
      ...(sheetAspects[token.itemShortname] ?? []).filter(a => a.name).map(a => ({ name: a.name!, freeInvokes: sheetInvokes(a) })),
      ...consequenceAspects[token.itemShortname] ?? [],
      ...aspects.filter(a => a.target === token.itemShortname),
    ];
  };

  // Everything that can be invoked on a roll: the scene's aspects, the temporary
  // aspects on the sheets of characters in the scene, and their consequences.
  const titleOf = (key: string) => characters.find(c => c.key === key)?.title ?? key;
  const invokableAspects: InvokableAspect[] = [
    // In the order the aspects pane lists them: a character's own aspects, their
    // consequences, their temporary aspects, then the scene's aspects on them.
    ...Object.values(characterAspects).flat().map(a => ({ id: a.id, name: a.name, freeInvokes: a.freeInvokes, ownerTitle: a.targetTitle ?? titleOf(a.target!) })),
    ...Object.values(consequenceAspects).flat().map(a => ({ id: a.id, name: a.name, freeInvokes: a.freeInvokes, ownerTitle: a.targetTitle ?? titleOf(a.target!) })),
    // (Only PCs' and NPCs' sheets: a monster's sheet aspects belong to no token in particular.)
    ...Object.entries(sheetAspects).filter(([shortname]) => characters.some(c => c.key === shortname)).flatMap(([shortname, list]) => list
      .map((entry, i) => ({ id: sheetAspectId(shortname, i), name: entry.name ?? '', freeInvokes: sheetInvokes(entry), ownerTitle: titleOf(shortname) }))
      .filter(a => a.name)),
    ...aspects.map(a => ({ id: a.id, name: a.name, freeInvokes: a.freeInvokes, ownerTitle: a.target ? a.targetTitle ?? titleOf(a.target) : SCENE_OWNER })),
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
    if (aspect.freeInvokes === 0 && paidInvokeUsed(roll, aspect)) return;

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
      ? { aspect: aspect.name, aspectId: aspect.id, paidWith, effect, previousDice: latest.dice }
      : { aspect: aspect.name, aspectId: aspect.id, paidWith, effect };
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
      if (changes.freeInvokes !== undefined) setStoredInvokes(CONSEQUENCE_INVOKES_KEY, consequence.actorKey, consequence.path, changes.freeInvokes);
      return;
    }
    const main = parseMainAspectId(id);
    if (main) {
      // Likewise a character's own aspects, which are written on the sheet.
      if (changes.freeInvokes !== undefined) setStoredInvokes(ASPECT_INVOKES_KEY, main.actorKey, main.path, changes.freeInvokes);
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
    // Consequences are cleared on the sheet (recovery), not from the scene, and a
    // character's own aspects are changed there too.
    if (parseConsequenceId(id) || parseMainAspectId(id)) return;
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

  // Whether the viewer may select and change a shape. Everything else on the map is
  // just part of the picture to them. (The live doc itself doesn't check this.)
  const mayEdit = (shape: Shape) => canEdit && (gm || shape.type === 'token' || (userId !== undefined && shape.author === userId));

  // Shapes with the rest of their groups (as far as the viewer may change them).
  const withGroups = (ids: string[]) => {
    const groups = new Set(ids.map(id => shapes.find(shape => shape.id === id)?.group).filter(Boolean));
    const members = shapes.filter(shape => shape.group && groups.has(shape.group) && mayEdit(shape)).map(shape => shape.id);
    return [...new Set([...ids, ...members])];
  };

  const deleteSelected = () => {
    const target = writableShapes();
    if (!selection.length || !target || !ydoc) return;
    ydoc.transact(() => {
      for (const id of selection) {
        if (target.get(id)?.locked) continue;
        target.delete(id);
        // A token's scene-scoped state and aspects go with it.
        yTokenStates?.delete(id);
        aspects.filter(a => a.target === tokenActorKey(id)).forEach(a => yAspects?.delete(a.id));
      }
    });
    setSelectedIds(ids => ids.filter(id => target.get(id)?.locked));
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
      author: userId,
      type: 'rect',
      x: center.x - 50,
      y: center.y - 40,
      width: 100,
      height: 80,
      fill: 'skyblue'
    };
    target.set(rect.id, rect);
  };

  const addToken = (item: MapItem) => {
    const target = writableShapes();
    if (!target || !ydoc) return;

    const center = viewCenter();
    const token: TokenShape = {
      id: `token-${Date.now()}`,
      clientID: ydoc.clientID,
      author: userId,
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

  // Dragging something selected moves the whole selection with it; dragging anything
  // else selects just that.
  const handleDragStart = (id: string) => {
    const target = writableShapes();
    if (!target) return;
    const ids = selection.includes(id) ? selection : withGroups([id]);
    if (!selection.includes(id)) setSelectedIds(ids);
    dragGroup.current = Object.fromEntries(ids.flatMap(sid => {
      const shape = target.get(sid);
      return shape && !shape.locked ? [[sid, shapePosition(shape)]] : [];
    }));
  };

  const handleDragMove = (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const target = writableShapes();
    const group = dragGroup.current;
    if (!target || !ydoc || !group?.[id]) return;
    const dx = e.target.x() - group[id].x;
    const dy = e.target.y() - group[id].y;
    ydoc.transact(() => {
      for (const [sid, start] of Object.entries(group)) {
        const shape = target.get(sid);
        if (shape) target.set(sid, { ...shape, x: start.x + dx, y: start.y + dy });
      }
    });
  };

  const handleDragEnd = (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
    handleDragMove(id, e);
    dragGroup.current = null;
  };

  // Shift/Ctrl/Cmd-click adds to or takes from the selection.
  const selectShape = (id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!canEdit || activeTool === 'erase') return;
    const members = withGroups([id]);
    if (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey) {
      setSelectedIds(ids => members.every(m => ids.includes(m)) ? ids.filter(i => !members.includes(i)) : [...new Set([...ids, ...members])]);
    } else {
      setSelectedIds(members);
    }
  };

  // Erases every drawn line near the pointer's path since it was last checked, stepping
  // along it so a quick stroke doesn't skip lines. Lines under tokens are erased too.
  const eraseAlong = (stage: Konva.Stage) => {
    const target = writableShapes();
    const to = stage.getRelativePointerPosition();
    if (!target || !ydoc || !to) return;
    const from = eraserAt.current ?? to;
    eraserAt.current = to;
    const step = ERASER_STEP / camera.scale;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
    const samples = Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }));
    const reach = ERASER_RADIUS / camera.scale;
    const hits = new Set<string>();
    for (const shape of shapes) {
      if (shape.type === 'line' && mayEdit(shape) && !shape.locked && samples.some(p => lineNear(shape, p, reach))) hits.add(shape.id);
    }
    if (!hits.size) return;
    ydoc.transact(() => hits.forEach(id => target.delete(id)));
    setSelectedIds(ids => ids.filter(id => !hits.has(id)));
  };

  // Selects what the finished selection box touches.
  const finishMarquee = (stage: Konva.Stage) => {
    const box = marquee;
    setMarquee(null);
    if (!box) return;
    // In screen coordinates, as Konva measures shapes.
    const rect = {
      x: Math.min(box.from.x, box.to.x) * camera.scale + camera.x,
      y: Math.min(box.from.y, box.to.y) * camera.scale + camera.y,
      width: Math.abs(box.to.x - box.from.x) * camera.scale,
      height: Math.abs(box.to.y - box.from.y) * camera.scale,
    };
    if (rect.width < 3 && rect.height < 3) return;
    const hits = withGroups(stage.find('.shape')
      .filter(node => Konva.Util.haveIntersection(rect, node.getClientRect()))
      .map(node => node.id())
      .filter(id => { const shape = shapes.find(sh => sh.id === id); return shape && mayEdit(shape) && !shape.locked; }));
    setSelectedIds(ids => box.additive ? [...new Set([...ids, ...hits])] : hits);
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
      author: userId,
      type: 'line',
      points: [pos.x, pos.y],
      stroke: penColor,
      strokeWidth: penWidth,
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
      yMeta.set('imageRect', null);
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

  // Makes `rect` (in current map coordinates) the map area. The map's origin is its
  // top-left corner, so growing it up or left moves everything on it along, and the
  // view with it, so nothing seems to move.
  const resizeMapArea = (rect: MapRect) => {
    if (!canEdit || !gm || !ydoc || !yShapes || !yMeta) return;
    const width = Math.max(MIN_MAP_SIZE, Math.round(rect.width));
    const height = Math.max(MIN_MAP_SIZE, Math.round(rect.height));
    const dx = -Math.round(rect.x);
    const dy = -Math.round(rect.y);
    const image = meta.imageRect ?? { x: 0, y: 0, width: meta.width, height: meta.height };
    fittedFor.current = `${width}x${height}`;
    ydoc.transact(() => {
      if (dx || dy) Array.from(yShapes.values()).forEach(shape => yShapes.set(shape.id, translateShape(shape, dx, dy)));
      yMeta.set('width', width);
      yMeta.set('height', height);
      yMeta.set('imageRect', { ...image, x: image.x + dx, y: image.y + dy });
    });
    setCamera(cam => ({ ...cam, x: cam.x - dx * cam.scale, y: cam.y - dy * cam.scale }));
  };

  // Fits the map area around everything on it (and the background image).
  const fitMapToContents = () => {
    const layer = mapAreaRef.current?.getLayer();
    if (!layer) return;
    const boxes = layer.find('.shape').map(node => node.getClientRect({ relativeTo: layer }));
    if (bgImage) boxes.push(meta.imageRect ?? { x: 0, y: 0, width: meta.width, height: meta.height });
    if (boxes.length === 0) return;
    const left = Math.min(...boxes.map(b => b.x)) - FIT_MARGIN;
    const top = Math.min(...boxes.map(b => b.y)) - FIT_MARGIN;
    const right = Math.max(...boxes.map(b => b.x + b.width)) + FIT_MARGIN;
    const bottom = Math.max(...boxes.map(b => b.y + b.height)) + FIT_MARGIN;
    resizeMapArea({ x: left, y: top, width: right - left, height: bottom - top });
  };

  const handleMapTransformEnd = () => {
    const node = mapAreaRef.current;
    if (!node) return;
    const rect = { x: node.x(), y: node.y(), width: node.width() * node.scaleX(), height: node.height() * node.scaleY() };
    node.setAttrs({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    resizeMapArea(rect);
  };

  useEffect(() => {
    const transformer = mapTransformerRef.current;
    if (!transformer) return;
    transformer.nodes(resizingMap && mapAreaRef.current ? [mapAreaRef.current] : []);
    transformer.getLayer()?.batchDraw();
  }, [resizingMap]);

  useEffect(() => {
    if (!resizingMap) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setResizingMap(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resizingMap]);

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

  const activeTool: Tool = canEdit && !resizingMap ? tool : 'pan';
  // Selected shapes that still exist (someone else may have deleted one).
  const selection = selectedIds.filter(id => shapes.some(shape => shape.id === id));
  const canMove = canEdit && (activeTool === 'pan' || activeTool === 'select');

  // A single selected rectangle or text gets handles to resize it.
  const resizable = canMove && selection.length === 1
    ? shapes.find(shape => shape.id === selection[0] && !shape.locked && (shape.type === 'rect' || shape.type === 'text'))
    : undefined;

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = resizable && !textEdit ? stageRef.current?.findOne(`#${resizable.id}`) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  });

  // Konva resizes by scaling the node; the new size is stored instead, at scale 1.
  const handleTransformEnd = (id: string, e: Konva.KonvaEventObject<Event>) => {
    const target = writableShapes();
    const shape = target?.get(id);
    if (!target || !shape) return;
    const node = e.target;
    const sx = node.scaleX();
    const sy = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    if (shape.type === 'rect') {
      target.set(id, { ...shape, x: node.x(), y: node.y(), width: Math.max(5, shape.width * sx), height: Math.max(5, shape.height * sy) });
    } else if (shape.type === 'text') {
      target.set(id, { ...shape, x: node.x(), y: node.y(), fontSize: Math.max(4, Math.round(shape.fontSize * sy)) });
    }
  };

  // The colour picker shows the selection's colour, and recolours it; with nothing
  // selected it picks the colour for new lines and text.
  const selectedShapes = selection.map(id => shapes.find(shape => shape.id === id)).filter((shape): shape is Shape => Boolean(shape));
  const colorable = selectedShapes.filter(shape => colorOf(shape) && !shape.locked);
  const shownColor = colorable.length ? toHex(colorOf(colorable[0])!) : penColor;
  const recolor = (color: string) => {
    setPenColor(color);
    const target = writableShapes();
    if (!target || !ydoc || !colorable.length) return;
    ydoc.transact(() => {
      for (const { id } of colorable) {
        const current = target.get(id);
        if (current) target.set(id, withColor(current, color));
      }
    });
  };

  // The thickness picker works like the colour picker, for lines.
  const selectedLines = selectedShapes.filter((shape): shape is LineShape => shape.type === 'line' && !shape.locked);
  const shownWidth = selectedLines.length ? selectedLines[0].strokeWidth : penWidth;
  const rewidth = (width: number) => {
    setPenWidth(width);
    const target = writableShapes();
    if (!target || !ydoc || !selectedLines.length) return;
    ydoc.transact(() => {
      for (const { id } of selectedLines) {
        const current = target.get(id);
        if (current?.type === 'line') target.set(id, { ...current, strokeWidth: width });
      }
    });
  };

  // Grouping the selection puts everything in it in one new group (merging any
  // groups it had); ungrouping takes everything selected out of its group.
  const selectedGroups = new Set(selectedShapes.map(shape => shape.group).filter(Boolean));
  const canGroup = canEdit && selectedShapes.length >= 2 && !(selectedGroups.size === 1 && selectedShapes.every(shape => shape.group));
  const canUngroup = canEdit && selectedGroups.size > 0;
  const setGroup = (group: string | null) => {
    const target = writableShapes();
    if (!target || !ydoc) return;
    ydoc.transact(() => {
      for (const { id } of selectedShapes) {
        const current = target.get(id);
        if (!current) continue;
        const { group: _old, ...rest } = current;
        target.set(id, (group ? { ...rest, group } : rest) as Shape);
      }
    });
  };
  const groupSelection = () => { if (canGroup) setGroup(`group-${Date.now()}`); };

  // Locking works on the whole selection: it's unlocked if all of it is locked, and
  // locked otherwise.
  const lockable = selectedShapes.filter(mayEdit);
  const allLocked = lockable.length > 0 && lockable.every(shape => shape.locked);
  const deletable = selectedShapes.filter(shape => !shape.locked);
  const setLocked = (ids: string[], locked: boolean) => {
    const target = writableShapes();
    if (!target || !ydoc) return;
    ydoc.transact(() => {
      for (const id of ids) {
        const current = target.get(id);
        if (!current || Boolean(current.locked) === locked) continue;
        const { locked: _old, ...rest } = current;
        target.set(id, (locked ? { ...rest, locked } : rest) as Shape);
      }
    });
  };
  const anyLocked = shapes.some(shape => shape.locked);
  const ungroupSelection = () => { if (canUngroup) setGroup(null); };

  const renameToken = (shape: TokenShape) => {
    if (!mayEdit(shape)) return;
    setSelectedIds([shape.id]);
    setNameEdit({ id: shape.id, text: shape.nickname ?? '' });
  };

  // Saves a token's new name; clearing it goes back to the character's.
  const commitName = (edit: NonNullable<typeof nameEdit>) => {
    setNameEdit(current => current === edit ? null : current);
    const target = writableShapes();
    const current = target?.get(edit.id);
    if (!target || current?.type !== 'token') return;
    const nickname = edit.text.trim().replace(/\s+/g, ' ');
    if (nickname === (current.nickname ?? '')) return;
    const { nickname: _old, ...rest } = current;
    target.set(edit.id, nickname && nickname !== current.itemTitle ? { ...rest, nickname } : rest);
  };

  const editText = (shape: TextShape) => {
    if (!mayEdit(shape) || shape.locked) return;
    setSelectedIds([shape.id]);
    setTextEdit({ id: shape.id, x: shape.x, y: shape.y, text: shape.text, fontSize: shape.fontSize, fill: shape.fill });
  };

  // Saves the text being edited (clearing all of it deletes it). Takes the edit it was
  // rendered for, since clicking elsewhere to start new text also ends the old one.
  const commitText = (edit: NonNullable<typeof textEdit>) => {
    setTextEdit(current => current === edit ? null : current);
    if (finishedTextEdit.current === edit) return;
    finishedTextEdit.current = edit;
    const target = writableShapes();
    if (!target || !ydoc) return;
    const text = edit.text.replace(/\s+$/, '');
    if (edit.id) {
      const current = target.get(edit.id);
      if (current?.type !== 'text') return;
      if (!text.trim()) target.delete(edit.id);
      else if (text !== current.text) target.set(edit.id, { ...current, text });
      return;
    }
    if (!text.trim()) return;
    const shape: TextShape = {
      id: `text-${Date.now()}`,
      clientID: ydoc.clientID,
      author: userId,
      type: 'text',
      x: edit.x,
      y: edit.y,
      text,
      fontSize: edit.fontSize,
      fill: edit.fill,
    };
    target.set(shape.id, shape);
  };

  const pointerDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // While resizing the map area, the canvas only pans (and drags the handles).
    if (resizingMap) return;
    const stage = e.target.getStage()!;
    const onEmpty = e.target === stage;
    const additive = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
    if (activeTool === 'text') {
      // The click keeps focus where it is, so the text being written doesn't save on blur.
      if (textEdit) commitText(textEdit);
      const clicked = onEmpty ? undefined : shapes.find(shape => shape.id === e.target.id());
      if (clicked?.type === 'text' && mayEdit(clicked)) {
        editText(clicked);
      } else if (!clicked || !mayEdit(clicked)) {
        const at = stage.getRelativePointerPosition();
        setSelectedIds([]);
        if (at) setTextEdit({ id: null, x: at.x, y: at.y, text: '', fontSize: Math.max(4, Math.round(TEXT_SCREEN_SIZE / camera.scale)), fill: penColor });
      }
      // Don't let the canvas take focus from the new text box.
      e.evt.preventDefault();
      return;
    }
    if (activeTool === 'erase') {
      eraserAt.current = null;
      eraseAlong(stage);
      return;
    }
    if (!onEmpty) return;
    if (!additive) setSelectedIds([]);
    if (activeTool === 'select') {
      const at = stage.getRelativePointerPosition();
      if (at) setMarquee({ from: at, to: at, additive });
    }
    startDraw(e);
  };

  const pointerMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage()!;
    draw(e);
    if (eraserAt.current) eraseAlong(stage);
    if (marquee) {
      const at = stage.getRelativePointerPosition();
      if (at) setMarquee({ ...marquee, to: at });
    }
  };

  const pointerUp = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    endDraw();
    eraserAt.current = null;
    if (marquee) finishMarquee(e.target.getStage()!);
  };

  const status = doc?.status === 'connecting' ? 'Connecting…'
    : doc?.status === 'offline' ? 'Offline: last saved version, read-only'
    : doc?.status === 'reconnecting' ? 'Reconnecting… changes will sync when it’s back'
    : null;

  // Floating panels sit between the drawers, clear of their tabs.
  const [aspectsOpen, setAspectsOpen] = useState(false);
  const [diceOpen, setDiceOpen] = useState(false);
  // When the drawers leave too little room between them, the panels span the window
  // over them instead.
  const drawerPx = Math.min(22 * 16, 0.92 * viewport.width);
  const crowded = viewport.width - drawerPx * (Number(aspectsOpen) + Number(diceOpen)) < 480;
  const between = crowded ? { left: '0.5rem', right: '0.5rem', zIndex: 21 } : {
    left: aspectsOpen ? `calc(${DRAWER_WIDTH} + 2.5rem)` : '3rem',
    right: diceOpen ? `calc(${DRAWER_WIDTH} + 2.5rem)` : '3rem',
    zIndex: 15,
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
          cursor: TOOL_CURSORS[activeTool],
        }}
      >
        {/* With a theme backdrop showing around it, the map area is a pane of its own. */}
        {backdrop && <div
          className={theme.glass ? 'glass-pane' : undefined}
          style={{
            position: 'absolute', pointerEvents: 'none', padding: 0, boxSizing: 'border-box',
            left: camera.x, top: camera.y, width: meta.width * camera.scale, height: meta.height * camera.scale,
            // More solid than Archivium's glass, so drawings and tokens stay easy to see.
            ...(theme.glass ? glass('var(--page-color)', GLASS.map) : { background: 'var(--page-color)' }),
          }}
        />}
        <Stage
          ref={stageRef}
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
          onMouseDown={pointerDown}
          onMousemove={pointerMove}
          onMouseup={pointerUp}
          onMouseleave={pointerUp}
          onTouchStart={pointerDown}
          onTouchMove={pointerMove}
          onTouchEnd={pointerUp}
        >
          <Layer>
            <Rect
              ref={mapAreaRef}
              x={0}
              y={0}
              width={meta.width}
              height={meta.height}
              fill={backdrop ? undefined : 'rgba(255, 255, 255, 0.05)'}
              stroke={resizingMap ? '#f5c542' : '#888'}
              strokeWidth={resizingMap ? 2 : 1}
              strokeScaleEnabled={false}
              listening={resizingMap}
              onTransformEnd={handleMapTransformEnd}
            />
            {bgImage && <KonvaImage image={bgImage} {...(meta.imageRect ?? { x: 0, y: 0, width: meta.width, height: meta.height })} listening={false} />}
            {/* Draw tokens last so drawings can never cover them. */}
            {[...shapes].sort((a, b) => Number(a.type === 'token') - Number(b.type === 'token')).map(s => {
              const selected = selection.includes(s.id);
              const editable = mayEdit(s);
              const select = editable ? (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => selectShape(s.id, e) : undefined;
              const movable = canMove && editable && !s.locked;
              const dragProps = {
                onDragStart: () => handleDragStart(s.id),
                onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => handleDragMove(s.id, e),
                onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(s.id, e),
              };
              if (s.type === 'rect') {
                return (
                  <Rect
                    key={s.id}
                    {...s}
                    name='shape'
                    draggable={movable}
                    stroke={selected ? 'red' : undefined}
                    strokeWidth={selected ? 3 : 0}
                    strokeScaleEnabled={false}
                    onClick={select}
                    onTap={select}
                    {...dragProps}
                    onTransformEnd={e => handleTransformEnd(s.id, e)}
                  />
                );
              }
              if (s.type === 'text') {
                return (
                  <Text
                    key={s.id}
                    id={s.id}
                    name='shape'
                    x={s.x}
                    y={s.y}
                    text={s.text}
                    fontSize={s.fontSize}
                    fill={s.fill}
                    // Hidden while it's being edited in place.
                    visible={textEdit?.id !== s.id}
                    shadowEnabled={selected}
                    shadowColor='red'
                    shadowBlur={6}
                    draggable={movable}
                    onClick={select}
                    onTap={select}
                    onDblClick={() => editText(s)}
                    onDblTap={() => editText(s)}
                    {...dragProps}
                    onTransformEnd={e => handleTransformEnd(s.id, e)}
                  />
                );
              }
              if (s.type === 'token') {
                return (
                  <Group
                    key={s.id}
                    id={s.id}
                    name='shape'
                    x={s.x}
                    y={s.y}
                    draggable={movable}
                    onClick={select}
                    onTap={select}
                    onDblClick={() => renameToken(s)}
                    onDblTap={() => renameToken(s)}
                    {...dragProps}
                  >
                    {s.id === combat?.current && <Circle radius={TOKEN_RADIUS + 5} stroke='#f5c542' strokeWidth={3} listening={false} />}
                    <TokenFace color={s.color} portraitUrl={portraitUrl(s.itemShortname)} selected={selected} />
                    <Text text={tokenLabel(s)} y={24} offsetX={30} width={60} align='center' fontSize={12} visible={nameEdit?.id !== s.id} />
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
                  name='shape line'
                  // Easy to click even when thin, and all the way across when thick.
                  hitStrokeWidth={Math.max(12, s.strokeWidth)}
                  stroke={selected ? 'red' : s.stroke}
                  // Only selected lines move, so a drag across the map pans instead of catching one.
                  draggable={movable && selected}
                  onClick={select}
                  onTap={select}
                  {...dragProps}
                />
              );
            })}
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              flipEnabled={false}
              ignoreStroke
              // Text keeps its proportions, growing and shrinking its font.
              keepRatio={resizable?.type === 'text'}
              enabledAnchors={resizable?.type === 'text'
                ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                : ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right']}
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5 ? oldBox : newBox)}
            />
            <Transformer
              ref={mapTransformerRef}
              rotateEnabled={false}
              flipEnabled={false}
              ignoreStroke
              keepRatio={false}
              borderStroke='#f5c542'
              anchorStroke='#f5c542'
              boundBoxFunc={(oldBox, newBox) => (newBox.width < MIN_MAP_SIZE * camera.scale || newBox.height < MIN_MAP_SIZE * camera.scale ? oldBox : newBox)}
            />
            {marquee && <Rect
              x={Math.min(marquee.from.x, marquee.to.x)}
              y={Math.min(marquee.from.y, marquee.to.y)}
              width={Math.abs(marquee.to.x - marquee.from.x)}
              height={Math.abs(marquee.to.y - marquee.from.y)}
              fill='rgba(70, 130, 180, 0.15)'
              stroke='#4682B4'
              strokeWidth={1}
              dash={[4, 4]}
              strokeScaleEnabled={false}
              listening={false}
            />}
          </Layer>
        </Stage>
      </div>

      {textEdit && (() => {
        const edit = textEdit;
        const lines = edit.text.split('\n');
        return <textarea
          autoFocus
          aria-label='Text on the map'
          value={edit.text}
          rows={lines.length}
          onChange={({ target }) => setTextEdit({ ...edit, text: target.value })}
          onBlur={() => commitText(edit)}
          onKeyDown={e => {
            // Enter saves; Shift+Enter starts a new line; Esc cancels.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(edit); }
            if (e.key === 'Escape') { finishedTextEdit.current = edit; setTextEdit(null); }
          }}
          style={{
            position: 'absolute',
            left: edit.x * camera.scale + camera.x,
            top: `calc(${TOPBAR_HEIGHT} + ${edit.y * camera.scale + camera.y}px)`,
            width: `${Math.max(4, ...lines.map(line => line.length + 1))}ch`,
            zIndex: 16,
            margin: 0,
            padding: 0,
            border: 'none',
            outline: '1px dashed #4682B4',
            background: 'rgb(255 255 255 / 10%)',
            color: edit.fill,
            // Konva's default font and line height, so the text doesn't jump when saved.
            fontFamily: 'Arial',
            fontSize: edit.fontSize * camera.scale,
            lineHeight: 1,
            resize: 'none',
            overflow: 'hidden',
            whiteSpace: 'pre',
          }}
        />;
      })()}

      {nameEdit && (() => {
        const edit = nameEdit;
        const token = tokens.find(t => t.id === edit.id);
        if (!token) return null;
        return <input
          autoFocus
          aria-label={`Name for this ${token.itemTitle} token`}
          title={`Leave it empty to go back to "${token.itemTitle}"`}
          placeholder={token.itemTitle}
          value={edit.text}
          maxLength={60}
          onChange={({ target }) => setNameEdit({ ...edit, text: target.value })}
          onFocus={({ target }) => target.select()}
          onBlur={() => commitName(edit)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitName(edit);
            // Only cancels the rename, leaving the token selected.
            if (e.key === 'Escape') { e.stopPropagation(); setNameEdit(null); }
          }}
          style={{
            position: 'absolute',
            // Centred where the token's name is drawn.
            left: token.x * camera.scale + camera.x,
            top: `calc(${TOPBAR_HEIGHT} + ${(token.y + 22) * camera.scale + camera.y}px)`,
            transform: 'translateX(-50%)',
            width: '10rem',
            zIndex: 16,
            textAlign: 'center',
            fontSize: '0.8rem',
          }}
        />;
      })()}

      {/* The turn order floats over the top of the map, between the drawers' tabs. */}
      <div style={{ position: 'absolute', top: `calc(${TOPBAR_HEIGHT} + 0.5rem)`, ...between, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', maxWidth: '100%', minWidth: 0 }}>
          <CombatTracker
            state={combat}
            entries={combatEntries}
            canRun={canEdit && gm}
            canMarkStress={canEdit}
            onToggleStress={toggleStress}
            onSetConsequence={setConsequence}
            onTakeHit={takeHit}
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

      {/* Zoom sits in the map's bottom-right corner, between the drawers. */}
      <div className='d-flex flex-col align-center gap-1' style={{ ...panelStyle, position: 'absolute', bottom: '0.75rem', right: between.right, zIndex: between.zIndex, padding: '0.35rem' }}>
        <button onClick={() => zoomAtCenter(1.25)} aria-label='Zoom in' style={{ width: '2.2rem' }}>+</button>
        <small style={{ textAlign: 'center' }}>{Math.round(camera.scale * 100)}%</small>
        <button onClick={() => zoomAtCenter(1 / 1.25)} aria-label='Zoom out' style={{ width: '2.2rem' }}>−</button>
        <button onClick={() => setCamera(fitCamera(viewport.width, viewport.height, meta.width, meta.height))} title='Fit the whole map in view' style={{ width: '2.2rem', padding: 0 }}>Fit</button>
      </div>

      {resizingMap && <div
        className='d-flex align-center gap-2'
        style={{ ...panelStyle, position: 'absolute', bottom: '4.25rem', left: '50%', transform: 'translateX(-50%)', zIndex: 22, padding: '0.35rem 0.6rem', whiteSpace: 'nowrap' }}
      >
        <span>Drag the map area's edges to resize it.</span>
        <button onClick={() => { fitMapToContents(); }}>Fit to contents</button>
        <button onClick={() => setResizingMap(false)}><b>Done</b></button>
      </div>}

      {/* Tools float along the bottom of the map, clear of the zoom buttons. */}
      <div style={{ position: 'absolute', bottom: '0.75rem', ...between, right: `calc(${between.right} + 3.75rem)`, display: canEdit ? 'flex' : 'none', justifyContent: 'center', pointerEvents: 'none' }}>
        <div className='d-flex align-center gap-1 flex-wrap' style={{ ...panelStyle, pointerEvents: 'auto', padding: '0.35rem 0.5rem', justifyContent: 'center' }}>
          {canEdit && <>
            {TOOLS.map(t => <button key={t.tool} onClick={() => setTool(t.tool)} disabled={tool === t.tool} title={t.hint}>{t.label}</button>)}
            <input
              type='color'
              value={shownColor}
              onChange={({ target }) => recolor(target.value)}
              aria-label='Colour'
              title={colorable.length ? 'Colour of what’s selected' : 'Colour for new lines and text'}
              style={{ width: '2rem', height: '1.6rem', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            />
            {(activeTool === 'draw' || selectedLines.length > 0) && (
              <select
                aria-label='Line thickness'
                title={selectedLines.length ? 'Thickness of the selected lines' : 'Thickness for new lines'}
                value={shownWidth}
                onChange={({ target }) => rewidth(Number(target.value))}
              >
                {LINE_WIDTHS.map(w => <option key={w.width} value={w.width}>{w.label}</option>)}
                {!LINE_WIDTHS.some(w => w.width === shownWidth) && <option value={shownWidth}>{shownWidth}</option>}
              </select>
            )}
            {divider}
            <MenuButton label='Add token' placement='above' title='Put a character, NPC or monster on the map'>
              {close => <TokenPicker items={tokenCandidates} onPick={item => { addToken(item); close(); }} />}
            </MenuButton>
            <button onClick={addRect}>Rectangle</button>
            {canGroup && <button onClick={groupSelection} title='Group these so they select and move together (Ctrl+G)'>Group</button>}
            {canUngroup && <button onClick={ungroupSelection} title='Ungroup (Ctrl+Shift+G)'>Ungroup</button>}
            {selectedShapes.length === 1 && selectedShapes[0].type === 'token' && mayEdit(selectedShapes[0]) && (
              <button onClick={() => renameToken(selectedShapes[0] as TokenShape)} title='Give this token its own name on the map (or double-click it)'>Rename</button>
            )}
            {lockable.length > 0 && <button
              onClick={() => setLocked(lockable.map(shape => shape.id), !allLocked)}
              aria-pressed={allLocked}
              title={allLocked ? 'Unlock, so it can be moved and changed again' : 'Lock in place, so it can’t be moved, changed or deleted by mistake'}
            >{allLocked ? 'Unlock' : 'Lock'}</button>}
            {deletable.length > 0 && <button onClick={deleteSelected} title={`Delete what’s selected${deletable.length < selection.length ? ' (except what’s locked)' : ''} (Delete key; Esc to deselect)`}>
              Delete{deletable.length > 1 ? ` ${deletable.length}` : ''}
            </button>}
          </>}
          {canEdit && gm && <>
            {divider}
            <MenuButton label={uploading ? 'Uploading…' : 'Map'} placement='above' title="The map's background image and size">
              {close => <div className='d-flex flex-col gap-1'>
                <button disabled={uploading} onClick={() => { close(); backgroundInput.current?.click(); }}>
                  {meta.imageStamp !== null ? 'Change background image…' : 'Set background image…'}
                </button>
                {meta.imageStamp !== null && <button disabled={uploading} onClick={() => { close(); removeBackground(); }}>Remove background</button>}
                <button onClick={() => { close(); setSelectedIds([]); setResizingMap(true); }} title="Drag the map area's edges to resize it">Resize map area</button>
                <button onClick={() => { close(); fitMapToContents(); }} title='Fit the map area around everything on it'>Fit map area to contents</button>
                {anyLocked && <button onClick={() => { close(); setLocked(shapes.filter(shape => shape.locked).map(shape => shape.id), false); }} title='Unlock everything locked on the map'>Unlock everything</button>}
              </div>}
            </MenuButton>
            {/* Outside the menu, so it's still there when a file is picked. */}
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
          characterAspects={characterAspects}
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
