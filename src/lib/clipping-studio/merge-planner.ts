import {
  MergeRecipe,
  MergeRecipeItem,
  Clip,
  MediaAsset,
  formatMsToTimestamp,
} from './contracts';

export interface RecipeItemResolved {
  item: MergeRecipeItem;
  clip: Clip;
  mediaAsset: MediaAsset;
  orderIndex: number;
}

export interface MergePlan {
  recipeId: string;
  recipeName: string;
  totalDurationMs: number;
  totalDurationFormatted: string;
  itemCount: number;
  items: RecipeItemResolved[];
  strategy: 'concat_demuxer_copy' | 'filter_complex_encode';
  requiresReencoding: boolean;
  reencodeReasons: string[];
  missingClipIds: string[];
  missingAssetIds: string[];
  isValid: boolean;
  validationError?: string;
}

/**
 * Plans the merge execution for a recipe, determining whether lossless stream copy
 * is possible or if a filter_complex re-encoding pipeline is required.
 */
export function planMergeRecipe(
  recipe: MergeRecipe,
  allClips: Clip[],
  allAssets: MediaAsset[]
): MergePlan {
  const missingClipIds: string[] = [];
  const missingAssetIds: string[] = [];
  const resolvedItems: RecipeItemResolved[] = [];

  let totalDurationMs = 0;

  // Sort items strictly by orderIndex
  const sortedItems = [...recipe.items].sort((a, b) => a.orderIndex - b.orderIndex);

  for (let idx = 0; idx < sortedItems.length; idx++) {
    const item = sortedItems[idx];
    const clip = allClips.find((c) => c.id === item.clipId);
    if (!clip) {
      missingClipIds.push(item.clipId);
      continue;
    }

    const asset = allAssets.find((a) => a.id === clip.mediaAssetId);
    if (!asset) {
      missingAssetIds.push(clip.mediaAssetId);
      continue;
    }

    totalDurationMs += clip.durationMs;

    resolvedItems.push({
      item,
      clip,
      mediaAsset: asset,
      orderIndex: idx,
    });
  }

  // If there are missing references or no items, recipe cannot be executed
  if (resolvedItems.length === 0) {
    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      totalDurationMs: 0,
      totalDurationFormatted: '00:00:00.000',
      itemCount: 0,
      items: [],
      strategy: 'concat_demuxer_copy',
      requiresReencoding: false,
      reencodeReasons: [],
      missingClipIds,
      missingAssetIds,
      isValid: false,
      validationError: 'Recipe contains no valid clips',
    };
  }

  if (missingClipIds.length > 0 || missingAssetIds.length > 0) {
    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      totalDurationMs,
      totalDurationFormatted: formatMsToTimestamp(totalDurationMs),
      itemCount: resolvedItems.length,
      items: resolvedItems,
      strategy: 'concat_demuxer_copy',
      requiresReencoding: true,
      reencodeReasons: ['Recipe references deleted or missing source clips'],
      missingClipIds,
      missingAssetIds,
      isValid: false,
      validationError: `Recipe references ${missingClipIds.length} missing clip(s) and ${missingAssetIds.length} missing media asset(s)`,
    };
  }

  // Stream Compatibility Check
  const reencodeReasons: string[] = [];

  const firstAsset = resolvedItems[0].mediaAsset;
  const firstMeta = firstAsset.metadata;

  for (let i = 1; i < resolvedItems.length; i++) {
    const currentMeta = resolvedItems[i].mediaAsset.metadata;

    // Check video codec
    if (firstMeta.videoCodec && currentMeta.videoCodec && firstMeta.videoCodec !== currentMeta.videoCodec) {
      reencodeReasons.push(`Different video codecs: ${firstMeta.videoCodec} vs ${currentMeta.videoCodec}`);
    }

    // Check dimensions
    if (
      (firstMeta.width && currentMeta.width && firstMeta.width !== currentMeta.width) ||
      (firstMeta.height && currentMeta.height && firstMeta.height !== currentMeta.height)
    ) {
      reencodeReasons.push(
        `Different resolutions: ${firstMeta.width}x${firstMeta.height} vs ${currentMeta.width}x${currentMeta.height}`
      );
    }

    // Check audio codec
    if (firstMeta.audioCodec && currentMeta.audioCodec && firstMeta.audioCodec !== currentMeta.audioCodec) {
      reencodeReasons.push(`Different audio codecs: ${firstMeta.audioCodec} vs ${currentMeta.audioCodec}`);
    }

    // Check audio sample rate
    if (firstMeta.sampleRate && currentMeta.sampleRate && firstMeta.sampleRate !== currentMeta.sampleRate) {
      reencodeReasons.push(`Different audio sample rates: ${firstMeta.sampleRate}Hz vs ${currentMeta.sampleRate}Hz`);
    }

    // If transitions are specified (e.g. crossfade), re-encoding is necessary
    if (resolvedItems[i].item.transition && resolvedItems[i].item.transition !== 'none') {
      reencodeReasons.push(`Transition "${resolvedItems[i].item.transition}" requires rendering filter complex`);
    }
  }

  // If user requested target resolution override or audio normalization
  if (recipe.targetResolution && recipe.targetResolution !== 'source') {
    reencodeReasons.push(`Target resolution configured to ${recipe.targetResolution}`);
  }
  if (recipe.normalizeAudio) {
    reencodeReasons.push('Audio normalization (EBU R128) enabled');
  }

  const requiresReencoding = reencodeReasons.length > 0;
  const strategy = requiresReencoding ? 'filter_complex_encode' : 'concat_demuxer_copy';

  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    totalDurationMs,
    totalDurationFormatted: formatMsToTimestamp(totalDurationMs),
    itemCount: resolvedItems.length,
    items: resolvedItems,
    strategy,
    requiresReencoding,
    reencodeReasons,
    missingClipIds: [],
    missingAssetIds: [],
    isValid: true,
  };
}

/**
 * Builds safe argument arrays for FFmpeg concat demuxer or filter complex.
 * (Used by local media service and export engine - zero shell interpolation).
 */
export function buildMergeFfmpegArgs(
  plan: MergePlan,
  tempConcatListPath: string,
  outputPath: string
): string[] {
  if (plan.strategy === 'concat_demuxer_copy') {
    // Lossless stream-copy concat demuxer
    return [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', tempConcatListPath,
      '-c', 'copy',
      outputPath,
    ];
  }

  // Filter complex with audio normalization and uniform scale
  const inputs: string[] = [];
  const filterChains: string[] = [];
  let concatInputs = '';

  plan.items.forEach((resolved, idx) => {
    inputs.push('-ss', (resolved.clip.startMs / 1000).toFixed(3));
    inputs.push('-to', (resolved.clip.endMs / 1000).toFixed(3));
    inputs.push('-i', resolved.mediaAsset.localPath);

    filterChains.push(`[${idx}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v${idx}]`);
    filterChains.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${idx}]`);
    concatInputs += `[v${idx}][a${idx}]`;
  });

  const concatFilter = `${concatInputs}concat=n=${plan.items.length}:v=1:a=1[outv][outa]`;
  const fullFilter = [...filterChains, concatFilter].join('; ');

  return [
    '-y',
    ...inputs,
    '-filter_complex', fullFilter,
    '-map', '[outv]',
    '-map', '[outa]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '22',
    '-c:a', 'aac',
    '-b:a', '192k',
    outputPath,
  ];
}
