import { createAuthClient } from "better-auth/react";

// Same-origin: the client talks to /api/auth on whatever host served the page.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
