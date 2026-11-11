import type { Metadata } from "next";
import { oauthConfigured } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Log in · OtakuVault" };

// Server component so the form can be told which OAuth providers have credentials.
export default function LoginPage() {
  return <LoginForm oauthConfigured={oauthConfigured} />;
}
