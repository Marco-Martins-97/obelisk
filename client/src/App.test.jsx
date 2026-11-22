// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from './App.jsx';

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

    const onlineLink = screen.getByRole('link', { name: 'Online' });
    const sandboxLink = screen.getByRole('link', { name: 'Sandbox' });
    expect(onlineLink).toHaveAttribute('aria-current', 'page');

    expect(screen.queryByRole('button', { name: 'Dev' })).not.toBeInTheDocument();
    expect(screen.getByText('50/250')).toBeInTheDocument();
    expect(screen.getByText('5/10')).toBeInTheDocument();
    expect(screen.getByText('0/10')).toBeInTheDocument();

    // Small continent panel removed; right sidebar starts directly with Active Timers -> Units -> Stockpile -> Techs.
    expect(screen.queryByLabelText('Continent Map Canvas')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Territory Map Canvas')).toBeInTheDocument();

    const h3Titles = screen.getAllByRole('heading', { level: 3 }).map((el) => el.textContent);
    expect(h3Titles).toEqual([
      'Active Timers (0)',
      'Units (Free / Total)',
      'Stockpile (3 types)',
      'Unlocked Technologies',
      'Village Log',
    ]);

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
  });

  it('supports 3600x speed, discarding X resources, [Gather - 1 +]/[Hunt - 1 +]/[Team >], and Build colors', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    const speedSelect = screen.getByLabelText('Game Speed');
    fireEvent.change(speedSelect, { target: { value: '3600' } });
    expect(speedSelect.value).toBe('3600');

    // Discard 2 Sticks -> 50/250 -> 46/250.
    fireEvent.change(screen.getByLabelText('Remove amount for Sticks'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sticks' }));
    expect(screen.getByText('46/250')).toBeInTheDocument();

    // Left-click Main (12, 12) -> verify Upgrade to Level 2 exists, train 2 Gatherers, 1 Hunter, 1 Builder.
    const territoryCanvas = screen.getByLabelText('Territory Map Canvas');
    fireEvent.mouseDown(territoryCanvas, { button: 0, clientX: 336, clientY: 336 });
    fireEvent.mouseUp(territoryCanvas, { button: 0, clientX: 336, clientY: 336 });

    expect(screen.getByText('Upgrade to Level 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeInTheDocument();

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

    fireEvent.click(screen.getByRole('menuitem', { name: /Build/i }));
    expect(screen.getByRole('button', { name: /Firepit/i })).toHaveAttribute('data-build-status', 'ready');
    expect(screen.getByRole('button', { name: /House/i })).toHaveAttribute('data-build-status', 'grey');
    expect(screen.getByRole('button', { name: /Clay Kiln/i })).toHaveAttribute('data-build-status', 'red');

    // Open [Team >], click All on gatherers -> 2G + 1H, Send Team -> h:m:s + Traveling phase.
    fireEvent.click(screen.getByRole('menuitem', { name: /Team/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all team gatherers' }));

    fireEvent.click(screen.getByRole('button', { name: /Send Team \(3 units · 5 km\/h\)/i }));
    expect(screen.getByText('(13, 12)')).toBeInTheDocument();
    expect(screen.getByText('Team (2G+1H)')).toBeInTheDocument();
    expect(screen.getByText(/Conclusion:\s*\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByText(/Traveling\s+\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
  });
});
