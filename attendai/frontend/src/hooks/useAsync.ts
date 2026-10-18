import { useCallback, useEffect, useState } from "react";

/** Runs an async loader when deps change. Keeps the previous data on screen while reloading. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    loader()
      .then((data) => alive && setState({ data, loading: false }))
      .catch((e: Error) => alive && setState((s) => ({ ...s, loading: false, error: e.message })));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
