import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type DependencyList, type Dispatch, type SetStateAction } from "react";

export function errorText(error: unknown, fallback = "Something went wrong. Try again.") {
  return error instanceof Error && error.message ? error.message : fallback;
}

export type Resource<T> = {
  data: T | undefined;
  setData: Dispatch<SetStateAction<T | undefined>>;
  error: string;
  loading: boolean;
  /** Re-fetch; resolves when done (for pull-to-refresh). */
  reload: () => Promise<void>;
};

/**
 * Load data for a screen. Re-runs when `deps` change and (with `focus`) whenever the screen regains focus.
 * Errors are captured as text; stale responses from earlier runs are dropped.
 */
export function useResource<T>(load: () => Promise<T>, deps: DependencyList, { focus = false, enabled = true } = {}): Resource<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(enabled);
  const run = useRef(0);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });

  const reload = useCallback(async () => {
    if (!enabled) return;
    const id = ++run.current;
    try {
      const value = await loader.current();
      if (id === run.current) {
        setData(value);
        setError("");
      }
    } catch (err) {
      if (id === run.current) setError(errorText(err, "Couldn’t load this. Pull to refresh."));
    } finally {
      if (id === run.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    if (!focus) reload();
  }, [reload, focus]);

  useFocusEffect(
    useCallback(() => {
      if (focus) reload();
    }, [focus, reload]),
  );

  return { data, setData, error, loading: loading && data === undefined, reload };
}
