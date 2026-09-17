import { redirect } from "next/navigation";
import { getKidSession } from "@/lib/kid-session";
import KidLoginForm from "./login-form";

export default async function KidLoginPage() {
  const session = await getKidSession();
  if (session) redirect("/kid");

  return <KidLoginForm />;
}
