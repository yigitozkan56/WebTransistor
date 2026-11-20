import type { CircuitDocument } from '../types/circuit';
import { getComponentPins } from './componentDefs';

export interface CompiledDynamicSource {
  compId: string;
  kind: 'TOGGLE_SWITCH' | 'PUSH_BUTTON';
  netId: number;
  initialState: boolean;
}

export interface CompiledCircuit {
  netCount: number;
  islandCount: number;
  transistorCount: number;

  pinToNet: Map<string, number>;
  wireToNet: Map<string, number>;
  compToTxIndex: Map<string, number>;

  // Data-Oriented Design Structure-of-Arrays (SoA) transistor topology
  txGateNode: Int32Array;
  txDrainNode: Int32Array;
  txSourceNode: Int32Array;
  txType: Uint8Array; // 0 = NMOS, 1 = PMOS
  txToIsland: Int32Array; // islandId >= 0, or -1 if rail-bridge

  // Flat GPU buffers for zero-copy upload to WebGPU GPUBuffer or Tauri Rust wgpu
  gpuTransistorBuffer: Uint32Array; // stride 4: [gate_node_id, drain_node_id, source_node_id, type]
  gpuNodeStaticMaskBuffer: Uint32Array; // per-node static pull/rail mask

  staticDriveMask: Uint8Array;
  isRailNet: Uint8Array;
  netToIsland: Int32Array;

  // Island -> non-rail nets (CSR)
  islandNetOffsets: Int32Array;
  islandNetIds: Int32Array;

  // Island -> all transistor SoA indices in that island (CSR)
  islandTxOffsets: Int32Array;
  islandTxIds: Int32Array;

  // Island -> internal non-rail transistors (CSR)
  islandIntTxOffsets: Int32Array;
  intTxIdx: Int32Array;
  intTxIsPmos: Uint8Array;
  intTxGateNet: Int32Array;
  intTxNetA: Int32Array;
  intTxNetB: Int32Array;

  // Island -> rail-attached transistors (CSR)
  islandRailTxOffsets: Int32Array;
  railTxIdx: Int32Array;
  railTxIsPmos: Uint8Array;
  railTxGateNet: Int32Array;
  railTxNonRailNet: Int32Array;
  railTxRailNet: Int32Array;

  // Direct rail-to-rail transistors (e.g., VCC shorted to GND via MOSFET)
  railBridgeCount: number;
  railBridgeTxIdx: Int32Array;
  railBridgeIsPmos: Uint8Array;
  railBridgeGateNet: Int32Array;
  railBridgeNetA: Int32Array;
  railBridgeNetB: Int32Array;

  // gateNet -> affected transistor SoA indices (CSR)
  gateNetTxOffsets: Int32Array;
  gateNetTxIds: Int32Array;

  // gateNet -> affected island IDs (CSR)
  gateNetIslandOffsets: Int32Array;
  gateNetIslandIds: Int32Array;

  // railNet -> affected island IDs (CSR)
  railNetIslandOffsets: Int32Array;
  railNetIslandIds: Int32Array;

  dynamicSources: CompiledDynamicSource[];
}

function findRoot(parent: Int32Array, x: number): number {
  let r = x;
  while (parent[r] !== r) {
    parent[r] = parent[parent[r]];
    r = parent[r];
  }
  return r;
}

function unionNodes(parent: Int32Array, rank: Uint8Array, a: number, b: number): void {
  const ra = findRoot(parent, a);
  const rb = findRoot(parent, b);
  if (ra === rb) return;
  if (rank[ra] < rank[rb]) {
    parent[ra] = rb;
  } else if (rank[ra] > rank[rb]) {
    parent[rb] = ra;
  } else {
    parent[rb] = ra;
    rank[ra]++;
  }
}

/**
 * Compiles a flat PureSilicon CircuitDocument into Data-Oriented Structure-of-Arrays (SoA)
 * buffers and Switch-Island CSR adjacency tables for 1,000,000+ transistor simulation.
 */
