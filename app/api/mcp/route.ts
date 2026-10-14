import { auth } from "@clerk/nextjs/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerTools } from "@/lib/mcp/tools";

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {
    serverInfo: { name: "coingoblin", version: "1.0.0" },
    instructions:
      "CoinGoblin is a family chores & allowance tracker. Kids claim chores; claims wait in a pending queue until the parent approves them. A kid's balance is all approved chore value minus all payouts, and a payout covers everything earned before it was recorded (not a calendar week). Read with the get_/list_ tools before changing anything, and only record a payout when the parent has said the amount.",
  },
);

// Clerk is the OAuth server; the bearer token must be a Clerk OAuth access token. The household it
// can touch is the token's own Clerk user id (see lib/mcp/auth.ts), never anything the client sends.
const authed = withMcpAuth(
  handler,
  async (_req, bearerToken) => verifyClerkToken(await auth({ acceptsToken: "oauth_token" }), bearerToken),
  { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp" },
);

export { authed as GET, authed as POST };
