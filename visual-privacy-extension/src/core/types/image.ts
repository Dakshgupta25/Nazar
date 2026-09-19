/**
 * Core image metadata representing file properties and dimensions.
 */
export interface ImageMetadata {
  name: string;
  mimeType: string;
  size: number; // In bytes
  width: number; // In pixels
  height: number; // In pixels
}

/**
 * Representation of a safely loaded local image with its local ObjectURL preview.
 */
export interface LoadedImage {
  metadata: ImageMetadata;
  previewUrl: string; // Local blob: or data: URL only
  file: File;
}

/**
 * Image validation error payload.
 */
export interface ValidationError {
  code: 'INVALID_TYPE' | 'OVERSIZED_FILE' | 'CORRUPTED_IMAGE' | 'EMPTY_FILE';
  message: string;
}
