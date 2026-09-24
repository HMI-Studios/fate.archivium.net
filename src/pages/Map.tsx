import Konva from 'konva';
import { useEffect, useRef, useState } from 'react';
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva';
import { useParams } from 'react-router';
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';
import { ARCHIVIUM_URL } from '../App';
import { debounce } from '../util';

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

export function initY(roomName: string) {
  const ydoc = new Y.Doc();
  const provider = new WebrtcProvider(roomName, ydoc, {
    signaling: ['wss://hmi.dynu.net/yjs'],
    peerOpts: {
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    }
  });

  // Y.Map keyed by shape id: concurrent inserts/updates/seeds for the same id
  // converge to one entry (CRDT last-write-wins per key) instead of duplicating,
  // which a Y.Array of shapes cannot guarantee under concurrent edits.
  const yShapes: Y.Map<Shape> = ydoc.getMap<Shape>('shapes');
  return { ydoc, provider, yShapes };
}

const TOKEN_CATEGORIES = ['pc', 'npc', 'monster'];

interface Props {
  user: any;
}

export default function Map({ user }: Props) {
  const { campaignShortname, mapShortname } = useParams();

  const stageRef = useRef<Konva.Stage | null>(null);

  const [shapes, setShapes] = useState<Shape[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [mapWidth, setMapWidth] = useState(1000);
  const [mapHeight, setMapHeight] = useState(1000);
  const [imgVersion, setImgVersion] = useState(0);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const [tokenCandidates, setTokenCandidates] = useState<MapItem[]>([]);
  const [tokenPick, setTokenPick] = useState('');

  const myLineId = useRef<string | null>(null);
  const mapTitleRef = useRef(mapShortname);

  const yRef = useRef<{
    ydoc: Y.Doc;
    provider: any;
    yShapes: Y.Map<Shape>;
  }>(undefined);

  useEffect(() => {
    if (!campaignShortname) return;
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok) return;
      const items = await response.json();
      setTokenCandidates(items.filter((item: MapItem) => TOKEN_CATEGORIES.includes(item.item_type)));
    });
  }, [campaignShortname]);

  useEffect(() => {
    if (imgVersion === 0 || !campaignShortname || !mapShortname) return;
    const img = new Image();
    img.crossOrigin = 'use-credentials';
    img.onload = () => setBgImage(img);
    img.src = `${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${mapShortname}/map/image?v=${imgVersion}`;
  }, [imgVersion, campaignShortname, mapShortname]);

  useEffect(() => {
    if (!campaignShortname || !mapShortname) return;
    let cancelled = false;

    const { ydoc, provider, yShapes } = initY(`fate/${campaignShortname}/${mapShortname}`);
    yRef.current = { ydoc, provider, yShapes };

    const update = () => setShapes(Array.from(yShapes.values()));
    yShapes.observeDeep(update);
    update();

    // Seed the (otherwise-empty) live doc from the last persisted save, so a solo
    // reload doesn't show a blank canvas and then autosave that blank state over
    // the real data. Peers connected via WebRTC get a chance to sync first. Since
    // shapes are keyed by id, even if two fresh clients both seed concurrently the
    // per-id writes converge (CRDT last-write-wins) instead of duplicating.
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${mapShortname}`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok || cancelled) return;
      const data = await response.json();
      mapTitleRef.current = data.title ?? mapShortname;
      if (data.map) {
        setMapWidth(data.map.width ?? 1000);
        setMapHeight(data.map.height ?? 1000);
        if (data.map.image_id) setImgVersion(v => v + 1);
      }
      const objData = typeof data.obj_data === 'string' ? JSON.parse(data.obj_data) : data.obj_data;
      const savedShapes: Shape[] = objData?.mapData ?? [];
      if (!savedShapes.length) return;

      setTimeout(() => {
        if (cancelled || yShapes.size > 0) return;
        savedShapes.forEach(shape => yShapes.set(shape.id, shape));
      }, 800);
    });

    ydoc.on('update', (_, origin) => {
      debounce('map-save', async () => {
        await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${mapShortname}`, {
          credentials: 'include',
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: mapTitleRef.current,
            obj_data: {
              mapData: Array.from(yShapes.values()),
            },
          }),
        });
      }, 500);
    });

    return () => {
      cancelled = true;
      yShapes.unobserveDeep(update);
      provider.destroy();
      ydoc.destroy();
    };
  }, [campaignShortname, mapShortname]);

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

  if (!mapShortname || !campaignShortname) return <>No map specified!</>;

  const deleteSelected = () => {
    if (!selectedId || !yRef.current) return;
    yRef.current.yShapes.delete(selectedId);
    setSelectedId(null);
  };

  const addRect = () => {
    if (!yRef.current) return;

    const rect: RectShape = {
      id: `rect-${Date.now()}`,
      clientID: yRef.current.ydoc.clientID,
      type: 'rect',
      x: 50 + Math.random() * 200,
      y: 50 + Math.random() * 200,
      width: 100,
      height: 80,
      fill: 'skyblue'
    };
    yRef.current.yShapes.set(rect.id, rect);
  };

  const addToken = () => {
    if (!yRef.current || !tokenPick) return;
    const item = tokenCandidates.find(i => i.shortname === tokenPick);
    if (!item) return;

    const token: TokenShape = {
      id: `token-${Date.now()}`,
      clientID: yRef.current.ydoc.clientID,
      type: 'token',
      x: mapWidth / 2,
      y: mapHeight / 2,
      itemShortname: item.shortname,
      itemTitle: item.title,
      color: item.item_type === 'pc' ? '#deddca' : item.item_type === 'monster' ? '#ba40f2' : '#e82c17',
    };
    yRef.current.yShapes.set(token.id, token);
  };

  const handleDragMove = (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    if (!yRef.current) return;
    const shape = yRef.current.yShapes.get(id);
    if (!shape) return;

    const updated: Shape =
      shape.type === 'rect' || shape.type === 'token'
        ? { ...shape, x: node.x(), y: node.y() }
        : shape;

    yRef.current.yShapes.set(id, updated);
  };

  const startDraw = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!yRef.current) return;
    if (e.target !== e.target.getStage()) return;
    setDrawing(true);
    const pos = e.target.getStage()!.getPointerPosition()!;
    const newLine: LineShape = {
      id: `line-${Date.now()}`,
      clientID: yRef.current.ydoc.clientID,
      type: 'line',
      points: [pos.x, pos.y],
      stroke: 'black',
      strokeWidth: 2,
      lineCap: 'round',
      lineJoin: 'round'
    };
    myLineId.current = newLine.id;
    yRef.current.yShapes.set(newLine.id, newLine);
  };

  const draw = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!drawing || !yRef.current) return;
    const point = e.target.getStage()!.getPointerPosition()!;
    const id = myLineId.current;
    if (id == null) return;

    const yShapes = yRef.current.yShapes;
    const current = yShapes.get(id) as LineShape | undefined;
    if (!current || current.clientID !== yRef.current.ydoc.clientID) return;

    const updated: LineShape = {
      ...current,
      points: current.points.concat([point.x, point.y])
    };

    yShapes.set(id, updated);
  };

  const endDraw = () => {
    setDrawing(false);
    myLineId.current = null;
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${mapShortname}/map/upload`, {
      credentials: 'include',
      method: 'POST',
      body: formData,
    });
    setUploading(false);
    if (response.ok) {
      setImgVersion(v => v + 1);
    }
  };

  const clearSelection = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage()) {
      setSelectedId(null);
    }
  };

  return (
    <div>
      <button onClick={addRect}>Add Rectangle</button>
      <select value={tokenPick} onChange={({ target }) => setTokenPick(target.value)}>
        <option value=''>Select a character/NPC/monster...</option>
        {tokenCandidates.map(item => (
          <option key={item.shortname} value={item.shortname}>{item.title}</option>
        ))}
      </select>
      <button onClick={addToken} disabled={!tokenPick}>Add Token</button>
      <button onClick={deleteSelected} disabled={!selectedId}>Delete Selected</button>
      <label style={{ marginLeft: 10 }}>
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
      </label>
      <Stage
        ref={stageRef}
        width={mapWidth}
        height={mapHeight}
        style={{ border: '1px solid #aaa', marginTop: 10 }}
        onMouseDown={(e) => { clearSelection(e); startDraw(e); }}
        onMousemove={draw}
        onMouseup={endDraw}
        onTouchStart={(e) => { clearSelection(e); startDraw(e); }}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      >
        <Layer>
          {bgImage && <KonvaImage image={bgImage} x={0} y={0} width={mapWidth} height={mapHeight} listening={false} />}
          {shapes.map(s => {
            const selected = s.id === selectedId;
            if (s.type === 'rect') {
              return (
                <Rect
                  key={s.id}
                  {...s}
                  draggable
                  stroke={selected ? 'red' : undefined}
                  strokeWidth={selected ? 3 : 0}
                  onClick={() => setSelectedId(s.id)}
                  onTap={() => setSelectedId(s.id)}
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
                  draggable
                  onClick={() => setSelectedId(s.id)}
                  onTap={() => setSelectedId(s.id)}
                  onDragMove={e => handleDragMove(s.id, e)}
                  onDragEnd={e => handleDragMove(s.id, e)}
                >
                  <Circle radius={20} fill={s.color} stroke={selected ? 'red' : 'black'} strokeWidth={selected ? 3 : 1} />
                  <Text text={s.itemTitle} y={24} offsetX={20} width={40} align='center' fontSize={12} />
                </Group>
              );
            }
            return (
              <Line
                key={s.id}
                {...s}
                hitStrokeWidth={12}
                stroke={selected ? 'red' : s.stroke}
                onClick={() => setSelectedId(s.id)}
                onTap={() => setSelectedId(s.id)}
              />
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
