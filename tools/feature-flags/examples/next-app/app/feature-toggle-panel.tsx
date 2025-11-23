'use client';

import { useFeature, useFeatures } from '@skriuw/feature-flags/react';
import type { DemoFeatures } from '../feature-flags';

export function FeatureTogglePanel() {
  const navbar = useFeature<DemoFeatures, 'newNavbar'>('newNavbar');
  const badgePlacement = useFeature<DemoFeatures, 'badgePlacement'>('badgePlacement');
  const animationSpeed = useFeature<DemoFeatures, 'animationSpeedMs'>('animationSpeedMs');
  const { hydrated } = useFeatures<DemoFeatures>();

  return (
    <section>
      <h2>Feature Overrides</h2>
      <p>Hydrated: {hydrated ? 'yes' : 'no'}</p>
      <label>
        <input
          type="checkbox"
          checked={Boolean(navbar.value)}
          onChange={(event) => navbar.set(event.target.checked)}
        />
        Enable new navbar
      </label>
      <label>
        Badge placement
        <select value={badgePlacement.value} onChange={(event) => badgePlacement.set(event.target.value as DemoFeatures['badgePlacement'])}>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label>
        Animation speed (ms)
        <input
          type="number"
          value={animationSpeed.value}
          onChange={(event) => animationSpeed.set(Number(event.target.value))}
        />
      </label>
    </section>
  );
}
