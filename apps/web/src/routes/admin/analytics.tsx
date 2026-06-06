import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

import { isAdminFn } from "../../lib/session"

/**
 * Analytics section layout. The sidebar shows "Analytics" as a parent with two
 * children — Conversion (index, /admin/analytics) and Lines (/admin/analytics/lines).
 * This route is a passthrough; each child renders its own AdminShell. The admin
 * guard here protects the whole section.
 */
export const Route = createFileRoute("/admin/analytics")({
  beforeLoad: async () => {
    const { admin } = await isAdminFn()
    if (!admin) throw redirect({ to: "/admin/login" })
  },
  component: () => <Outlet />,
})
