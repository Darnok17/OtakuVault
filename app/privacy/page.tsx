import type { Metadata } from "next";
import LegalPage from "@/app/_components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · OtakuVault", description: "What OtakuVault collects, why, and what you can do about it." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" kanji="個人情報" latin="Privacy" updated="November 10, 2026" other={{ href: "/terms", label: "Terms of Service" }}>
      <h2>The short version</h2>
      <p>
        We collect what the site needs to work: your account details and the things you add. We don&apos;t run ads,
        we don&apos;t track you around the web, and <strong>we do not sell your data</strong> to anyone.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> email address, username, display name and a password (stored only as a salted hash; we can&apos;t read it). If you sign in with Google, Discord or GitHub, we receive your name, email and profile picture from them, and nothing else.</li>
        <li><strong>What you add:</strong> your collection, ratings, notes, moodboards, profile text and picture, forum posts and votes, pins, and reports you file.</li>
        <li><strong>Preferences:</strong> your theme, and whether your profile is public.</li>
        <li><strong>Technical data:</strong> the IP address and browser details that arrive with every request, kept in short-lived server logs to keep the site secure and working.</li>
      </ul>

      <h2>What we use it for</h2>
      <ul>
        <li>Showing you your collection and keeping it in sync between devices.</li>
        <li>Recommending titles and store items based on what you rated highly.</li>
        <li>Running the forum: showing your name on your posts and letting moderators handle reports.</li>
        <li>Keeping accounts secure and stopping abuse.</li>
      </ul>

      <h2>What other people can see</h2>
      <p>
        Your forum posts are public and carry your display name, username and picture. Your profile page is
        public unless you switch it off in Settings &rarr; Privacy, and on the profile edit page you choose
        which sections (bio, pronouns, collection, moodboards, forum posts) visitors can see. Your email
        address is never shown to other users.
      </p>

      <h2>Cookies and local storage</h2>
      <ul>
        <li><strong>Session cookie:</strong> keeps you signed in. Essential.</li>
        <li><strong>Theme cookie</strong> (<code>ov_theme</code>): remembers your theme so pages load in it without a flash. No identifier in it.</li>
        <li><strong>Local storage:</strong> the same theme preference, your effects setting, and your store cart.</li>
      </ul>
      <p>There are no advertising or cross-site tracking cookies, which is why there is no cookie banner.</p>

      <h2>Who else handles your data</h2>
      <p>
        We use a small number of providers to run the site: Vercel (hosting and uploaded images), Neon (the
        database), and AniList (title information; we send them title searches, never anything about you).
        If you choose to sign in with Google, Discord or GitHub, that provider learns that you used OtakuVault.
        They process data on our behalf or under their own policies; none of them is given your data to sell
        or advertise with.
      </p>

      <h2>How long we keep it</h2>
      <p>
        For as long as you have an account. Delete an entry, a moodboard or a picture and it is gone from the
        live site at once; backups roll off within 30 days. Close your account and everything tied to it is
        deleted, except that forum posts are replaced by &ldquo;[deleted]&rdquo; so threads stay readable.
      </p>

      <h2>Your rights</h2>
      <p>
        Wherever you live, you can ask for a copy of your data, correct it, or have it deleted. If you are in
        the EU or UK, the GDPR gives you those rights in law, along with the right to object to or restrict
        how we use your data and to complain to your data protection authority. We rely on our contract with
        you (running your account) and our legitimate interest in a safe, working site as the legal bases for
        processing. To use any of these rights, email <a href="mailto:privacy@otakuvault.example">privacy@otakuvault.example</a>; we answer within 30 days.
      </p>

      <h2>Children</h2>
      <p>
        OtakuVault is not for children under 13 and we don&apos;t knowingly collect their data. If you believe a
        child has made an account, tell us and we will remove it.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change what we collect or how we use it, we will update this page and its date, and announce
        anything significant on the site before it takes effect.
      </p>
    </LegalPage>
  );
}
