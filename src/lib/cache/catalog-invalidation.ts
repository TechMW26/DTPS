import type { Schema } from 'mongoose';
import { invalidateJsonCacheTag } from './json-cache';

export function invalidateCatalogAfterWrites(schema: Schema, tags: string[]) {
  const invalidate = async () => {
    await Promise.all(tags.map(invalidateJsonCacheTag));
  };
  schema.post('save', invalidate);
  schema.post('insertMany', invalidate);
  schema.post('updateOne', invalidate);
  schema.post('updateMany', invalidate);
  schema.post('findOneAndUpdate', invalidate);
  schema.post('replaceOne', invalidate);
  schema.post('findOneAndReplace', invalidate);
  schema.post('findOneAndDelete', invalidate);
  schema.post('deleteOne', { document: true, query: true }, invalidate);
  schema.post('deleteMany', invalidate);
}
