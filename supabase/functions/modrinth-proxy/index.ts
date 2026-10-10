import { corsHeaders } from "../_shared/cors.ts";

// Modrinth API proxy — public, no JWT required
// The Modrinth API path is passed via the "path" query parameter
// because Supabase edge functions don't support nested path segments.
const MODRINTH_API = "https://api.modrinth.com/v2";
const USER_AGENT = "VERTEX-Launcher/1.0 (launcher@vertex.app)";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const modrinthPath = url.searchParams.get("path");
    if (!modrinthPath) {
      return new Response(
        JSON.stringify({ error: "Missing 'path' query parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Reconstruct the Modrinth URL: pass through all query params except "path"
    const modrinthParams = new URLSearchParams(url.searchParams);
    modrinthParams.delete("path");
    const queryString = modrinthParams.toString();
    const targetUrl = queryString
      ? `${MODRINTH_API}${modrinthPath}?${queryString}`
      : `${MODRINTH_API}${modrinthPath}`;

    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      return new Response(
        JSON.stringify({ error: `Modrinth API error: ${res.status}`, detail: body }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("modrinth-proxy failed", error);
    return new Response(JSON.stringify({ error: "Failed to reach Modrinth API" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
