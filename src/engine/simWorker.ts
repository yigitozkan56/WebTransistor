import type { CircuitDocument } from '../types/circuit';
import { Simulator } from './simulator';

export type SimWorkerRequest =
  | {
      type: 'LOAD_DOCUMENT';
      doc: CircuitDocument;
      epoch: number;
      seq: number;
      sharedNetBuffer?: SharedArrayBuffer;
      sharedTxBuffer?: SharedArrayBuffer;
    }
  | {
      type: 'RESET';
      epoch: number;
      seq: number;
    }
  | {
      type: 'SET_TOGGLE';
      compId: string;
      state: boolean;
      epoch: number;
      seq: number;
    }
  | {
      type: 'SET_BUTTON';
      compId: string;
      pressed: boolean;
      epoch: number;
      seq: number;
    }
  | {
      type: 'STEP_BATCH';
      ticks: number;
      epoch: number;
      seq: number;
      recycleNetBuf?: ArrayBuffer;
      recycleTxBuf?: ArrayBuffer;
    };

export interface SimWorkerResponse {
  type: 'SNAPSHOT_SYNC';
  epoch: number;
  seq: number;
  tickCount: number;
  effectiveHz: number;
  hasShortCircuit: boolean;
  usingSharedBuffers?: boolean;
  netBuffer?: ArrayBuffer;
  txStateBuffer?: ArrayBuffer;
}

interface WorkerGlobalScopeLike {
  onmessage: ((event: MessageEvent<SimWorkerRequest>) => void) | null;
  postMessage: (message: SimWorkerResponse, transfer?: Transferable[]) => void;
}

const workerScope = self as unknown as WorkerGlobalScopeLike;
const sim = new Simulator();

let spareNetBuf: ArrayBuffer | null = null;
let spareTxBuf: ArrayBuffer | null = null;
let sharedNetView: Uint8Array | null = null;
let sharedTxView: Uint8Array | null = null;

function emitSnapshot(epoch: number, seq: number): void {
  const snap = sim.getSnapshot();
  const netLen = snap.netValues.byteLength;
  const txLen = snap.transistors.state.byteLength;

  if (
    sharedNetView &&
    sharedTxView &&
    sharedNetView.byteLength === netLen &&
    sharedTxView.byteLength === txLen
  ) {
    sharedNetView.set(snap.netValues);
    sharedTxView.set(snap.transistors.state);

    const response: SimWorkerResponse = {
      type: 'SNAPSHOT_SYNC',
      epoch,
      seq,
      tickCount: snap.tickCount,
      effectiveHz: snap.effectiveHz,
      hasShortCircuit: snap.hasShortCircuit,
      usingSharedBuffers: true,
    };
    workerScope.postMessage(response);
    return;
  }

  const netBuffer =
    spareNetBuf && spareNetBuf.byteLength === netLen
      ? spareNetBuf
      : new ArrayBuffer(netLen);
  spareNetBuf = null;

  const txStateBuffer =
    spareTxBuf && spareTxBuf.byteLength === txLen
      ? spareTxBuf
      : new ArrayBuffer(txLen);
  spareTxBuf = null;

  new Uint8Array(netBuffer).set(snap.netValues);
  new Uint8Array(txStateBuffer).set(snap.transistors.state);

  const response: SimWorkerResponse = {
    type: 'SNAPSHOT_SYNC',
    epoch,
    seq,
    tickCount: snap.tickCount,
    effectiveHz: snap.effectiveHz,
    hasShortCircuit: snap.hasShortCircuit,
    usingSharedBuffers: false,
    netBuffer,
    txStateBuffer,
  };

  workerScope.postMessage(response, [netBuffer, txStateBuffer]);
}

workerScope.onmessage = (event: MessageEvent<SimWorkerRequest>) => {
  const msg = event.data;
  if (!msg) return;

  switch (msg.type) {
    case 'LOAD_DOCUMENT':
      sim.loadDocument(msg.doc);
      if (msg.sharedNetBuffer && msg.sharedTxBuffer) {
        sharedNetView = new Uint8Array(msg.sharedNetBuffer);
        sharedTxView = new Uint8Array(msg.sharedTxBuffer);
      } else {
        sharedNetView = null;
        sharedTxView = null;
      }
      emitSnapshot(msg.epoch, msg.seq);
      break;

    case 'RESET':
      sim.reset();
      emitSnapshot(msg.epoch, msg.seq);
      break;

    case 'SET_TOGGLE':
      sim.setToggleState(msg.compId, msg.state);
      emitSnapshot(msg.epoch, msg.seq);
      break;

    case 'SET_BUTTON':
      sim.setPushButtonState(msg.compId, msg.pressed);
      emitSnapshot(msg.epoch, msg.seq);
      break;

    case 'STEP_BATCH':
      if (msg.recycleNetBuf) spareNetBuf = msg.recycleNetBuf;
      if (msg.recycleTxBuf) spareTxBuf = msg.recycleTxBuf;
      sim.stepBatch(msg.ticks);
      emitSnapshot(msg.epoch, msg.seq);
      break;
  }
};
