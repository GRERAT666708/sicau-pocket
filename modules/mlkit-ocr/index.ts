import { requireNativeModule } from 'expo-modules-core';

export type OcrLine = {
  text: string;
  /** 原图像素坐标 */
  x: number;
  y: number;
  w: number;
  h: number;
};

type Native = {
  recognize(uri: string): Promise<OcrLine[]>;
  recognizeRegion(uri: string, left: number, top: number, right: number, bottom: number): Promise<OcrLine[]>;
  release(): void;
};

const Native = requireNativeModule<Native>('MlkitOcr');

const clean = (lines: OcrLine[] | null | undefined) =>
  (lines ?? []).filter((l: OcrLine) => l && typeof l.text === 'string' && l.text.trim().length > 0);

/** 整图 OCR（中文，模型在 APK 内，可离线） */
export async function recognizeImage(uri: string): Promise<OcrLine[]> {
  return clean(await Native.recognize(uri));
}

/** 只识别一块区域（原图像素坐标），返回的框仍是整图坐标 */
export async function recognizeRegion(
  uri: string,
  left: number,
  top: number,
  right: number,
  bottom: number,
): Promise<OcrLine[]> {
  return clean(await Native.recognizeRegion(uri, Math.round(left), Math.round(top), Math.round(right), Math.round(bottom)));
}

export function releaseImage() {
  Native.release();
}
