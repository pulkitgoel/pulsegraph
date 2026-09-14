declare module 'gifenc' {
  export type Palette = number[][];
  export function quantize(rgba: Uint8Array, colors: number): Palette;
  export function applyPalette(rgba: Uint8Array, palette: Palette): Uint8Array;
  export function GIFEncoder(): {
    writeFrame(
      indexed: Uint8Array,
      width: number,
      height: number,
      options: { palette: Palette; delay: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
  };
}
