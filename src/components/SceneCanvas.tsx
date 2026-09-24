import Konva from 'konva';
import { useEffect, useRef, useState } from 'react';
import { Circle, Group, Image as KonvaImage, Label, Layer, Line, Rect, Stage, Tag, Text } from 'react-konva';
import * as Y from 'yjs';
import { ARCHIVIUM_URL } from '../App';
import { parseSheetAspectId, sheetInvokes, TEMPORARY_ASPECTS_KEY, toSheetAspect, type SceneAspect, type SheetAspect } from '../fate/aspects';
import { FATE_CORE_LAYOUT } from '../fate/coreLayout';
import { fetchSheetRoot, updateSheetKey } from '../fate/sheetData';
import { useSyncedDoc } from '../sync';
import { debounce } from '../util';
import AspectsPanel, { type SceneCharacter } from './AspectsPanel';

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

interface Props {
  campaignShortname: string;
  sceneShortname: string;
  // Whether this viewer runs the scene: may replace the background image and end the scene.
  gm?: boolean;
}

// Where temporary aspects kept on a character are stored (the Fate Core sheet's root).
const SHEET_ROOT = FATE_CORE_LAYOUT.root;

export default function SceneCanvas({ campaignShortname, sceneShortname, gm = true }: Props) {
  const doc = useSyncedDoc(`scene/${campaignShortname}/${sceneShortname}`);
  const live = doc?.status === 'synced';
  const canEdit = live && !doc.readOnly;

  const [liveShapes, setLiveShapes] = useState<Shape[]>([]);
  const [savedShapes, setSavedShapes] = useState<Shape[] | null>(null);
  const [liveAspects, setLiveAspects] = useState<SceneAspect[]>([]);
  const [savedAspects, setSavedAspects] = useState<SceneAspect[]>([]);
  const [sheetAspects, setSheetAspects] = useState<{ [shortname: string]: SheetAspect[] }>({});
  const [drawing, setDrawing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [meta, setMeta] = useState<SceneMeta>({ width: 1000, height: 1000, imageStamp: null });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const [tokenCandidates, setTokenCandidates] = useState<MapItem[]>([]);
  const [tokenPick, setTokenPick] = useState('');

  const [tool, setTool] = useState<'pan' | 'draw'>('pan');
  const containerRef = useRef<HTMLDivElement | null>(null);
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
      if (data.map) {
        setMeta(m => ({
          width: data.map.width ?? m.width,
          height: data.map.height ?? m.height,
          imageStamp: data.map.image_id ?? null,
        }));
      }
      const objData = typeof data.obj_data === 'string' ? JSON.parse(data.obj_data) : data.obj_data;
      setSavedAspects(objData?.sceneAspects ?? []);
      setSavedShapes(objData?.mapData ?? []);
    });
  }, [campaignShortname, sceneShortname]);

  useEffect(() => {
    if (!ydoc || !provider || !yShapes || !yMeta || !yAspects) return;

    const updateShapes = () => setLiveShapes(Array.from(yShapes.values()));
    const updateAspects = () => setLiveAspects(Array.from(yAspects.values()));
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
    updateShapes();
    updateMeta();
    updateAspects();

    // Persist our own edits; updates that arrive from the server were saved by
    // whoever made them. The data endpoint merges into obj_data, so this leaves
    // the item's other Archivium content (body, tabs, etc.) untouched.
    const onUpdate = (_: Uint8Array, origin: unknown) => {
      if (origin === provider) return;
      debounce(`scene-save-${sceneShortname}`, async () => {
        await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${sceneShortname}/data`, {
          credentials: 'include',
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mapData: Array.from(yShapes.values()),
            sceneAspects: Array.from(yAspects.values()),
          }),
        });
      }, 500);
    };
    ydoc.on('update', onUpdate);

    return () => {
      yShapes.unobserve(updateShapes);
      yMeta.unobserve(updateMeta);
      yAspects.unobserve(updateAspects);
      ydoc.off('update', onUpdate);
    };
  }, [ydoc]);

  // Seed the live doc from the last save if nobody has loaded this scene since the
  // server last started. Shapes are keyed by id, so two clients seeding at once
  // converge instead of duplicating.
  useEffect(() => {
    if (!canEdit || !ydoc || !yShapes || !yMeta || !yAspects || savedShapes === null || seeded.current) return;
    seeded.current = true;
    ydoc.transact(() => {
      if (yShapes.size === 0) savedShapes.forEach(shape => yShapes.set(shape.id, shape));
      if (yAspects.size === 0) savedAspects.forEach(aspect => yAspects.set(aspect.id, aspect));
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

  // One entry per character with a token in the scene.
  const characters: SceneCharacter[] = [];
  for (const shape of shapes) {
    if (shape.type === 'token' && !characters.some(c => c.shortname === shape.itemShortname)) {
      characters.push({ shortname: shape.itemShortname, title: shape.itemTitle });
    }
  }
  const characterKey = characters.map(c => c.shortname).sort().join(',');

  const loadSheetAspects = (shortnames: string[]) => {
    shortnames.forEach(shortname => {
      fetchSheetRoot(campaignShortname, shortname, SHEET_ROOT)
        .then(root => {
          const list = root[TEMPORARY_ASPECTS_KEY];
          setSheetAspects(current => ({ ...current, [shortname]: Array.isArray(list) ? list : [] }));
        })
        .catch(() => {});
    });
  };

  useEffect(() => {
    if (characterKey) loadSheetAspects(characterKey.split(','));
  }, [characterKey]);

  // Sheets aren't live-synced, so whoever changes a character's sheet aspects from a
  // scene bumps a stamp in the scene doc, and everyone else reloads that sheet.
  const ySheetStamps = ydoc?.getMap<number>('sheetStamps');
  useEffect(() => {
    if (!ySheetStamps) return;
    const onStamp = (event: Y.YMapEvent<number>) => {
      if (!event.transaction.local) loadSheetAspects(Array.from(event.keysChanged));
    };
    ySheetStamps.observe(onStamp);
    return () => ySheetStamps.unobserve(onStamp);
  }, [ydoc]);

  // Change a character's sheet aspects: shown straight away, then applied to the
  // freshest copy of the sheet. Resolves to whether it was saved.
  const changeSheetAspects = async (shortname: string, update: (list: SheetAspect[]) => SheetAspect[]): Promise<boolean> => {
    if (!canEdit) return false;
    setSheetAspects(current => ({ ...current, [shortname]: update(current[shortname] ?? []) }));
    try {
      const saved = await updateSheetKey<SheetAspect[]>(campaignShortname, shortname, SHEET_ROOT, TEMPORARY_ASPECTS_KEY, list => update(Array.isArray(list) ? list : []));
      setSheetAspects(current => ({ ...current, [shortname]: saved }));
      ySheetStamps?.set(shortname, Date.now());
      return true;
    } catch {
      window.alert("Couldn't save the change to the character's sheet.");
      loadSheetAspects([shortname]);
      return false;
    }
  };

  // Find a panel row's entry in a (possibly fresher) copy of the list: the same
  // position if it still holds the same aspect, otherwise the first with its name.
  const locateSheetAspect = (list: SheetAspect[], shortname: string, index: number) => {
    const name = sheetAspects[shortname]?.[index]?.name;
    if (list[index]?.name === name) return index;
    return list.findIndex(entry => entry.name === name);
  };

  // Tags beside a character's token: its sheet's temporary aspects, then the scene's.
  const tokenTags = (shortname: string): { name: string, freeInvokes: number }[] => [
    ...(sheetAspects[shortname] ?? []).filter(a => a.name).map(a => ({ name: a.name!, freeInvokes: sheetInvokes(a) })),
    ...aspects.filter(a => a.target === shortname),
  ];

  const writableAspects = (): Y.Map<SceneAspect> | null => (canEdit && yAspects) ? yAspects : null;

  const addAspect = (aspect: Omit<SceneAspect, 'id'>) => {
    // Temporary character aspects go straight onto the sheet so they outlast the scene.
    if (aspect.kind === 'temporary' && aspect.target) {
      changeSheetAspects(aspect.target, list => [...list, toSheetAspect(aspect)]);
      return;
    }
    const id = `aspect-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    writableAspects()?.set(id, { ...aspect, id });
  };

  const updateAspect = (id: string, changes: Partial<SceneAspect>) => {
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
    if (!aspect.target) return;
    if (await changeSheetAspects(aspect.target, list => [...list, toSheetAspect(aspect)])) {
      writableAspects()?.delete(aspect.id);
    }
  };

  const endScene = async () => {
    const kept = aspects.filter(a => a.kind === 'temporary' && a.target);
    if (!window.confirm('End the scene? Its situation aspects, advantages and boosts will be cleared. Temporary aspects stay on character sheets.')) return;
    // A temporary aspect that couldn't be moved to its sheet stays in the scene.
    for (const aspect of kept) await keepOnSheet(aspect);
    const target = writableAspects();
    if (!target || !ydoc) return;
    ydoc.transact(() => {
      aspects.filter(a => !kept.includes(a)).forEach(a => target.delete(a.id));
    });
  };

  const writableShapes = (): Y.Map<Shape> | null => (canEdit && yShapes) ? yShapes : null;

  const deleteSelected = () => {
    const target = writableShapes();
    if (!selectedId || !target) return;
    target.delete(selectedId);
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
    setUploading(false);
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

  return (
    <div>
      {doc?.status === 'connecting' && <p className='ma-0 mb-1'><small>Connecting to the live scene…</small></p>}
      {doc?.status === 'offline' && <p className='ma-0 mb-1'><small>Live sync is unavailable, so this is the last saved version and can't be edited.</small></p>}
      {canEdit && <div>
        <button onClick={addRect}>Add Rectangle</button>
        <select value={tokenPick} onChange={({ target }) => setTokenPick(target.value)}>
          <option value=''>Select a character/NPC/monster...</option>
          {tokenCandidates.map(item => (
            <option key={item.shortname} value={item.shortname}>{item.title}</option>
          ))}
        </select>
        <button onClick={addToken} disabled={!tokenPick}>Add Token</button>
        <button onClick={deleteSelected} disabled={!selectedId}>Delete Selected</button>
        {gm && <label style={{ marginLeft: 10 }}>
          Background image:
          <input
            type='file'
            accept='image/*'
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadImage(file);
            }}
          />
        </label>}
      </div>}
      <div style={{ marginTop: 10 }}>
        {canEdit && <>
          <button onClick={() => setTool('pan')} disabled={tool === 'pan'}>Pan</button>
          <button onClick={() => setTool('draw')} disabled={tool === 'draw'}>Draw</button>
        </>}
        <span style={{ marginLeft: canEdit ? 10 : 0 }}>
          <button onClick={() => zoomAtCenter(1 / 1.25)}>−</button>
          <span style={{ display: 'inline-block', minWidth: 50, textAlign: 'center' }}>{Math.round(camera.scale * 100)}%</span>
          <button onClick={() => zoomAtCenter(1.25)}>+</button>
          <button onClick={() => setCamera(fitCamera(viewport.width, viewport.height, meta.width, meta.height))}>Fit</button>
        </span>
      </div>
      <div className='d-flex gap-3 flex-wrap' style={{ marginTop: 10, alignItems: 'flex-start' }}>
        <div
          ref={containerRef}
          style={{
            border: '1px solid #aaa',
            flex: '1 1 480px',
            minWidth: 0,
            height: '70vh',
            minHeight: 400,
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
                      <Circle radius={20} fill={s.color} stroke={selected ? 'red' : 'black'} strokeWidth={selected ? 3 : 1} />
                      <Text text={s.itemTitle} y={24} offsetX={20} width={40} align='center' fontSize={12} />
                      {/* The character's aspects in play, as tags beside the token. */}
                      {tokenTags(s.itemShortname).map((tag, i) => (
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
        <div style={{ flex: '0 1 280px', minWidth: 220 }}>
          <AspectsPanel
            campaignShortname={campaignShortname}
            aspects={aspects}
            characters={characters}
            sheetAspects={sheetAspects}
            canEdit={canEdit}
            gm={gm}
            onAdd={addAspect}
            onUpdate={updateAspect}
            onRemove={removeAspect}
            onKeepOnSheet={keepOnSheet}
            onEndScene={endScene}
          />
        </div>
      </div>
    </div>
  );
}
