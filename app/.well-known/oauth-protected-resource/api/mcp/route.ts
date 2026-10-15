import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";
import { metadataCorsOptionsRequestHandler } from "@clerk/mcp-tools/next";

// RFC 9728 metadata for the MCP endpoint at /api/mcp: tells a client that Clerk is the OAuth server.
// `resource` must be the MCP URL itself (not just the origin) so clients accept it.
export function GET(req: Request) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const metadata = generateClerkProtectedResourceMetadata({
    publishableKey,
    resourceUrl: new URL("/api/mcp", req.url).toString(),
    properties: { resource_name: "CoinGoblin" },
  });
  return Response.json(metadata, {
    headers: { "Cache-Control": "max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
