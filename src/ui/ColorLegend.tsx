import { memo } from 'react';

import type { NetworkRequest } from '../network/request-model';

export const COLOR_TONES = [
  ['success', '2xx'],
  ['redirect', '3xx'],
  ['client-error', '4xx'],
  ['server-error', '5xx'],
  ['graphql', 'GraphQL'],
  ['graphql-mutation', 'Mutation'],
  ['graphql-error', 'GraphQL errors'],
  ['slow', 'Slow'],
  ['cached', 'Cached'],
  ['pending', 'Pending'],
  ['failed', 'Failed']
] as const;

export type ColorTone = (typeof COLOR_TONES)[number][0];

export const getRequestColorFilterTones = (request: NetworkRequest): ColorTone[] => {
  const tones: ColorTone[] = [];

  if (request.state === 'pending') tones.push('pending');
  if (request.failed) tones.push('failed');
  if (request.status !== null && request.status >= 500) tones.push('server-error');
  if (request.status !== null && request.status >= 400 && request.status < 500) tones.push('client-error');
  if (request.status !== null && request.status >= 300 && request.status < 400) tones.push('redirect');
  if (request.status !== null && request.status >= 200 && request.status < 300) tones.push('success');
  if (request.graphql) tones.push('graphql');
  if (request.graphql?.operationType === 'mutation') tones.push('graphql-mutation');
  if (request.graphql?.errors?.length) tones.push('graphql-error');
  if (request.tags.includes('slow')) tones.push('slow');
  if (request.cached) tones.push('cached');

  return tones;
};

export const getRequestColorTone = (request: NetworkRequest): ColorTone | undefined => {
  if (request.state === 'pending') return 'pending';
  if (request.failed) return 'failed';
  if (request.graphql?.errors?.length) return 'graphql-error';
  if (request.graphql?.operationType === 'mutation') return 'graphql-mutation';
  if (request.graphql) return 'graphql';
  if (request.status !== null && request.status >= 500) return 'server-error';
  if (request.status !== null && request.status >= 400) return 'client-error';
  if (request.cached) return 'cached';
  if (request.tags.includes('slow')) return 'slow';
  if (request.status !== null && request.status >= 300) return 'redirect';
  if (request.status !== null && request.status >= 200) return 'success';
  return undefined;
};

type ColorLegendProps = {
  selectedTones: ReadonlySet<ColorTone>;
  onToggleTone: (tone: ColorTone) => void;
};

export const ColorLegend = memo(function ColorLegend({ selectedTones, onToggleTone }: ColorLegendProps) {
  return (
    <div className="color-legend" aria-label="Color legend">
      {COLOR_TONES.map(([tone, label]) => (
        <label key={tone} className={`color-chip ${selectedTones.has(tone) ? 'selected' : ''}`}>
          <input type="checkbox" checked={selectedTones.has(tone)} onChange={() => onToggleTone(tone)} />
          <i className={`legend-swatch tone-${tone}`} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
});
