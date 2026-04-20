import { redirect } from "next/navigation";

export default function AdminIntegrationsRedirect() {
  redirect("/settings");
}
