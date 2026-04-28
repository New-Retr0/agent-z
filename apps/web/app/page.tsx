import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Agent Z</h1>
      <p className="text-zinc-500 text-center max-w-md text-sm">
        Vercel-hosted Discord bot and admin control plane. Public surface is minimal; operators use the
        private admin UI.
      </p>
      <Link href="/admin/login" className="text-sm text-blue-400 hover:underline">
        Admin sign-in
      </Link>
    </div>
  );
}
