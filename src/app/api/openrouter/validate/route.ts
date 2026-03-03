import { NextRequest, NextResponse } from "next/server";
import { validateOpenRouterApiKey } from "@/lib/openrouter";
import { getOpenRouterSettings } from "@/lib/settings";
import { z } from "zod/v4";

const validateBody = z.object({
  apiKey: z.string().min(1).optional(),
  useStored: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = validateBody.parse(await request.json());
    let keyToValidate: string;

    if (body.apiKey && !body.apiKey.includes("...")) {
      keyToValidate = body.apiKey;
    } else {
      const orSettings = await getOpenRouterSettings();
      keyToValidate = orSettings.apiKey;
    }

    if (!keyToValidate) {
      return NextResponse.json({ ok: true, data: { valid: false } });
    }

    const valid = await validateOpenRouterApiKey(keyToValidate);
    return NextResponse.json({ ok: true, data: { valid } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 400 },
    );
  }
}
