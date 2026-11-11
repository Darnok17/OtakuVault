import Link from "next/link";
import Avatar from "@/app/_components/Avatar";
import type { ForumAuthor } from "@/lib/forum-shared";

// Avatar + display name + @username, linking to the author's profile.
export default function AuthorLink({ author, size = "sm", handle = true }: { author: ForumAuthor; size?: "sm" | "lg"; handle?: boolean }) {
  const inner = (
    <>
      <Avatar src={author.avatar} name={author.name} size={size} />
      <span className="au-name">{author.name}</span>
      {handle && author.username && <span className="au-handle">@{author.username}</span>}
    </>
  );
  return author.username
    ? <Link className="au" href={`/profile/${author.username}`}>{inner}</Link>
    : <span className="au">{inner}</span>;
}
