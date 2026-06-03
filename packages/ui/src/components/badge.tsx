import { cva } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"
import type { VariantProps } from "class-variance-authority"
import type * as React from "react"


const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap tabular-nums transition-colors [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary",
        muted: "border-border/50 bg-muted/40 text-muted-foreground",
        outline: "border-border/60 text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
