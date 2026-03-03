import { NextRequest, NextResponse } from "next/server";
import { loadSettings, updateSettings } from "@/lib/settings";
import { maskApiKey } from "@/lib/openrouter";
import type { FoolerySettings } from "@/lib/schemas";

/** Return settings with the OpenRouter API key masked for safe display. */
function maskSettingsResponse(settings: FoolerySettings) {
  return {
    ...settings,
    openrouter: {
      ...settings.openrouter,
      apiKey: maskApiKey(settings.openrouter.apiKey),
    },
  };
}

/**
 * If the incoming body contains a masked API key (one containing "..."),
 * strip it so `updateSettings` preserves the existing stored key.
 */
function stripMaskedApiKey(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const openrouter = body.openrouter as
    | Record<string, unknown>
    | undefined;
  if (
    openrouter?.apiKey &&
    typeof openrouter.apiKey === "string" &&
    openrouter.apiKey.includes("...")
  ) {
    const cleaned = { ...openrouter };
    delete cleaned.apiKey;
    return { ...body, openrouter: cleaned };
  }
  return body;
}

export async function GET() {
  const settings = await loadSettings();
  return NextResponse.json({
    ok: true,
    data: maskSettingsResponse(settings),
  });
}

export async function PUT(request: NextRequest) {
  try {
    const body = stripMaskedApiKey(await request.json());
    const updated = await updateSettings(body);
    return NextResponse.json({
      ok: true,
      data: maskSettingsResponse(updated),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 400 },
    );
  }
}

/**
 * PATCH /api/settings — merge a partial settings payload.
 * Identical merge semantics to PUT but signals partial-update intent.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = stripMaskedApiKey(await request.json());
    const updated = await updateSettings(body);
    return NextResponse.json({
      ok: true,
      data: maskSettingsResponse(updated),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 400 },
    );
  }
}
