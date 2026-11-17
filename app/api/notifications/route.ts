import { auth } from "@/lib/auth";
import { notificationFeed } from "@/lib/notifications";

// The bell's feed: unread count plus the latest notifications, for the signed-in member only.
// A Route Handler rather than a Server Action because the bell polls it, and Server Actions are
// dispatched one at a time per client, so polling through one would hold up real mutations.
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const feed = await notificationFeed(session.user.id, 10);
  return Response.json(feed, { headers: { "Cache-Control": "private, no-store" } });
}
