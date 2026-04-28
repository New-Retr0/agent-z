import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-session";
import { getSafeAdminRedirect } from "@/lib/safe-redirect";
import { LoginForm } from "./ui";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const secret = process.env.AGENT_Z_ADMIN_SECRET;
  const sp = await searchParams;
  if (secret) {
    const token = (await cookies()).get(ADMIN_COOKIE)?.value;
    if (verifyAdminToken(secret, token)) {
      redirect(getSafeAdminRedirect(sp.next));
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-6">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <h1 className="text-xl font-semibold">Agent Z admin</h1>
        <p className="text-sm text-zinc-500">
          Enter the shared admin secret from <code className="text-zinc-300">AGENT_Z_ADMIN_SECRET</code>.
        </p>
        <LoginForm next={getSafeAdminRedirect(sp.next)} />
      </div>
    </div>
  );
}
