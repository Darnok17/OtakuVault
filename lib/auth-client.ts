import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

// Same-origin: the client talks to /api/auth on whatever host served the page.
// inferAdditionalFields only adds types: session.user gains username, avatarUrl, preferredTheme, isAdmin.
export const authClient = createAuthClient({ plugins: [inferAdditionalFields<typeof auth>()] });

export const { signIn, signUp, signOut, useSession } = authClient;
