import type { Metadata } from "next";
import LegalPage from "@/app/_components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms of Service · OtakuVault", description: "The rules for using OtakuVault, in plain English." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" kanji="利用規約" latin="Terms" updated="November 10, 2026" other={{ href: "/privacy", label: "Privacy Policy" }}>
      <h2>The short version</h2>
      <p>
        OtakuVault is a place to track what you watch and read, build moodboards, talk about it, and shop for
        things tied to the series you love. Be decent to other people, post only what you have the right to
        post, and don&apos;t try to break the site. In return we keep your collection safe and stay out of your way.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You need to be <strong>at least 13 years old</strong> to have an account. If we learn an account belongs to someone younger, we close it and delete its data.</li>
        <li>You are responsible for what happens under your account. Pick a password you don&apos;t use elsewhere and tell us if you think someone else has got in.</li>
        <li>One person, one account. Don&apos;t impersonate other people, studios or publishers.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Don&apos;t use OtakuVault to:</p>
      <ul>
        <li>harass, threaten or dox anyone, or post hate speech;</li>
        <li>post sexual content involving minors, in any form, drawn or otherwise;</li>
        <li>share pirated episodes, chapters, scans or links to them;</li>
        <li>post untagged spoilers in thread titles (inside a thread, warn first);</li>
        <li>spam, advertise, or run bots and scrapers against the site;</li>
        <li>probe, overload or attempt to get around the site&apos;s security.</li>
      </ul>
      <p>Moderators can remove posts and pin or lock threads. Every post has a Report button; reports go to the moderators, not to the person you reported.</p>

      <h2>Your content stays yours</h2>
      <p>
        Your collection, ratings, notes, moodboards, profile and forum posts belong to you. By putting them on
        OtakuVault you give us permission to store them, display them where you chose to show them (your public
        profile, the forum) and make the backups a working service needs. That permission ends when you delete
        the content or your account, apart from backups that expire on their own schedule.
      </p>
      <p>
        Deleting a forum post replaces its text with &ldquo;[deleted]&rdquo; so the replies under it still make
        sense. The text itself is no longer shown to anyone.
      </p>

      <h2>Other people&apos;s work</h2>
      <p>
        Cover art, titles, descriptions and character images come from AniList and belong to their respective
        rights holders. They are shown to identify the works you are tracking. Images you upload must be yours
        to share, or clearly allowed (official key art used to talk about a series is the usual case).
      </p>

      <h2>Copyright complaints (DMCA)</h2>
      <p>
        If something on OtakuVault infringes your copyright, email <a href="mailto:dmca@otakuvault.example">dmca@otakuvault.example</a> with:
        what the work is, where it appears on the site (a link), your contact details, a statement that you
        believe in good faith the use isn&apos;t authorized, and a statement, under penalty of perjury, that the
        notice is accurate and that you are the owner or act for them. We remove what is validly reported and
        tell the person who posted it, who can send a counter-notice. Accounts that keep infringing are closed.
      </p>

      <h2>The store</h2>
      <p>
        The store is a preview. You can browse and fill a cart, but <strong>checkout is not open yet and nothing
        can be bought or charged</strong>. Prices and availability shown today may change before it opens.
      </p>

      <h2>Ending things</h2>
      <ul>
        <li>You can stop using OtakuVault whenever you like. Account deletion from Settings is on its way; until then, email us and we will delete the account for you.</li>
        <li>We can suspend or close accounts that break these terms. For anything short of the serious cases above, we warn first.</li>
        <li>If we ever shut the service down, we will give notice and a way to export your collection.</li>
      </ul>

      <h2>No guarantees</h2>
      <p>
        OtakuVault is provided as it is. We work to keep it running and your data intact, but we can&apos;t promise
        it will never be down or never lose anything, and release data from AniList is sometimes wrong. To the
        extent the law allows, we are not liable for indirect losses from using the site.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        When these terms change in a way that matters, we will say so on the site before the change takes
        effect and update the date at the top. Carrying on using OtakuVault after that means you accept the new
        version. If you don&apos;t, you can close your account.
      </p>
    </LegalPage>
  );
}
