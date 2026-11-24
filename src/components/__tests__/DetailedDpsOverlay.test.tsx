// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SimulationEngine } from '../../core/SimulationEngine';
import { YamaEncounter } from '../../encounters/yamaP3/YamaEncounter';
import type { Coordinate } from '../../types/simulation';
import { DetailedDpsOverlay } from '../DetailedDpsOverlay';

const PLAYER_POSITION: Coordinate = [31, 33];
const TARGET_ID = 'yama';

afterEach(cleanup);

function renderOverlay(engine: SimulationEngine, showDetails?: boolean) {
  return render(
    <DetailedDpsOverlay engine={engine} simulationState={engine.getState()} visible showDetails={showDetails} />,
  );
}

function targetedEngine(): SimulationEngine {
  const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: PLAYER_POSITION });
  engine.setAttackTarget(TARGET_ID);
  return engine;
}

describe('DetailedDpsOverlay Detailed DPS option', () => {
  it('uses the recorded projection when the live engine target is already dead', () => {
    const engine = targetedEngine();
    const simulationState = structuredClone(engine.getState());
    const recorded = engine.getAdjustedTheoreticalDps();
    if (!recorded) throw new TypeError('Expected supported recorded attack');
    engine.setBossHp(0);

    const view = render(
      <DetailedDpsOverlay engine={engine} simulationState={simulationState} dpsProjection={recorded} visible />,
    );

    expect(view.container.querySelector('.detailed-dps__value')?.textContent).toBe(recorded.dps.toFixed(3));
  });

  it('does not substitute live DPS when a recording has no projection', () => {
    const engine = targetedEngine();

    const view = render(
      <DetailedDpsOverlay engine={engine} simulationState={engine.getState()} dpsProjection={null} visible />,
    );

    expect(view.container.querySelector('.detailed-dps__value')).toBeNull();
  });

  it('shows only the caption and the DPS hero by default', () => {
    const engine = targetedEngine();

    const view = renderOverlay(engine);

    expect(engine.getAdjustedTheoreticalDps()).not.toBeNull();
    expect(view.container.querySelector('.detailed-dps__title')?.textContent).toBe('DPS');
    expect(view.container.querySelector('.detailed-dps__value')).not.toBeNull();
    expect(view.container.querySelector('.detailed-dps__formula')).not.toBeNull();
    expect(view.container.querySelector('.detailed-dps__rows')).toBeNull();
    expect(view.container.querySelector('.detailed-dps__breakdown')).toBeNull();
  });

  it('adds the stat rows under the hero once details are on', () => {
    const view = renderOverlay(targetedEngine(), true);

    expect(view.container.querySelector('.detailed-dps__value')).not.toBeNull();
    const labels = Array.from(view.container.querySelectorAll('.detailed-dps__rows dt'), (dt) => dt.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Style', 'Accuracy', 'Max hit', 'Attack roll', 'Defence roll']));
  });

  it('keeps the hit breakdown behind the option for a multi-hit attack', () => {
    const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: PLAYER_POSITION });
    engine.setEquipment({ weapon: 28997 });
    engine.setAttackTarget(TARGET_ID);

    const view = renderOverlay(engine);

    expect(engine.getAdjustedTheoreticalDps()?.hits.length).toBeGreaterThan(1);
    expect(view.container.querySelector('.detailed-dps__breakdown')).toBeNull();
  });

  it('follows the option across rerenders without touching the hero', () => {
    const engine = targetedEngine();
    const view = renderOverlay(engine);
    const heroBefore = view.container.querySelector('.detailed-dps__value')?.textContent;

    view.rerender(<DetailedDpsOverlay engine={engine} simulationState={engine.getState()} visible showDetails />);
    expect(view.container.querySelector('.detailed-dps__rows')).not.toBeNull();

    view.rerender(
      <DetailedDpsOverlay engine={engine} simulationState={engine.getState()} visible showDetails={false} />,
    );
    expect(view.container.querySelector('.detailed-dps__rows')).toBeNull();
    expect(view.container.querySelector('.detailed-dps__value')?.textContent).toBe(heroBefore);
  });
});

describe('DetailedDpsOverlay hit breakdown', () => {
  it('omits the breakdown for an ordinary single-hit attack', () => {
    const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: PLAYER_POSITION });
    engine.setAttackTarget(TARGET_ID);

    const view = renderOverlay(engine, true);

    expect(engine.getAdjustedTheoreticalDps()?.hits).toHaveLength(1);
    expect(view.container.querySelector('.detailed-dps__breakdown')).toBeNull();
  });

  it('shows the breakdown for a multi-hit attack', () => {
    const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: PLAYER_POSITION });
    engine.setEquipment({ weapon: 28997 });
    engine.setAttackTarget(TARGET_ID);

    const view = renderOverlay(engine, true);

    expect(engine.getAdjustedTheoreticalDps()?.hits.length).toBeGreaterThan(1);
    expect(view.container.querySelector('.detailed-dps__breakdown')).not.toBeNull();
  });
});
