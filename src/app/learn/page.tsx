import { redirect } from "next/navigation";

// /learn redirects to /learn/library by default. The library is the more
// public-facing of the two tabs (coaches searching "5v5 flag mesh" land
// here) so it gets primary URL real estate; the "Using XO Gridmaker"
// product-education tab is one click away.
export default function LearnIndexPage() {
  redirect("/learn/library");
}
