import { webSearchTool as openAIWebSearchTool } from "@openai/agents-openai";

const DEFAULT_SEARCH_CONTEXT_SIZE: "low" | "medium" | "high" = "medium";

const userLocation = process.env.NEXT_PUBLIC_WEB_SEARCH_LOCATION;
const allowedDomains = process.env.NEXT_PUBLIC_WEB_SEARCH_ALLOWED_DOMAINS;

const parsedAllowedDomains = allowedDomains
  ? allowedDomains
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  : undefined;

export const webSearchTool = openAIWebSearchTool({
  searchContextSize: DEFAULT_SEARCH_CONTEXT_SIZE,
  userLocation: userLocation
    ? {
        country: userLocation.toUpperCase(),
      }
    : undefined,
  filters: parsedAllowedDomains && parsedAllowedDomains.length > 0 ? { allowedDomains: parsedAllowedDomains } : undefined,
});
