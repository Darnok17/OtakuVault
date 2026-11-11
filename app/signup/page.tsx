import type { Metadata } from "next";
import { oauthConfigured } from "@/lib/auth";
import SignupForm from "./SignupForm";

export const metadata: Metadata = { title: "Sign up · OtakuVault" };

// Server component so the form can be told which OAuth providers have credentials.
export default function SignupPage() {
  return <SignupForm oauthConfigured={oauthConfigured} />;
}
