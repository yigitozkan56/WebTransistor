import type {
  CircuitComponent,
  ComponentProps,
  ComponentType,
  PinDef,
  PinSide,
  Point,
} from '../types/circuit';

export interface ComponentDimensions {
  width: number;
  height: number;
}

export type PaletteCategory =
  | 'Silikon & Transistör'
  | 'Direnç & Güç'
  | 'Fiziksel Girdi / Çıktı';

export interface PaletteCatalogItem {
  type: ComponentType;
  name: string;
  shortName: string;
  description: string;
  category: PaletteCategory;
  shortcut?: string;
  defaultProps: ComponentProps;
}

export const PALETTE_CATEGORIES: readonly PaletteCategory[] = [
  'Silikon & Transistör',
  'Direnç & Güç',
  'Fiziksel Girdi / Çıktı',
] as const;

export const PALETTE_CATALOG: readonly PaletteCatalogItem[] = [
  {
    type: 'NMOS',
    name: 'NMOS Transistör',
    shortName: 'NMOS',
    description: 'N-Tipi MOSFET — Gate HIGH (1) olduğunda Drain ve Source bacaklarını birbirine bağlar.',
    category: 'Silikon & Transistör',
    shortcut: '1',
    defaultProps: {},
  },
  {
    type: 'PMOS',
    name: 'PMOS Transistör',
    shortName: 'PMOS',
    description: 'P-Tipi MOSFET — Gate LOW (0) olduğunda Source ve Drain bacaklarını birbirine bağlar.',
    category: 'Silikon & Transistör',
    shortcut: '2',
    defaultProps: {},
  },
  {
    type: 'PULL_UP',
    name: 'Pull-Up Direnci',
    shortName: 'PU',
    description: 'Hattı zayıf 1 (WEAK_HIGH) seviyesine çeker; açık devre ve NMOS lojik için kullanılır.',
    category: 'Direnç & Güç',
    shortcut: '3',
    defaultProps: {},
  },
  {
    type: 'PULL_DOWN',
    name: 'Pull-Down Direnci',
    shortName: 'PD',
    description: 'Hattı zayıf 0 (WEAK_LOW) seviyesine çeker; boşta kalan düğümleri toprağa yaklaştırır.',
    category: 'Direnç & Güç',
    shortcut: '4',
    defaultProps: {},
  },
  {
    type: 'VCC',
    name: 'VCC (Güç +1)',
    shortName: 'VCC',
    description: 'Sabit, güçlü Logic 1 (VDD) besleme kaynağı.',
    category: 'Direnç & Güç',
    shortcut: '5',
    defaultProps: {},
  },
  {
    type: 'GND',
    name: 'GND (Toprak 0)',
    shortName: 'GND',
    description: 'Sabit, güçlü Logic 0 (VSS) toprak referansı.',
    category: 'Direnç & Güç',
    shortcut: '6',
    defaultProps: {},
  },
  {
    type: 'TOGGLE_SWITCH',
    name: 'Mekanik Anahtar (Switch)',
    shortName: 'SW',
    description: 'Tıklandığında veya klavye tuşuyla açılıp kapanan fiziksel 0/1 anahtar.',
    category: 'Fiziksel Girdi / Çıktı',
    shortcut: '7',
    defaultProps: { state: false },
  },
  {
    type: 'PUSH_BUTTON',
    name: 'Mekanik Buton (Push Button)',
    shortName: 'BTN',
    description: 'Basılı tutulduğu (veya bağlı klavye tuşuna basıldığı) sürece 1 ileten yaylı buton.',
    category: 'Fiziksel Girdi / Çıktı',
    shortcut: '8',
    defaultProps: { state: false },
  },
  {
    type: 'LED',
    name: 'Tekil LED Noktası',
    shortName: 'LED',
    description: 'Bacağına akım (HIGH) geldiğinde parlayan fiziksel ışık diyotu.',
    category: 'Fiziksel Girdi / Çıktı',
    shortcut: '9',
    defaultProps: { color: 'cyan' },
  },
  {
    type: 'PIXEL_MATRIX',
    name: 'Ham Piksel Matrisi',
    shortName: 'MAT',
    description: 'Sürücüsüz saf LED matrisi (4×4 veya 8×8). Her pikselin doğrudan fiziksel P_y_x giriş bacağı vardır.',
    category: 'Fiziksel Girdi / Çıktı',
    shortcut: '0',
    defaultProps: { matrixSize: 4, color: 'cyan' },
  },
] as const;

function normZero(n: number): number {
  return n === 0 ? 0 : n;
}

/** Returns the matrix resolution (4 for 4x4 = 16 pins, 8 for 8x8 = 64 pins). */
export function getPixelMatrixSize(comp: CircuitComponent): 4 | 8 {
  return comp.props.matrixSize === 8 ? 8 : 4;
}

/**
 * Returns unrotated component bounding dimensions `{ width, height }`.
 * Every width and height is guaranteed to be a multiple of 40 (2 * GRID_SIZE)
 * so edge pins aligned to 20px steps always land on exact grid intersections.
 */
export function getComponentDimensions(comp: CircuitComponent): ComponentDimensions {
  switch (comp.type) {
    case 'NMOS':
    case 'PMOS':
    case 'VCC':
    case 'GND':
    case 'PULL_UP':
    case 'PULL_DOWN':
    case 'LED':
      return { width: 40, height: 40 };

    case 'TOGGLE_SWITCH':
    case 'PUSH_BUTTON':
      return { width: 80, height: 40 };

    case 'PIXEL_MATRIX': {
      const size = getPixelMatrixSize(comp);
      // 4x4 has 16 pins (4 per side) -> 160x160; 8x8 has 64 pins (16 per side) -> 360x360.
      // Both are exact multiples of 40.
      return size === 8 ? { width: 360, height: 360 } : { width: 160, height: 160 };
    }
  }
}