export function compileCircuit(doc: CircuitDocument): CompiledCircuit {
  const components = doc.components;
  const wires = doc.wires;
  const compCount = components.length;

  let txCount = 0;
  let staticDriveCap = 0;
  let dynamicSourceCap = 0;

  for (let i = 0; i < compCount; i++) {
    const t = components[i].type;
    if (t === 'NMOS' || t === 'PMOS') {
      txCount++;
    } else if (t === 'VCC' || t === 'GND' || t === 'PULL_UP' || t === 'PULL_DOWN') {
      staticDriveCap++;
    } else if (t === 'TOGGLE_SWITCH' || t === 'PUSH_BUTTON') {
      dynamicSourceCap++;
    }
  }

  const pinKeys: string[] = [];
  const pinKeyToIdx = new Map<string, number>();

  const registerPin = (key: string): number => {
    const existing = pinKeyToIdx.get(key);
    if (existing !== undefined) return existing;
    const idx = pinKeys.length;
    pinKeys.push(key);
    pinKeyToIdx.set(key, idx);
    return idx;
  };

  // Pre-allocated SoA transistor buffers (initially holding pin indices before net resolution)
  const txGateNode = new Int32Array(txCount);
  const txDrainNode = new Int32Array(txCount);
  const txSourceNode = new Int32Array(txCount);
  const txType = new Uint8Array(txCount);
  const compToTxIndex = new Map<string, number>();

  // Flat static drive arrays
  const staticDrivePinIdx = new Int32Array(staticDriveCap);
  const staticDriveMasks = new Uint8Array(staticDriveCap);
  const staticDriveIsRail = new Uint8Array(staticDriveCap);
  let staticDriveCount = 0;

  // Dynamic source specs
  const rawDynamicPinIdx = new Int32Array(dynamicSourceCap);
  const rawDynamicSpecs: Array<{
    compId: string;
    kind: 'TOGGLE_SWITCH' | 'PUSH_BUTTON';
    initialState: boolean;
  }> = [];

  let txCursor = 0;

  for (let i = 0; i < compCount; i++) {
    const comp = components[i];
    const cid = comp.id;

    switch (comp.type) {
      case 'NMOS': {
        const gPin = registerPin(`${cid}:G`);
        const dPin = registerPin(`${cid}:D`);
        const sPin = registerPin(`${cid}:S`);
        txGateNode[txCursor] = gPin;
        txDrainNode[txCursor] = dPin;
        txSourceNode[txCursor] = sPin;
        txType[txCursor] = 0;
        compToTxIndex.set(cid, txCursor);
        txCursor++;
        break;
      }

      case 'PMOS': {
        const gPin = registerPin(`${cid}:G`);
        const sPin = registerPin(`${cid}:S`);
        const dPin = registerPin(`${cid}:D`);
        txGateNode[txCursor] = gPin;
        txDrainNode[txCursor] = dPin;
        txSourceNode[txCursor] = sPin;
        txType[txCursor] = 1;
        compToTxIndex.set(cid, txCursor);
        txCursor++;
        break;
      }

      case 'VCC': {
        const pIdx = registerPin(`${cid}:OUT`);
        staticDrivePinIdx[staticDriveCount] = pIdx;
        staticDriveMasks[staticDriveCount] = 2;
        staticDriveIsRail[staticDriveCount] = 1;
        staticDriveCount++;
        break;
      }

      case 'GND': {
        const pIdx = registerPin(`${cid}:OUT`);
        staticDrivePinIdx[staticDriveCount] = pIdx;
        staticDriveMasks[staticDriveCount] = 1;
        staticDriveIsRail[staticDriveCount] = 1;
        staticDriveCount++;
        break;
      }

      case 'PULL_UP': {
        const pIdx = registerPin(`${cid}:OUT`);
        staticDrivePinIdx[staticDriveCount] = pIdx;
        staticDriveMasks[staticDriveCount] = 8;
        staticDriveIsRail[staticDriveCount] = 0;
        staticDriveCount++;
        break;
      }

      case 'PULL_DOWN': {
        const pIdx = registerPin(`${cid}:OUT`);
        staticDrivePinIdx[staticDriveCount] = pIdx;
        staticDriveMasks[staticDriveCount] = 4;
        staticDriveIsRail[staticDriveCount] = 0;
        staticDriveCount++;
        break;
      }

      case 'TOGGLE_SWITCH':
      case 'PUSH_BUTTON': {
        const pIdx = registerPin(`${cid}:OUT`);
        rawDynamicPinIdx[rawDynamicSpecs.length] = pIdx;
        rawDynamicSpecs.push({
          compId: cid,
          kind: comp.type,
          initialState: Boolean(comp.props.state),
        });
        break;
      }

      case 'LED': {
        registerPin(`${cid}:IN`);
        break;
      }

      case 'PIXEL_MATRIX': {
        const pins = getComponentPins(comp);
        for (let p = 0; p < pins.length; p++) {
          registerPin(`${cid}:${pins[p].id}`);
        }
        break;
      }
    }
  }

  const pinCount = pinKeys.length;
  const pinParent = new Int32Array(pinCount);
  const pinRank = new Uint8Array(pinCount);
  for (let i = 0; i < pinCount; i++) pinParent[i] = i;

  const wireCount = wires.length;
  const wirePinIndex = new Int32Array(wireCount);
  wirePinIndex.fill(-1);

  for (let i = 0; i < wireCount; i++) {
    const w = wires[i];
    const a = pinKeyToIdx.get(`${w.from.componentId}:${w.from.pinId}`);
    const b = pinKeyToIdx.get(`${w.to.componentId}:${w.to.pinId}`);
    if (a !== undefined && b !== undefined) {
      unionNodes(pinParent, pinRank, a, b);
      wirePinIndex[i] = a;
    } else if (a !== undefined) {
      wirePinIndex[i] = a;
    } else if (b !== undefined) {
      wirePinIndex[i] = b;
    }
  }

  const rootToNet = new Int32Array(pinCount);
  rootToNet.fill(-1);
  const pinIdxToNet = new Int32Array(pinCount);
  let netCount = 0;

  const pinToNet = new Map<string, number>();
  for (let i = 0; i < pinCount; i++) {
    const r = findRoot(pinParent, i);
    let netId = rootToNet[r];
    if (netId === -1) {
      netId = netCount++;
      rootToNet[r] = netId;
    }
    pinIdxToNet[i] = netId;
    pinToNet.set(pinKeys[i], netId);
  }

  const wireToNet = new Map<string, number>();
  for (let i = 0; i < wireCount; i++) {
    const pIdx = wirePinIndex[i];
    if (pIdx >= 0) {
      wireToNet.set(wires[i].id, pinIdxToNet[pIdx]);
    }
  }

  // Translate SoA transistor node arrays from pinIdx -> netId in place and pack GPU TransistorBuffer
  const gpuTransistorBuffer = new Uint32Array(txCount * 4);
  for (let tx = 0; tx < txCount; tx++) {
    const gNet = pinIdxToNet[txGateNode[tx]];
    const dNet = pinIdxToNet[txDrainNode[tx]];
    const sNet = pinIdxToNet[txSourceNode[tx]];
    txGateNode[tx] = gNet;
    txDrainNode[tx] = dNet;
    txSourceNode[tx] = sNet;

    const base = tx << 2;
    gpuTransistorBuffer[base] = gNet >>> 0;
    gpuTransistorBuffer[base + 1] = dNet >>> 0;
    gpuTransistorBuffer[base + 2] = sNet >>> 0;
    gpuTransistorBuffer[base + 3] = txType[tx];
  }

  const staticDriveMask = new Uint8Array(netCount);
  const gpuNodeStaticMaskBuffer = new Uint32Array(netCount);
  const isRailNet = new Uint8Array(netCount);
  for (let i = 0; i < staticDriveCount; i++) {
    const netId = pinIdxToNet[staticDrivePinIdx[i]];
    const nextMask = staticDriveMask[netId] | staticDriveMasks[i];
    staticDriveMask[netId] = nextMask;
    gpuNodeStaticMaskBuffer[netId] = nextMask;
    if (staticDriveIsRail[i] === 1) {
      isRailNet[netId] = 1;
    }
  }

  // Partition transistors into Switch Islands (merging across non-rail Drain/Source nets)
  const netUfParent = new Int32Array(netCount);
  const netUfRank = new Uint8Array(netCount);
  const netHasTx = new Uint8Array(netCount);
  for (let n = 0; n < netCount; n++) netUfParent[n] = n;

  // 0 = internal (non-rail to non-rail), 1 = rail-attached, 2 = rail-bridge
  const txKind = new Uint8Array(txCount);
  let internalTxCount = 0;
  let railTxCount = 0;
  let railBridgeCount = 0;

  for (let tx = 0; tx < txCount; tx++) {
    const dNet = txDrainNode[tx];
    const sNet = txSourceNode[tx];
    const dRail = isRailNet[dNet] === 1;
    const sRail = isRailNet[sNet] === 1;

    if (dRail && sRail) {
      txKind[tx] = 2;
      railBridgeCount++;
    } else if (!dRail && !sRail) {
      txKind[tx] = 0;
      internalTxCount++;
      netHasTx[dNet] = 1;
      netHasTx[sNet] = 1;
      unionNodes(netUfParent, netUfRank, dNet, sNet);
    } else {
      txKind[tx] = 1;
      railTxCount++;
      const nonRailNet = dRail ? sNet : dNet;
      netHasTx[nonRailNet] = 1;
    }
  }

  const netRootToIsland = new Int32Array(netCount);
  netRootToIsland.fill(-1);
  const netToIsland = new Int32Array(netCount);
  netToIsland.fill(-1);

  let islandCount = 0;
  for (let n = 0; n < netCount; n++) {
    if (netHasTx[n] === 0) continue;
    const r = findRoot(netUfParent, n);
    let isl = netRootToIsland[r];
    if (isl === -1) {
      isl = islandCount++;
      netRootToIsland[r] = isl;
    }
    netToIsland[n] = isl;
  }

  // Build Island -> non-rail nets CSR
  const islandNetCounts = new Int32Array(islandCount);
  let totalIslandNets = 0;
  for (let n = 0; n < netCount; n++) {
    const isl = netToIsland[n];
    if (isl >= 0) {
      islandNetCounts[isl]++;
      totalIslandNets++;
    }
  }
  const islandNetOffsets = new Int32Array(islandCount + 1);
  for (let isl = 0; isl < islandCount; isl++) {
    islandNetOffsets[isl + 1] = islandNetOffsets[isl] + islandNetCounts[isl];
  }
  const islandNetIds = new Int32Array(totalIslandNets);
  const netCursor = new Int32Array(islandNetOffsets);
  for (let n = 0; n < netCount; n++) {
    const isl = netToIsland[n];
    if (isl >= 0) {
      islandNetIds[netCursor[isl]++] = n;
    }
  }

  // Map each transistor to its island and count per-island CSR sizes
  const txToIsland = new Int32Array(txCount);
  txToIsland.fill(-1);

  const islandTxCounts = new Int32Array(islandCount);
  const islandIntTxCounts = new Int32Array(islandCount);
  const islandRailTxCounts = new Int32Array(islandCount);

  for (let tx = 0; tx < txCount; tx++) {
    const kind = txKind[tx];
    if (kind === 0) {
      const isl = netToIsland[txDrainNode[tx]];
      txToIsland[tx] = isl;
      islandTxCounts[isl]++;
      islandIntTxCounts[isl]++;
    } else if (kind === 1) {
      const dNet = txDrainNode[tx];
      const sNet = txSourceNode[tx];
      const nonRailNet = isRailNet[dNet] === 1 ? sNet : dNet;
      const isl = netToIsland[nonRailNet];
      txToIsland[tx] = isl;
      islandTxCounts[isl]++;
      islandRailTxCounts[isl]++;
    }
  }

  const islandTxOffsets = new Int32Array(islandCount + 1);
  const islandIntTxOffsets = new Int32Array(islandCount + 1);
  const islandRailTxOffsets = new Int32Array(islandCount + 1);
  for (let isl = 0; isl < islandCount; isl++) {
    islandTxOffsets[isl + 1] = islandTxOffsets[isl] + islandTxCounts[isl];
    islandIntTxOffsets[isl + 1] = islandIntTxOffsets[isl] + islandIntTxCounts[isl];
    islandRailTxOffsets[isl + 1] = islandRailTxOffsets[isl] + islandRailTxCounts[isl];
  }

  const islandTxIds = new Int32Array(islandTxOffsets[islandCount]);
  const islandTxCursor = new Int32Array(islandTxOffsets);

  const intTxIdx = new Int32Array(internalTxCount);
  const intTxIsPmos = new Uint8Array(internalTxCount);
  const intTxGateNet = new Int32Array(internalTxCount);
  const intTxNetA = new Int32Array(internalTxCount);
  const intTxNetB = new Int32Array(internalTxCount);
  const intTxCursor = new Int32Array(islandIntTxOffsets);

  const railTxIdx = new Int32Array(railTxCount);
  const railTxIsPmos = new Uint8Array(railTxCount);
  const railTxGateNet = new Int32Array(railTxCount);
  const railTxNonRailNet = new Int32Array(railTxCount);
  const railTxRailNet = new Int32Array(railTxCount);
  const railTxCursor = new Int32Array(islandRailTxOffsets);

  const railBridgeTxIdx = new Int32Array(railBridgeCount);
  const railBridgeIsPmos = new Uint8Array(railBridgeCount);
  const railBridgeGateNet = new Int32Array(railBridgeCount);
  const railBridgeNetA = new Int32Array(railBridgeCount);
  const railBridgeNetB = new Int32Array(railBridgeCount);
  let rbCursor = 0;

  for (let tx = 0; tx < txCount; tx++) {
    const kind = txKind[tx];
    const gNet = txGateNode[tx];
    const dNet = txDrainNode[tx];
    const sNet = txSourceNode[tx];
    const pmos = txType[tx];

    if (kind === 0) {
      const isl = txToIsland[tx];
      islandTxIds[islandTxCursor[isl]++] = tx;
      const idx = intTxCursor[isl]++;
      intTxIdx[idx] = tx;
      intTxIsPmos[idx] = pmos;
      intTxGateNet[idx] = gNet;
      intTxNetA[idx] = dNet;
      intTxNetB[idx] = sNet;
    } else if (kind === 1) {
      const isl = txToIsland[tx];
      islandTxIds[islandTxCursor[isl]++] = tx;
      const dRail = isRailNet[dNet] === 1;
      const nonRailNet = dRail ? sNet : dNet;
      const railNet = dRail ? dNet : sNet;
      const idx = railTxCursor[isl]++;
      railTxIdx[idx] = tx;
      railTxIsPmos[idx] = pmos;
      railTxGateNet[idx] = gNet;
      railTxNonRailNet[idx] = nonRailNet;
      railTxRailNet[idx] = railNet;
    } else {
      const idx = rbCursor++;
      railBridgeTxIdx[idx] = tx;
      railBridgeIsPmos[idx] = pmos;
      railBridgeGateNet[idx] = gNet;
      railBridgeNetA[idx] = dNet;
      railBridgeNetB[idx] = sNet;
    }
  }

  // Build gateNet -> transistor SoA indices CSR (zero object allocations)
  const gateTxCounts = new Int32Array(netCount);
  for (let tx = 0; tx < txCount; tx++) {
    const g = txGateNode[tx];
    if (g >= 0) gateTxCounts[g]++;
  }
  const gateNetTxOffsets = new Int32Array(netCount + 1);
  for (let n = 0; n < netCount; n++) {
    gateNetTxOffsets[n + 1] = gateNetTxOffsets[n] + gateTxCounts[n];
  }
  const gateNetTxIds = new Int32Array(gateNetTxOffsets[netCount]);
  const gateTxCursor = new Int32Array(gateNetTxOffsets);
  for (let tx = 0; tx < txCount; tx++) {
    const g = txGateNode[tx];
    if (g >= 0) {
      gateNetTxIds[gateTxCursor[g]++] = tx;
    }
  }

  // Build gateNet -> unique islandIds CSR using flat Int32Array stamp deduplication
  const gateIslCounts = new Int32Array(netCount);
  const lastSeenIsland = new Int32Array(netCount);
  lastSeenIsland.fill(-1);

  for (let isl = 0; isl < islandCount; isl++) {
    const start = islandTxOffsets[isl];
    const end = islandTxOffsets[isl + 1];
    for (let i = start; i < end; i++) {
      const g = txGateNode[islandTxIds[i]];
      if (lastSeenIsland[g] !== isl) {
        lastSeenIsland[g] = isl;
        gateIslCounts[g]++;
      }
    }
  }

  const gateNetIslandOffsets = new Int32Array(netCount + 1);
  for (let n = 0; n < netCount; n++) {
    gateNetIslandOffsets[n + 1] = gateNetIslandOffsets[n] + gateIslCounts[n];
  }
  const gateNetIslandIds = new Int32Array(gateNetIslandOffsets[netCount]);
  const gateIslCursor = new Int32Array(gateNetIslandOffsets);
  lastSeenIsland.fill(-1);

  for (let isl = 0; isl < islandCount; isl++) {
    const start = islandTxOffsets[isl];
    const end = islandTxOffsets[isl + 1];
    for (let i = start; i < end; i++) {
      const g = txGateNode[islandTxIds[i]];
      if (lastSeenIsland[g] !== isl) {
        lastSeenIsland[g] = isl;
        gateNetIslandIds[gateIslCursor[g]++] = isl;
      }
    }
  }

  // Build railNet -> unique islandIds CSR using flat Int32Array stamp deduplication
  const railIslCounts = new Int32Array(netCount);
  lastSeenIsland.fill(-1);

  for (let isl = 0; isl < islandCount; isl++) {
    const start = islandRailTxOffsets[isl];
    const end = islandRailTxOffsets[isl + 1];
    for (let i = start; i < end; i++) {
      const r = railTxRailNet[i];
      if (lastSeenIsland[r] !== isl) {
        lastSeenIsland[r] = isl;
        railIslCounts[r]++;
      }
    }
  }

  const railNetIslandOffsets = new Int32Array(netCount + 1);
  for (let n = 0; n < netCount; n++) {
    railNetIslandOffsets[n + 1] = railNetIslandOffsets[n] + railIslCounts[n];
  }
  const railNetIslandIds = new Int32Array(railNetIslandOffsets[netCount]);
  const railIslCursor = new Int32Array(railNetIslandOffsets);
  lastSeenIsland.fill(-1);

  for (let isl = 0; isl < islandCount; isl++) {
    const start = islandRailTxOffsets[isl];
    const end = islandRailTxOffsets[isl + 1];
    for (let i = start; i < end; i++) {
      const r = railTxRailNet[i];
      if (lastSeenIsland[r] !== isl) {
        lastSeenIsland[r] = isl;
        railNetIslandIds[railIslCursor[r]++] = isl;
      }
    }
  }

  const dynamicSources: CompiledDynamicSource[] = new Array(rawDynamicSpecs.length);
  for (let i = 0; i < rawDynamicSpecs.length; i++) {
    const spec = rawDynamicSpecs[i];
    dynamicSources[i] = {
      compId: spec.compId,
      kind: spec.kind,
      netId: pinIdxToNet[rawDynamicPinIdx[i]],
      initialState: spec.initialState,
    };
  }

  return {
    netCount,
    islandCount,
    transistorCount: txCount,
    pinToNet,
    wireToNet,
    compToTxIndex,
    txGateNode,
    txDrainNode,
    txSourceNode,
    txType,
    txToIsland,
    gpuTransistorBuffer,
    gpuNodeStaticMaskBuffer,
    staticDriveMask,
    isRailNet,
    netToIsland,
    islandNetOffsets,
    islandNetIds,
    islandTxOffsets,
    islandTxIds,
    islandIntTxOffsets,
    intTxIdx,
    intTxIsPmos,
    intTxGateNet,
    intTxNetA,
    intTxNetB,
    islandRailTxOffsets,
    railTxIdx,
    railTxIsPmos,
    railTxGateNet,
    railTxNonRailNet,
    railTxRailNet,
    railBridgeCount,
    railBridgeTxIdx,
    railBridgeIsPmos,
    railBridgeGateNet,
    railBridgeNetA,
    railBridgeNetB,
    gateNetTxOffsets,
    gateNetTxIds,
    gateNetIslandOffsets,
    gateNetIslandIds,
    railNetIslandOffsets,
    railNetIslandIds,
    dynamicSources,
  };
}
