import { supabase } from '@/lib/supabase';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_DOC_SIZE = 20 * 1024 * 1024; // 20MB

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const DOC_TYPES = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

export interface UploadResult {
  url: string;
  path: string;
  error: string | null;
}

export function validateFile(file: File): string | null {
  const type = file.type;
  if (IMAGE_TYPES.includes(type) && file.size > MAX_IMAGE_SIZE) return 'Image must be under 10MB';
  if (VIDEO_TYPES.includes(type) && file.size > MAX_VIDEO_SIZE) return 'Video must be under 50MB';
  if (DOC_TYPES.includes(type) && file.size > MAX_DOC_SIZE) return 'Document must be under 20MB';
  if (!IMAGE_TYPES.includes(type) && !VIDEO_TYPES.includes(type) && !DOC_TYPES.includes(type)) {
    return 'Unsupported file type. Use JPG, PNG, WebP, GIF, MP4, WebM, or PDF';
  }
  return null;
}

export async function uploadFile(
  file: File,
  bucket: 'uploads' | 'avatars' = 'uploads',
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  const validationError = validateFile(file);
  if (validationError) return { url: '', path: '', error: validationError };

  const ext = file.name.split('.').pop() || 'bin';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${fileName}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) return { url: '', path: '', error: error.message };

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

  onProgress?.(100);
  return { url: urlData.publicUrl, path: data.path, error: null };
}

export async function deleteFile(path: string, bucket: 'uploads' | 'avatars' = 'uploads'): Promise<boolean> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  return !error;
}

export async function uploadImageFromInput(
  file: File,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  return uploadFile(file, 'uploads', onProgress);
}

export async function uploadAvatar(
  file: File,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  return uploadFile(file, 'avatars', onProgress);
}
