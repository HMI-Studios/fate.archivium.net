import { useEffect, useState } from 'react';
import { Layer, Rect, Stage, Text } from 'react-konva';
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';

export default function Canvas() {
  const [yShapes, setYShapes] = useState<Y.Array<any> | null>(null);

  useEffect(() => {
    const roomName = 'my-canvas-room';
    const ydoc = new Y.Doc();

    const provider = new WebrtcProvider(roomName, ydoc, {
      signaling: ['wss://signaling.yjs.dev'],
      password: undefined,
    });

    const yArray = ydoc.getArray('shapes');
    setYShapes(yArray);

    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, []);

  if (!yShapes) return <div>Loading shared room…</div>;

  const handleDragMove = (id, e) => {
    const node = e.target;
    const idx = yShapes.toArray().findIndex(s => s.id === id);
    if (idx >= 0) {
      yShapes.delete(idx, 1);
      yShapes.insert(idx, [{ ...yShapes[idx], x: node.x(), y: node.y() }]);
    }
  };

  return (
    <Stage width={800} height={600} style={{ border: '1px solid black' }}>
      <Layer>
        {yShapes.map(s =>
          s.type === 'text' ? (
            <Text key={s.id} {...s} draggable onDragMove={e => handleDragMove(s.id, e)} />
          ) : (
            <Rect key={s.id} {...s} draggable onDragMove={e => handleDragMove(s.id, e)} />
          )
        )}
      </Layer>
    </Stage>
  );
}
