import type { PipelineStage } from 'mongoose';

// Match parseInt's leading decimal digits; legacy nonnumeric UUIDs sort as zero.
// Only the page's full recipe documents leave MongoDB, even for numeric sorting.
export function numericRecipePagePipeline(
  query: Record<string, unknown>, direction: 1 | -1, page: number, limit: number,
  collection = 'recipes',
): PipelineStage[] {
  return [
    { $match: query },
    { $project: { _id: 1, numericPrefix: { $regexFind: {
      input: { $trim: { input: { $convert: { input: '$uuid', to: 'string', onError: '', onNull: '' } } } },
      regex: '^[+-]?[0-9]+',
    } } } },
    { $set: { numericUuid: { $convert: { input: '$numericPrefix.match', to: 'double', onError: 0, onNull: 0 } } } },
    { $sort: { numericUuid: direction, _id: 1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    { $lookup: { from: collection, localField: '_id', foreignField: '_id', as: 'recipe' } },
    { $unwind: '$recipe' },
    { $replaceRoot: { newRoot: '$recipe' } },
  ];
}
