import { engine, type DemoFeatures } from '../feature-flags';
import { ClientFeatureProvider } from './client-provider';
import { FeatureTogglePanel } from './feature-toggle-panel';

export default async function Page() {
  const evaluationContext = {
    environment: 'production',
    isAuthenticated: false,
    traits: { role: 'guest' },
  };
  const snapshot = await engine.evaluate(evaluationContext);

  return (
    <ClientFeatureProvider
      snapshot={snapshot}
      context={{
        isAuthenticated: evaluationContext.isAuthenticated,
        traits: evaluationContext.traits,
      }}
    >
      <main>
        <h1>Feature Flag Demo</h1>
        <p>New navbar enabled: {snapshot.state.newNavbar ? 'yes' : 'no'}</p>
        <p>Badge placement: {snapshot.state.badgePlacement}</p>
        <p>Animation speed: {snapshot.state.animationSpeedMs}ms</p>
        <FeatureTogglePanel />
      </main>
    </ClientFeatureProvider>
  );
}
