import { NextRequest, NextResponse } from "next/server";
import { requireMediaUser } from "@/lib/media-api-access";
import { timelineMediaPreview } from "@/lib/timeline/media-previews";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  try {
    const body = await req.json();
    if (typeof body.fileUrl !== "string" || body.fileUrl.length > 4096)
      return NextResponse.json({ error: "Invalid media URL" }, { status: 400 });
    const result = await timelineMediaPreview(
      access.user.id,
      body.fileUrl,
      req.nextUrl.origin,
      req.signal,
    );
    return NextResponse.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview unavailable" },
      {
        status: req.signal.aborted
          ? 499
          : error instanceof Error && error.message === "Media not found"
            ? 404
            : 400,
      },
    );
  }
}
