import { rampShape, peakForRatio, STORY_FPS } from './story-ramp';

export function rampTimestampExpression(sourceSeconds: number, outputFrames: number, cap: number) {
  const peak = peakForRatio(outputFrames / STORY_FPS / sourceSeconds, cap);
  const rates = rampShape(cap).map(value => 1 + value * (peak - 1));
  const width = sourceSeconds / (rates.length - 1);
  let elapsed = 0;
  const pieces = rates.slice(1).map((right, index) => {
    const start = index * width;
    const left = rates[index], slope = (right - left) / width;
    const delta = '(T-' + start + ')';
    const curve = Math.abs(slope) < 1e-8 ? delta + '/' + left :
      'log((' + left + '+' + slope + '*' + delta + ')/' + left + ')/' + slope;
    const expression = '(' + elapsed + '+' + curve + ')';
    elapsed += Math.abs(slope) < 1e-8 ? width / left : Math.log(right / left) / slope;
    return { end: start + width, expression };
  });
  const mapped = pieces.reduceRight((next, piece) => 'if(lt(T,' + piece.end + '),' + piece.expression + ',' + next + ')', String(elapsed));
  return '(' + mapped + ')/TB';
}