/**
 * Returns unrotated local pins for a component.
 * Every pin offsetX and offsetY is guaranteed to be an exact multiple of 20 (GRID_SIZE).
 */
export function getComponentPins(comp: CircuitComponent): PinDef[] {
  switch (comp.type) {
    case 'NMOS':
      return [
        { id: 'G', label: 'G', side: 'left', offsetX: -20, offsetY: 0, role: 'input' },
        { id: 'D', label: 'D', side: 'top', offsetX: 0, offsetY: -20, role: 'bidirectional' },
        { id: 'S', label: 'S', side: 'bottom', offsetX: 0, offsetY: 20, role: 'bidirectional' },
      ];

    case 'PMOS':
      return [
        { id: 'G', label: 'G', side: 'left', offsetX: -20, offsetY: 0, role: 'input' },
        { id: 'S', label: 'S', side: 'top', offsetX: 0, offsetY: -20, role: 'bidirectional' },
        { id: 'D', label: 'D', side: 'bottom', offsetX: 0, offsetY: 20, role: 'bidirectional' },
      ];

    case 'VCC':
      return [
        { id: 'OUT', label: 'OUT', side: 'bottom', offsetX: 0, offsetY: 20, role: 'power' },
      ];

    case 'GND':
      return [
        { id: 'OUT', label: 'OUT', side: 'top', offsetX: 0, offsetY: -20, role: 'power' },
      ];

    case 'PULL_UP':
      return [
        { id: 'OUT', label: 'OUT', side: 'bottom', offsetX: 0, offsetY: 20, role: 'power' },
      ];

    case 'PULL_DOWN':
      return [
        { id: 'OUT', label: 'OUT', side: 'top', offsetX: 0, offsetY: -20, role: 'power' },
      ];

    case 'TOGGLE_SWITCH':
      return [
        { id: 'OUT', label: 'OUT', side: 'right', offsetX: 40, offsetY: 0, role: 'output' },
      ];

    case 'PUSH_BUTTON':
      return [
        { id: 'OUT', label: 'OUT', side: 'right', offsetX: 40, offsetY: 0, role: 'output' },
      ];

    case 'LED':
      return [
        { id: 'IN', label: 'IN', side: 'left', offsetX: -20, offsetY: 0, role: 'input' },
      ];

    case 'PIXEL_MATRIX': {
      const size = getPixelMatrixSize(comp);
      const { width, height } = getComponentDimensions(comp);
      const halfW = width / 2;
      const halfH = height / 2;
      const totalPins = size * size;
      const pinsPerSide = totalPins / 4; // 4 for 4x4, 16 for 8x8
      const startOffset = -(pinsPerSide / 2) * 20; // -40 for 4x4, -160 for 8x8
      const pins: PinDef[] = [];

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = y * size + x;
          const sideIdx = Math.floor(idx / pinsPerSide);
          const slot = idx % pinsPerSide;
          const pos = normZero(startOffset + slot * 20);
          const id = `P_${y}_${x}`;

          if (sideIdx === 0) {
            pins.push({
              id,
              label: id,
              side: 'left',
              offsetX: -halfW,
              offsetY: pos,
              role: 'input',
            });
          } else if (sideIdx === 1) {
            pins.push({
              id,
              label: id,
              side: 'bottom',
              offsetX: pos,
              offsetY: halfH,
              role: 'input',
            });
          } else if (sideIdx === 2) {
            pins.push({
              id,
              label: id,
              side: 'right',
              offsetX: halfW,
              offsetY: pos,
              role: 'input',
            });
          } else {
            pins.push({
              id,
              label: id,
              side: 'top',
              offsetX: pos,
              offsetY: -halfH,
              role: 'input',
            });
          }
        }
      }

      return pins;
    }
  }
}

/** Rotates a local offset vector clockwise by 0, 90, 180, or 270 degrees (y-down canvas space). */
export function rotateOffset(
  offsetX: number,
  offsetY: number,
  rotation: 0 | 90 | 180 | 270,
): Point {
  switch (rotation) {
    case 0:
      return { x: normZero(offsetX), y: normZero(offsetY) };
    case 90:
      return { x: normZero(-offsetY), y: normZero(offsetX) };
    case 180:
      return { x: normZero(-offsetX), y: normZero(-offsetY) };
    case 270:
      return { x: normZero(offsetY), y: normZero(-offsetX) };
  }
}

/** Rotates a pin side clockwise by 0, 90, 180, or 270 degrees. */
export function rotateSide(side: PinSide, rotation: 0 | 90 | 180 | 270): PinSide {
  const order: readonly PinSide[] = ['top', 'right', 'bottom', 'left'];
  const idx = order.indexOf(side);
  const steps = rotation / 90;
  return order[(idx + steps) % 4];
}

/** Computes world coordinates of a component's pin taking rotation into account. */
export function getPinWorldPosition(comp: CircuitComponent, pin: PinDef): Point {
  const rotated = rotateOffset(pin.offsetX, pin.offsetY, comp.rotation);
  return {
    x: normZero(comp.x + rotated.x),
    y: normZero(comp.y + rotated.y),
  };
}
