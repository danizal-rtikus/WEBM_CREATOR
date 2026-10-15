// Store minimal ala Zustand (tanpa dependensi) memakai useSyncExternalStore.
import { useSyncExternalStore } from 'react';

export function createStore(init) {
  let state;
  const listeners = new Set();
  const get = () => state;
  const set = (partial) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    if (next === state) return;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };
  const subscribe = (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  state = init(set, get);

  function useStore(selector = (s) => s) {
    return useSyncExternalStore(subscribe, () => selector(state));
  }
  useStore.getState = get;
  useStore.setState = set;
  useStore.subscribe = subscribe;
  return useStore;
}
