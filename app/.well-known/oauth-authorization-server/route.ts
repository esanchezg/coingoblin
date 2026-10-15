import { authServerMetadataHandlerClerk, metadataCorsOptionsRequestHandler } from "@clerk/mcp-tools/next";

// Some MCP clients look for the authorization-server metadata on this origin; mirror Clerk's.
const handler = authServerMetadataHandlerClerk();

export { handler as GET };
export const OPTIONS = metadataCorsOptionsRequestHandler();
