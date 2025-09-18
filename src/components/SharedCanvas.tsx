// SharedCanvas.tsx
import Konva from 'konva';
import { useEffect, useRef, useState } from 'react';
import { Layer, Line, Rect, Stage } from 'react-konva';
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';

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

export type Shape = RectShape | LineShape;

export function initY(roomName: string) {
  const ydoc = new Y.Doc();
  const provider = new WebrtcProvider(roomName, ydoc, {
    signaling: ['wss://hmi.dynu.net/yjs'],
    peerOpts: {
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    }
  });

  // Y.Array of generic objects
  const yShapes: Y.Array<Shape> = ydoc.getArray<Shape>('shapes');
  return { ydoc, provider, yShapes };
}

interface Props {
  user: any,
  room?: string;
}

export default function SharedCanvas({ room = 'my-canvas-room' }: Props) {
  const stageRef = useRef<Konva.Stage | null>(null);

  const [shapes, setShapes] = useState<Shape[]>([]);
  const [drawing, setDrawing] = useState(false);

  const myLineIndex = useRef<number | null>(null);

  const yRef = useRef<{
    ydoc: Y.Doc;
    provider: any;
    yShapes: Y.Array<Shape>;
  }>(undefined);

  useEffect(() => {
    const { ydoc, provider, yShapes } = initY(room);
    yRef.current = { ydoc, provider, yShapes };

    const update = () => setShapes(yShapes.toArray());
    yShapes.observeDeep(update);
    update();

    return () => {
      yShapes.unobserveDeep(update);
      provider.destroy();
      ydoc.destroy();
    };
  }, [room]);

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
    yRef.current.yShapes.push([rect]);
  };

  const handleDragMove = (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const idx = shapes.findIndex(s => s.id === id);
    if (idx < 0 || !yRef.current) return;

    const updated: Shape =
      shapes[idx].type === 'rect'
        ? { ...(shapes[idx] as RectShape), x: node.x(), y: node.y() }
        : { ...(shapes[idx] as LineShape) };

    const yShapes = yRef.current.yShapes;
    yShapes.delete(idx, 1);
    yShapes.insert(idx, [updated]);
  };

  const startDraw = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!yRef.current) return;
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
    const yShapes = yRef.current.yShapes;
    myLineIndex.current = yShapes.length;
    yShapes.push([newLine]);
  };

  const draw = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!drawing || !yRef.current) return;
    const point = e.target.getStage()!.getPointerPosition()!;
    const idx = myLineIndex.current;
    if (idx == null) return;

    const yShapes = yRef.current.yShapes;
    const current = yShapes.get(idx) as LineShape;

    if (current.clientID !== yRef.current.ydoc.clientID) return;

    const updated: LineShape = {
      ...current,
      points: current.points.concat([point.x, point.y])
    };

    yShapes.delete(idx, 1);
    yShapes.insert(idx, [updated]);
  };

  const endDraw = () => {
    setDrawing(false);
    myLineIndex.current = null; // release ownership
  };

  return (
    <div>
      <button onClick={addRect}>Add Rectangle</button>
      <Stage
        ref={stageRef}
        width={800}
        height={600}
        style={{ border: '1px solid #aaa', marginTop: 10 }}
        onMouseDown={startDraw}
        onMousemove={draw}
        onMouseup={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      >
        <Layer>
          {shapes.map(s =>
            s.type === 'rect' ? (
              <Rect
                key={s.id}
                {...s}
                draggable
                onDragMove={e => handleDragMove(s.id, e)}
              />
            ) : (
              <Line key={s.id} {...s} />
            )
          )}
        </Layer>
      </Stage>
    </div>
  );
}
