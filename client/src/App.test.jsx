// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from './App.jsx';

describe('Stage 2: Map Viewport UI (Gameplay & Dev Views)', () => {
  beforeEach(() => {
    // Stub 2D canvas context in jsdom so canvas draw effects execute cleanly.
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
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('defaults to Gameplay view and reveals Dev layers + tileSeed when switching to Dev view', () => {
    render(<App />);

    const gameplayBtn = screen.getByRole('button', { name: 'Gameplay' });
    const devBtn = screen.getByRole('button', { name: 'Dev' });

    expect(gameplayBtn).toHaveAttribute('aria-pressed', 'true');
    expect(devBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Elevation' })).not.toBeInTheDocument();

    fireEvent.click(devBtn);

    expect(devBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Elevation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Temperature' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Moisture' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forest' })).toBeInTheDocument();
    expect(screen.getByLabelText('Unbuildable (60% Red)')).toBeInTheDocument();
    expect(screen.getByText('Ores:')).toBeInTheDocument();
    expect(screen.getByText('tileSeed')).toBeInTheDocument();
  });

  it('updates world seed when clicking Randomize', () => {
    render(<App />);
    const seedInput = screen.getByLabelText('Seed');
    const initialValue = seedInput.value;

    fireEvent.click(screen.getByRole('button', { name: 'Randomize' }));
    expect(seedInput.value).not.toBe(initialValue);
  });
});
