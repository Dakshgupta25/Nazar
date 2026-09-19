import { ImageMetadata, LoadedImage, ValidationError } from '../types/image';

export class ImageLoader {
  private static ALLOWED_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp'
  ]);

  private static ALLOWED_EXTENSIONS = new Set([
    'png',
    'jpg',
    'jpeg',
    'webp'
  ]);

  // 10 MB maximum file size limit
  private static MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

  /**
   * Validates file type, extension, size, and presence.
   */
  public static validateFile(file: File | null | undefined): ValidationError | null {
    if (!file) {
      return {
        code: 'EMPTY_FILE',
        message: 'No file was provided.'
      };
    }

    if (file.size === 0) {
      return {
        code: 'EMPTY_FILE',
        message: 'Selected file is empty (0 bytes).'
      };
    }

    if (file.size > this.MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return {
        code: 'OVERSIZED_FILE',
        message: `File size (${sizeMB} MB) exceeds maximum allowed limit of 10 MB.`
      };
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const mimeType = file.type.toLowerCase();

    const isValidMime = this.ALLOWED_MIME_TYPES.has(mimeType);
    const isValidExt = this.ALLOWED_EXTENSIONS.has(extension);

    if (!isValidMime && !isValidExt) {
      return {
        code: 'INVALID_TYPE',
        message: `Unsupported file format "${file.name}". Only PNG, JPG, and WEBP images are supported.`
      };
    }

    return null;
  }

  /**
   * Loads image locally, extracts dimensions, and returns safe metadata.
   * Guarantees 0 network requests by using local URL.createObjectURL or FileReader.
   */
  public static async loadImage(file: File): Promise<LoadedImage> {
    const validationError = this.validateFile(file);
    if (validationError) {
      throw new Error(validationError.message);
    }

    // Determine dimensions locally via Image element
    const dimensions = await this.getImageDimensions(file);

    const objectUrl = URL.createObjectURL(file);

    const metadata: ImageMetadata = {
      name: file.name,
      mimeType: file.type || this.inferMimeType(file.name),
      size: file.size,
      width: dimensions.width,
      height: dimensions.height
    };

    return {
      metadata,
      previewUrl: objectUrl,
      file
    };
  }

  /**
   * Helper to decode image dimensions locally and verify image integrity.
   */
  private static getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
          return reject(new Error('Failed to read image file data.'));
        }

        const img = new Image();

        img.onload = () => {
          if (img.naturalWidth === 0 || img.naturalHeight === 0) {
            reject(new Error('Image appears corrupted or has 0 dimensions.'));
          } else {
            resolve({
              width: img.naturalWidth,
              height: img.naturalHeight
            });
          }
        };

        img.onerror = () => {
          reject(new Error('Failed to parse or decode image file. File may be corrupted.'));
        };

        img.src = dataUrl;
      };

      reader.onerror = () => {
        reject(new Error('FileReader error reading file.'));
      };

      reader.readAsDataURL(file);
    });
  }

  private static inferMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'webp': return 'image/webp';
      default: return 'image/png';
    }
  }

  /**
   * Cleans up object URL resources.
   */
  public static revokePreviewUrl(previewUrl: string): void {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
  }
}
