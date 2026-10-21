import { AsyncLocalStorage } from "node:async_hooks";

// Who an MCP request acts as: the parent (Clerk user id) who connected the client, and their household.
type McpParent = { householdId: string; userId: string };
const store = new AsyncLocalStorage<McpParent>();

// Runs `fn` so currentParent() in the Server Actions resolves to this parent
// instead of reading a Clerk browser session (MCP requests carry a bearer token).
export function runAsParent<T>(parent: McpParent, fn: () => Promise<T>): Promise<T> {
  return store.run(parent, fn);
}

export const currentMcpParent = () => store.getStore() ?? null;
