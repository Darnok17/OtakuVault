import { timingSafeEqual } from "node:crypto";
import { runNewEpisodesJob } from "@/lib/jobs/new-episodes";

// Scheduled job: announces newly aired episodes of anime members are watching.
// Call it with `Authorization: Bearer $CRON_SECRET` (GET or POST) from any scheduler:
// Vercel Cron sends exactly that header when CRON_SECRET is set; on Cloudflare a Cron Trigger
// worker fetches this URL. Safe to call as often as you like: every event is deduplicated.

export const maxDuration = 60;

function authorized(header: string, secret: string): boolean {
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function run(request: Request) {
  // Read the request first: that also keeps this handler out of build-time prerendering.
  const header = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!authorized(header, secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const report = await runNewEpisodesJob();
    // 200 even when AniList cut the run short; the rest is picked up on the next run.
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("new-episodes job failed:", err);
    return Response.json({ error: "Job failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
