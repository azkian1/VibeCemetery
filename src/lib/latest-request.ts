export type LatestRequestState = {
  generation: number;
  controller: AbortController | null;
};

export type LatestRequest = {
  generation: number;
  controller: AbortController;
};

export function createLatestRequestState(): LatestRequestState {
  return { generation: 0, controller: null };
}

export function beginLatestRequest(state: LatestRequestState): LatestRequest {
  state.controller?.abort();
  const controller = new AbortController();
  const generation = state.generation + 1;
  state.generation = generation;
  state.controller = controller;
  return { generation, controller };
}

export function isLatestRequest(state: LatestRequestState, request: LatestRequest): boolean {
  return !request.controller.signal.aborted
    && state.generation === request.generation
    && state.controller === request.controller;
}

export function finishLatestRequest(state: LatestRequestState, request: LatestRequest): void {
  if (state.generation === request.generation && state.controller === request.controller) {
    state.controller = null;
  }
}

export function abortLatestRequest(state: LatestRequestState): void {
  state.generation += 1;
  state.controller?.abort();
  state.controller = null;
}
