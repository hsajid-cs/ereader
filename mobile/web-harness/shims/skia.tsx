// Web test harness only: Skia needs CanvasKit; the drawing layer is not exercised here.
export const Canvas = () => null;
export const Path = () => null;
export const Skia = { Path: { MakeFromSVGString: () => null } };
