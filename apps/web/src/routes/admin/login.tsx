import { SignIn } from "@clerk/tanstack-react-start"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { isAdminFn } from "../../lib/session"
import { clerkDarkAppearance } from "../../lib/clerk-theme"

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginPage,
  loader: async () => {
    const { admin } = await isAdminFn()
    if (admin) throw redirect({ to: "/admin" })
    return null
  },
})

function AdminLoginPage() {
  return (
    <main className="relative flex min-h-svh items-center justify-center px-5 py-12">
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative w-full max-w-sm">
        <SignIn
          routing="hash"
          forceRedirectUrl="/admin"
          signUpUrl="/admin/login"
          appearance={clerkDarkAppearance}
        />
      </div>
    </main>
  )
}
