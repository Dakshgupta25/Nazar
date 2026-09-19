import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImageLoader } from '../src/core/image/imageLoader';

describe('ImageLoader Unit Tests & Local Security Guarantees', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to construct a File object
  const createTestFile = (name: string, type: string, sizeBytes: number): File => {
    const buffer = new ArrayBuffer(sizeBytes);
    return new File([buffer], name, { type });
  };

  // Test 1: Valid PNG accepted
  it('1. accepts valid PNG file', () => {
    const file = createTestFile('test-image.png', 'image/png', 1024 * 100);
    const error = ImageLoader.validateFile(file);
    expect(error).toBeNull();
  });

  // Test 2: Valid JPG accepted
  it('2. accepts valid JPG file', () => {
    const file = createTestFile('photo.jpg', 'image/jpeg', 1024 * 200);
    const error = ImageLoader.validateFile(file);
    expect(error).toBeNull();
  });

  // Test 3: Valid WEBP accepted
  it('3. accepts valid WEBP file', () => {
    const file = createTestFile('graphic.webp', 'image/webp', 1024 * 50);
    const error = ImageLoader.validateFile(file);
    expect(error).toBeNull();
  });

  // Test 4: Invalid file rejected
  it('4. rejects invalid non-image file', () => {
    const file = createTestFile('document.pdf', 'application/pdf', 1024 * 10);
    const error = ImageLoader.validateFile(file);
    expect(error).not.toBeNull();
    expect(error?.code).toBe('INVALID_TYPE');
    expect(error?.message).toContain('Unsupported file format');
  });

  // Test 5: Oversized file rejected
  it('5. rejects oversized file greater than 10MB', () => {
    const file = createTestFile('huge-image.png', 'image/png', 11 * 1024 * 1024);
    const error = ImageLoader.validateFile(file);
    expect(error).not.toBeNull();
    expect(error?.code).toBe('OVERSIZED_FILE');
    expect(error?.message).toContain('exceeds maximum allowed limit');
  });

  // Test 6: Corrupted image rejected
  it('6. rejects corrupted image that fails dimension decoding', async () => {
    // Mock FileReader to return invalid data URL
    const originalFileReader = globalThis.FileReader;

    class MockFileReaderCorrupted {
      onload: any = null;
      onerror: any = null;
      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: 'data:image/png;base64,invalidcorrupteddata' } });
          }
        }, 10);
      }
    }
    (globalThis as any).FileReader = MockFileReaderCorrupted;

    // Mock Image object onerror
    const originalImage = globalThis.Image;
    class MockImageCorrupted {
      onload: any = null;
      onerror: any = null;
      set src(_val: string) {
        setTimeout(() => {
          if (this.onerror) {
            this.onerror(new Error('Decode error'));
          }
        }, 10);
      }
    }
    (globalThis as any).Image = MockImageCorrupted;

    const corruptedFile = createTestFile('corrupted.png', 'image/png', 100);

    await expect(ImageLoader.loadImage(corruptedFile)).rejects.toThrow(
      'Failed to parse or decode image file'
    );

    globalThis.FileReader = originalFileReader;
    globalThis.Image = originalImage;
  });

  // Test 7: Image dimensions detected correctly
  it('7. detects image dimensions correctly', async () => {
    const originalFileReader = globalThis.FileReader;
    const originalImage = globalThis.Image;

    class MockFileReaderValid {
      onload: any = null;
      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: 'data:image/png;base64,validdata' } });
          }
        }, 10);
      }
    }
    (globalThis as any).FileReader = MockFileReaderValid;

    class MockImageValid {
      onload: any = null;
      naturalWidth = 1920;
      naturalHeight = 1080;
      set src(_val: string) {
        setTimeout(() => {
          if (this.onload) {
            this.onload();
          }
        }, 10);
      }
    }
    (globalThis as any).Image = MockImageValid;

    const file = createTestFile('wallpaper.png', 'image/png', 5000);
    const loaded = await ImageLoader.loadImage(file);

    expect(loaded.metadata.width).toBe(1920);
    expect(loaded.metadata.height).toBe(1080);
    expect(loaded.metadata.name).toBe('wallpaper.png');
    expect(loaded.metadata.size).toBe(5000);

    globalThis.FileReader = originalFileReader;
    globalThis.Image = originalImage;
  });

  // Test 8: Image remains local
  it('8. verifies image preview URL is strictly local (blob: or data:)', async () => {
    const originalFileReader = globalThis.FileReader;
    const originalImage = globalThis.Image;

    class MockFileReaderValid {
      onload: any = null;
      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: 'data:image/png;base64,validdata' } });
          }
        }, 5);
      }
    }
    (globalThis as any).FileReader = MockFileReaderValid;

    class MockImageValid {
      onload: any = null;
      naturalWidth = 800;
      naturalHeight = 600;
      set src(_val: string) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 5);
      }
    }
    (globalThis as any).Image = MockImageValid;

    const file = createTestFile('sample.png', 'image/png', 2000);
    const loaded = await ImageLoader.loadImage(file);

    expect(
      loaded.previewUrl.startsWith('blob:') || loaded.previewUrl.startsWith('data:')
    ).toBe(true);

    globalThis.FileReader = originalFileReader;
    globalThis.Image = originalImage;
  });

  // Test 9: No processing network request exists
  it('9. guarantees zero network calls (fetch / XMLHttpRequest) during image loading', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const xhrSpy = vi.spyOn(globalThis, 'XMLHttpRequest');

    const originalFileReader = globalThis.FileReader;
    const originalImage = globalThis.Image;

    class MockFileReaderValid {
      onload: any = null;
      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: 'data:image/png;base64,validdata' } });
          }
        }, 5);
      }
    }
    (globalThis as any).FileReader = MockFileReaderValid;

    class MockImageValid {
      onload: any = null;
      naturalWidth = 1000;
      naturalHeight = 1000;
      set src(_val: string) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 5);
      }
    }
    (globalThis as any).Image = MockImageValid;

    const file = createTestFile('privacy-test.png', 'image/png', 3000);
    await ImageLoader.loadImage(file);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();

    globalThis.FileReader = originalFileReader;
    globalThis.Image = originalImage;
  });
});
