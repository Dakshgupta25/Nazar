import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Global mocks for JSDOM test environment
if (typeof window !== 'undefined') {
  (window as any).IS_TEST_ENV = true;

  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = vi.fn((_blob: Blob) => `blob:http://localhost/${Math.random()}`);
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = vi.fn();
  }

  // 1. Lightweight 2D Canvas Mock for JSDOM test runner
  class MockCanvas2DContext {
    canvas: any;
    fillStyle = '#000000';
    globalAlpha = 1.0;
    private _buffer: Uint8ClampedArray | null = null;
    private _stateStack: Array<{ fillStyle: string; globalAlpha: number }> = [];

    constructor(canvas: any) {
      this.canvas = canvas;
    }

    get width(): number {
      return this.canvas.width || 300;
    }

    get height(): number {
      return this.canvas.height || 150;
    }

    get _data(): Uint8ClampedArray {
      const w = this.width;
      const h = this.height;
      const targetLen = w * h * 4;
      if (!this._buffer || this._buffer.length !== targetLen) {
        this._buffer = new Uint8ClampedArray(targetLen);
      }
      return this._buffer;
    }

    save() {
      this._stateStack.push({ fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
    }

    restore() {
      const state = this._stateStack.pop();
      if (state) {
        this.fillStyle = state.fillStyle;
        this.globalAlpha = state.globalAlpha;
      }
    }

    createImageData(w: number, h: number) {
      return {
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4)
      };
    }

    putImageData(imageData: any, _dx?: number, _dy?: number) {
      if (imageData && imageData.data && imageData.data instanceof Uint8ClampedArray) {
        const dest = this._data;
        if (imageData.data.length === dest.length) {
          dest.set(imageData.data);
        }
      }
    }

    drawImage(img: any, _dx?: number, _dy?: number, _dw?: number, _dh?: number) {
      if (img) {
        const dest = this._data;
        if (img._data && img._data instanceof Uint8ClampedArray && img._data.length === dest.length) {
          dest.set(img._data);
        } else if (img.data && img.data instanceof Uint8ClampedArray && img.data.length === dest.length) {
          dest.set(img.data);
        } else if (img.pixels && img.pixels instanceof Uint8ClampedArray && img.pixels.length === dest.length) {
          dest.set(img.pixels);
        } else if (img.rawPixels && img.rawPixels instanceof Uint8ClampedArray && img.rawPixels.length === dest.length) {
          dest.set(img.rawPixels);
        }
      }
    }

    fillRect(x: number, y: number, w: number, h: number) {
      const color = parseColorHex(this.fillStyle);
      const dest = this._data;
      const startX = Math.max(0, Math.floor(x));
      const startY = Math.max(0, Math.floor(y));
      const endX = Math.min(this.width, Math.ceil(x + w));
      const endY = Math.min(this.height, Math.ceil(y + h));

      for (let py = startY; py < endY; py++) {
        for (let px = startX; px < endX; px++) {
          const idx = (py * this.width + px) * 4;
          dest[idx] = color.r;
          dest[idx + 1] = color.g;
          dest[idx + 2] = color.b;
          dest[idx + 3] = Math.round(color.a * this.globalAlpha);
        }
      }
    }

    getImageData(x: number, y: number, w: number, h: number) {
      const startX = Math.max(0, Math.floor(x));
      const startY = Math.max(0, Math.floor(y));
      const endX = Math.min(this.width, startX + w);
      const endY = Math.min(this.height, startY + h);

      const src = this._data;
      const result = new Uint8ClampedArray(w * h * 4);
      let outIdx = 0;

      for (let py = startY; py < endY; py++) {
        for (let px = startX; px < endX; px++) {
          const srcIdx = (py * this.width + px) * 4;
          result[outIdx] = src[srcIdx];
          result[outIdx + 1] = src[srcIdx + 1];
          result[outIdx + 2] = src[srcIdx + 2];
          result[outIdx + 3] = src[srcIdx + 3];
          outIdx += 4;
        }
      }

      return {
        width: w,
        height: h,
        data: result
      };
    }
  }

  function parseColorHex(hex: string): { r: number; g: number; b: number; a: number } {
    if (hex === '#000000' || hex === 'black') return { r: 0, g: 0, b: 0, a: 255 };
    if (hex === '#ffffff' || hex === 'white') return { r: 255, g: 255, b: 255, a: 255 };
    let clean = hex.replace('#', '');
    if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('');
    if (clean.length === 6) {
      const num = parseInt(clean, 16);
      return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255, a: 255 };
    }
    return { r: 0, g: 0, b: 0, a: 255 };
  }

  // Override HTMLCanvasElement prototype in JSDOM so getContext('2d') returns MockCanvas2DContext
  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = function (contextId: string) {
      if (contextId === '2d') {
        if (!(this as any)._mockContext) {
          (this as any)._mockContext = new MockCanvas2DContext(this);
        }
        return (this as any)._mockContext;
      }
      return null;
    };

    HTMLCanvasElement.prototype.toBlob = function (callback: (b: Blob | null) => void, type?: string) {
      const ctx = (this as any)._mockContext || new MockCanvas2DContext(this);
      const data = ctx._data;
      const blob = new Blob([new Uint8Array(data)], { type: type || 'image/png' });
      (blob as any).buffer = new Uint8Array(data).buffer;
      (blob as any).rawPixels = new Uint8ClampedArray(data);
      callback(blob);
    };

    HTMLCanvasElement.prototype.toDataURL = function (type?: string) {
      const ctx = (this as any)._mockContext || new MockCanvas2DContext(this);
      const data = ctx._data;
      const binary = Array.from(data).map((b: any) => String.fromCharCode(b)).join('');
      const base64 = typeof btoa !== 'undefined' ? btoa(binary) : '';
      return `data:${type || 'image/png'};base64,${base64}`;
    };
  }

  // Define OffscreenCanvas mock for JSDOM test runner if not natively present
  if (typeof (window as any).OffscreenCanvas === 'undefined') {
    (window as any).OffscreenCanvas = class OffscreenCanvas {
      width: number;
      height: number;
      private _ctx: any;

      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        const fakeCanvas = { width: w, height: h };
        this._ctx = new MockCanvas2DContext(fakeCanvas);
      }

      getContext(type: string) {
        if (type === '2d') return this._ctx;
        return null;
      }

      convertToBlob(options?: any): Promise<Blob> {
        const data = this._ctx._data;
        const blob = new Blob([new Uint8Array(data)], { type: options?.type || 'image/png' });
        (blob as any).buffer = new Uint8Array(data).buffer;
        (blob as any).rawPixels = new Uint8ClampedArray(data);
        return Promise.resolve(blob);
      }
    };
  }
}
