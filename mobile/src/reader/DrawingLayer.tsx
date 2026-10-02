import type { DrawingStroke } from "@ereader/shared";
import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";

export function strokeToSvg(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  if (rest.length === 0) return `M ${first.x} ${first.y} L ${first.x + 0.1} ${first.y}`;
  return `M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(" ");
}

interface Props {
  width: number;
  height: number;
  strokes: DrawingStroke[];
  /** When set, the layer captures touches and reports finished strokes. */
  drawing?: { color: string; widthPx: number; erase?: boolean };
  onStroke?: (stroke: DrawingStroke) => void;
}

export default function DrawingLayer({ width, height, strokes, drawing, onStroke }: Props) {
  const [live, setLive] = useState<{ x: number; y: number }[]>([]);
  const liveRef = useRef<{ x: number; y: number }[]>([]);
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const onStrokeRef = useRef(onStroke);
  onStrokeRef.current = onStroke;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!drawingRef.current,
        onMoveShouldSetPanResponder: () => !!drawingRef.current,
        onPanResponderGrant: (e) => {
          liveRef.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
          setLive(liveRef.current);
        },
        onPanResponderMove: (e) => {
          liveRef.current = [
            ...liveRef.current,
            { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY },
          ];
          setLive(liveRef.current);
        },
        onPanResponderRelease: () => {
          const d = drawingRef.current;
          if (d && liveRef.current.length > 0) {
            onStrokeRef.current?.({ points: liveRef.current, color: d.color, widthPx: d.widthPx });
          }
          liveRef.current = [];
          setLive([]);
        },
      }),
    [],
  );

  const paths = useMemo(
    () =>
      strokes
        .map((s) => ({ s, path: Skia.Path.MakeFromSVGString(strokeToSvg(s.points)) }))
        .filter(
          (x): x is { s: DrawingStroke; path: NonNullable<typeof x.path> } => x.path !== null,
        ),
    [strokes],
  );
  const livePath = useMemo(
    () => (live.length ? Skia.Path.MakeFromSVGString(strokeToSvg(live)) : null),
    [live],
  );

  return (
    <View
      style={[StyleSheet.absoluteFill, { width, height }]}
      pointerEvents={drawing ? "auto" : "none"}
      {...responder.panHandlers}
    >
      <Canvas style={{ width, height }}>
        {paths.map(({ s, path }, i) => (
          <Path
            key={i}
            path={path}
            style="stroke"
            strokeWidth={s.widthPx}
            color={s.color}
            strokeCap="round"
            strokeJoin="round"
          />
        ))}
        {livePath && drawing && (
          <Path
            path={livePath}
            style="stroke"
            strokeWidth={drawing.widthPx}
            color={drawing.color}
            strokeCap="round"
            strokeJoin="round"
          />
        )}
      </Canvas>
    </View>
  );
}
