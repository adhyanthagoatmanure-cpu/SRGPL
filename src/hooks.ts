import { useLiveQuery } from "dexie-react-hooks";
import { useUser } from "./context/AuthContext";

/** Live (auto-refreshing) query scoped to the signed-in user. Returns undefined while loading. */
export function useLive<T>(fn: (userId: string) => Promise<T>, deps: readonly unknown[] = []): T | undefined {
  const { id } = useUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useLiveQuery(() => fn(id), [id, ...deps]);
}
