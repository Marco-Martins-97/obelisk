// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';
import { REAL_MS_PER_INGAME_HOUR } from '@obelisk/shared';
import BuildingModal from './components/BuildingModal.jsx';
import { AppRoutes } from './App.jsx';
import { formatRealConclusionTimeHMS, formatRealDurationHMS } from './utils/timeFormat.js';

describe('Stage 3B: Continent Full Page Toggle, Top-Right Sidebar & Team Action Menu', () => {
  beforeEach(() => {
    window.localStorage.clear();

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      imageSmoothingEnabled: false,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const width = Number(this.getAttribute('width')) || 672;
      const height = Number(this.getAttribute('height')) || 672;
      return { left: 0, top: 0, right: width, bottom: height, width, height };
    });

    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('toggles full-size Territory <-> Continent Map, moves timers/units/stockpile up, and keeps Sandbox Dev layers', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    const offlineLink = screen.getByRole('link', { name: 'Offline' });
    const sandboxLink = screen.getByRole('link', { name: 'Sandbox' });
    expect(offlineLink).toHaveAttribute('aria-current', 'page');

    // Offline locks speed at 6x without a speed selector dropdown.
    expect(screen.queryByLabelText('Game Speed')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Fixed Game Speed')).toHaveTextContent('Speed 6x');

    // How-to-Play button opens and closes the Stone Age quick guide dialog.
    fireEvent.click(screen.getByRole('button', { name: 'How to Play' }));
    expect(screen.getByRole('heading', { name: /How to Play/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('heading', { name: /How to Play/i })).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Dev' })).not.toBeInTheDocument();
    expect(screen.getByText('60/250')).toBeInTheDocument();
    expect(screen.getByText('5/10')).toBeInTheDocument();
    expect(screen.getByText('0/10')).toBeInTheDocument();
    expect(screen.getByLabelText('Village survival status')).toHaveTextContent('Healthy');
    expect(screen.queryByRole('button', { name: /Eat \+/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('In-game calendar')).toHaveTextContent(/-?\d+°C/);

    // Small continent panel removed; right sidebar order is Production -> Units -> Active Timers.
    expect(screen.queryByLabelText('Continent Map Canvas')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Territory Map Canvas')).toBeInTheDocument();

    const h3Titles = screen.getAllByRole('heading', { level: 3 }).map((el) => el.textContent);
    expect(h3Titles).toEqual([
      'Production (/day)',
      'Units (Free / Total)',
      'Active Timers (0)',
    ]);

    // Header modal buttons open & close Stockpile, Technologies, and Village Log dialogs cleanly.
    fireEvent.click(screen.getByRole('button', { name: /Technologies \(1\)/i }));
    expect(screen.getByRole('heading', { name: /Unlocked Technologies \(1\)/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('heading', { name: /Unlocked Technologies/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Village Log/i }));
    expect(screen.getByRole('heading', { name: /Village Log/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('heading', { name: /^Village Log/i })).not.toBeInTheDocument();

    // Toggle to full-size Continent Map and back to Territory Map.
    fireEvent.click(screen.getByRole('button', { name: 'Continent Map' }));
    expect(screen.getByLabelText('Continent Map Canvas')).toBeInTheDocument();
    expect(screen.queryByLabelText('Territory Map Canvas')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Territory Map' }));
    expect(screen.getByLabelText('Territory Map Canvas')).toBeInTheDocument();

    // Switch to Sandbox -> Dev controls appear.
    fireEvent.click(sandboxLink);
    expect(screen.getByRole('link', { name: 'Sandbox' })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('button', { name: 'Dev' }));
    expect(screen.getByRole('button', { name: 'Elevation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Temperature' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Moisture' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forest' })).toBeInTheDocument();
    expect(screen.getByLabelText('Unbuildable (60% Red)')).toBeInTheDocument();
    expect(screen.getByText('Ores:')).toBeInTheDocument();
    expect(screen.getByText('tileSeed')).toBeInTheDocument();

    const seedInput = screen.getByLabelText('Seed');
    const initialValue = seedInput.value;
    fireEvent.click(screen.getByRole('button', { name: 'Randomize' }));
    expect(seedInput.value).not.toBe(initialValue);

    // Sandbox cheats: Unlock Map / Unlock Continent, +1 Day / Month / Year, and Grant Resource.
    expect(screen.getByLabelText('In-game calendar')).toHaveTextContent('Y1 M1 D1');
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Continent' }));
    fireEvent.click(screen.getByRole('button', { name: '+1 Day' }));
    expect(screen.getByLabelText('In-game calendar')).toHaveTextContent('Y1 M1 D2');
    fireEvent.click(screen.getByRole('button', { name: '+1 Month' }));
    expect(screen.getByLabelText('In-game calendar')).toHaveTextContent('Y1 M2 D2');
    fireEvent.click(screen.getByRole('button', { name: '+1 Year' }));
    expect(screen.getByLabelText('In-game calendar')).toHaveTextContent('Y2 M2 D2');

    fireEvent.change(screen.getByLabelText('Sandbox resource'), { target: { value: 'copper_ingot' } });
    fireEvent.change(screen.getByLabelText('Sandbox resource amount'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Resource' }));
    fireEvent.click(screen.getByRole('button', { name: /Stockpile/i }));
    fireEvent.click(screen.getByRole('tab', { name: 'Ingots' }));
    expect(screen.getByRole('button', { name: 'Copper Ingot item card' })).toHaveTextContent('Qty: 25');
  });

  it('supports Sandbox 3600x speed, discarding X resources, [Gather - 1 +]/[Hunt - 1 +]/[Team >], Build colors, and real-time timers', () => {
    // 12 in-game mins = 2 real mins at 6x; 10:00:00 + 2m15s -> Conclusion 10:02:15.
    const twelveInGameMinsMs = (12 / 60) * REAL_MS_PER_INGAME_HOUR;
    expect(formatRealDurationHMS(twelveInGameMinsMs, 6)).toBe('00:02:00');
    const wall10am = new Date(2026, 0, 1, 10, 0, 0).getTime();
    expect(formatRealConclusionTimeHMS(135_000, 6, wall10am)).toBe('10:02:15');

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    // Switch to Sandbox to test custom speed controls.
    fireEvent.click(screen.getByRole('link', { name: 'Sandbox' }));
    const speedSelect = screen.getByLabelText('Game Speed');
    fireEvent.change(speedSelect, { target: { value: '3600' } });
    expect(speedSelect.value).toBe('3600');

    // Open Stockpile modal, test category tabs (Food vs Materials vs All), left-click Sticks card, and discard 2 Sticks -> 60/250 -> 56/250.
    fireEvent.click(screen.getByRole('button', { name: /Stockpile \(4\)/i }));
    fireEvent.click(screen.getByRole('tab', { name: 'Food' }));
    expect(screen.getByRole('button', { name: 'Berries item card' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sticks item card' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Materials' }));
    expect(screen.getByRole('button', { name: 'Sticks item card' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Berries item card' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sticks item card' }));
    fireEvent.change(screen.getByLabelText('Remove amount for Sticks'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sticks' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText('56/250')).toBeInTheDocument();

    // Left-click Main (12, 12) -> verify upgrade preview, red missing resource (Straw), and train units.
    const territoryCanvas = screen.getByLabelText('Territory Map Canvas');
    fireEvent.mouseDown(territoryCanvas, { button: 0, clientX: 336, clientY: 336 });
    fireEvent.mouseUp(territoryCanvas, { button: 0, clientX: 336, clientY: 336 });

    expect(screen.getByText('Upgrade to Level 2')).toBeInTheDocument();
    expect(screen.getByText(/Improves:.*\+10 Max Pop/i)).toBeInTheDocument();
    expect(screen.getByText('10 Straw')).toHaveClass('text-rose-400');
    expect(screen.getByText('10 Pelts')).toHaveClass('text-slate-300');
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeDisabled();

    const trainButtons = screen.getAllByRole('button', { name: 'Train +1' });
    fireEvent.click(trainButtons[0]); // Gatherer #1
    fireEvent.click(trainButtons[0]); // Gatherer #2
    fireEvent.click(trainButtons[1]); // Hunter #1
    fireEvent.click(trainButtons[2]); // Builder #1
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Right-click explored adjacent tile (13, 12) -> verify 0/All buttons, Build statuses & [Team >].
    fireEvent.contextMenu(territoryCanvas, { clientX: 408, clientY: 336 });
    expect(screen.getByRole('menu', { name: 'Actions for tile (13, 12)' })).toBeInTheDocument();

    const quickGatherBtn = screen.getByRole('menuitem', { name: 'Gather' });
    expect(quickGatherBtn).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear quick gather count' }));
    expect(quickGatherBtn).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Select all gatherers' }));
    expect(quickGatherBtn).toBeEnabled();

    expect(screen.getByRole('menuitem', { name: 'Hunt' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Prospect Tile/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('menuitem', { name: /Build/i }));
    const firepitBtn = screen.getByRole('button', { name: /^Firepit/i });
    const houseBtn = screen.getByRole('button', { name: /^House/i });
    expect(firepitBtn).toHaveAttribute('data-build-status', 'ready');
    expect(firepitBtn).not.toHaveTextContent(/\b(READY|GREY|RED)\b/i);
    expect(houseBtn).toHaveAttribute('data-build-status', 'grey');
    expect(houseBtn).not.toHaveTextContent(/\b(READY|GREY|RED)\b/i);
    expect(screen.getByRole('button', { name: /^Warehouse/i })).toHaveAttribute('data-build-status', 'grey');
    expect(screen.getByRole('button', { name: /^Drying Rack/i })).toHaveAttribute('data-build-status', 'red');
    expect(screen.getByRole('button', { name: /^Clay Kiln/i })).toHaveAttribute('data-build-status', 'red');

    // Missing House resources (4 Straw) highlight in red inside the inspected footer.
    fireEvent.mouseEnter(houseBtn);
    expect(screen.getByText('4 Straw')).toHaveClass('text-rose-400');

    // Open [Team >], click All on gatherers -> 2G + 1H, Send Team -> h:m:s + Traveling phase.
    fireEvent.click(screen.getByRole('menuitem', { name: /Team/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all team gatherers' }));

    fireEvent.click(screen.getByRole('button', { name: /Send Team \(3 units · 5 km\/h\)/i }));
    expect(screen.getByText('(13, 12)')).toBeInTheDocument();
    expect(screen.getByText('Team (2G+1H)')).toBeInTheDocument();
    expect(screen.getByText(/Conclusion:\s*\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByText(/Traveling\s+\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();

    // Switch to Continent Map and right-click a tile -> Continent Expedition planner modal opens.
    fireEvent.click(screen.getByRole('button', { name: 'Continent Map' }));
    const continentCanvas = screen.getByLabelText('Continent Map Canvas');
    fireEvent.contextMenu(continentCanvas, { clientX: 336, clientY: 336 });
    expect(screen.getByRole('heading', { name: /Continent Expedition/i })).toBeInTheDocument();
    expect(screen.getByText(/Distance:/i)).toBeInTheDocument();
  });

  it('allows crafting batch quantities (qty & Max) and keeps upgrading buildings usable in BuildingModal', () => {
    const onStartCraft = vi.fn();
    const firepit = {
      instanceId: 'fp-1',
      buildingId: 'firepit',
      x: 13,
      y: 12,
      tier: 1,
      level: 1,
      status: 'active',
    };
    const mockState = {
      virtualTimeMs: 1000,
      inventory: { sticks: 5, meat: 3, small_stones: 20 },
      water: 10,
      unlockedTechs: ['wood_tools'],
      craftedCounts: {},
      buildings: [
        { instanceId: 'main-0', buildingId: 'main', x: 12, y: 12, tier: 1, level: 1, status: 'active' },
        firepit,
      ],
      tasks: [
        {
          id: 'upg-1',
          kind: 'upgrade',
          buildingId: 'firepit',
          instanceId: 'fp-1',
          completedAtMs: 5000,
          returnsAtMs: 6000,
        },
      ],
    };

    render(
      <BuildingModal
        building={firepit}
        state={mockState}
        village={null}
        territory={null}
        maxPop={10}
        popUsed={1}
        freeUnits={{ gatherer: 0, hunter: 0, builder: 1 }}
        onClose={vi.fn()}
        onTrainUnit={vi.fn()}
        onUpgradeBuilding={vi.fn()}
        onUpgradeBuildingTier={vi.fn()}
        onChangeMainTier={vi.fn()}
        onStartCraft={onStartCraft}
        onStartResearch={vi.fn()}
      />,
    );

    expect(screen.getByText('Upgrading... (Building remains active)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeDisabled();

    // Missing Fish for Cook Fish appears in red (rose-400), while Salt waterCost appears neutral.
    expect(screen.getByText('1 Raw Fish')).toHaveClass('text-rose-400');
    expect(screen.getByText('10 Water Bowls')).toHaveClass('text-slate-300');

    // Cook Meat takes 1 meat + 1 stick; with 3 meat and 5 sticks, Max sets quantity = 3.
    fireEvent.click(screen.getByRole('button', { name: 'Max quantity for Cook Meat' }));
    const qtyInput = screen.getByLabelText('Quantity for Cook Meat');
    expect(qtyInput.value).toBe('3');

    const craftBtns = screen.getAllByRole('button', { name: 'Craft' });
    fireEvent.click(craftBtns[0]);
    expect(onStartCraft).toHaveBeenCalledWith({
      buildingInstanceId: 'fp-1',
      recipeId: 'cook_meat',
      quantity: 3,
    });
  });
});
