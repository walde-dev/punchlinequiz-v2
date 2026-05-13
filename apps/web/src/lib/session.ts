import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"

import { isAdminRequest } from "./admin"

/** Client-callable server function: am I currently logged in as admin? */
export const isAdminFn = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest()
  return { admin: isAdminRequest(req) }
})
