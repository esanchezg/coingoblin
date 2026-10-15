import { AsyncLocalStorage } from "node:async_hooks";

// Who an MCP request acts as: the parent (Clerk user id) who connected the client.
const store = new AsyncLocalStorage<{ parentUserId: string }>();

// Runs `fn` so requireParentUserId() in the Server Actions resolves to this parent
// instead of reading a Clerk browser session (MCP requests carry a bearer token).
export function runAsParent<T>(parentUserId: string, fn: () => Promise<T>): Promise<T> {
  return store.run({ parentUserId }, fn);
}

export const currentMcpParent = () => store.getStore()?.parentUserId ?? null;
