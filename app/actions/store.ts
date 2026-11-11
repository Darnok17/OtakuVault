"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { recommendProducts } from "@/lib/shop";
import type { Recommended } from "@/lib/store-shared";

// "Recommended for You". The member is always taken from the session: a user id sent by the
// browser would let anyone read what another member's collection recommends.
export async function getRecommendedProducts(): Promise<Recommended> {
  const session = await auth.api.getSession({ headers: await headers() });
  return recommendProducts(session?.user.id ?? null);
}
