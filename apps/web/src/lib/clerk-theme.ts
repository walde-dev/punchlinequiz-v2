/**
 * Clerk widget styling for the punchlinequiz dark/charcoal + gold aesthetic.
 *
 * Clerk v6's `variables` map is narrow; most styling lives in `elements`
 * (className overrides keyed by Clerk's internal element names).
 */
export const clerkDarkAppearance = {
  variables: {
    colorPrimary: "#fbbf24",
    colorTextOnPrimaryBackground: "#121212",
    borderRadius: "0.75rem",
    fontFamily: "Figtree, system-ui, sans-serif",
  },
  elements: {
    rootBox: "w-full",
    // UserButton avatar — visible gold ring on dark bg
    avatarBox:
      "h-9 w-9 ring-2 ring-[#fbbf24]/60 ring-offset-2 ring-offset-background",
    userButtonAvatarBox: "h-9 w-9",
    userButtonTrigger:
      "rounded-full focus:outline-none focus:ring-2 focus:ring-[#fbbf24]",
    userButtonPopoverCard:
      "bg-[#1f1f1f] border border-white/10 rounded-2xl shadow-2xl text-neutral-100",
    userButtonPopoverActionButton: "text-neutral-200 hover:bg-white/5",
    userButtonPopoverActionButtonText: "text-neutral-200",
    userButtonPopoverActionButtonIcon: "text-neutral-400",
    userButtonPopoverFooter: "hidden",
    card: "bg-[#1f1f1f] border border-white/10 rounded-2xl shadow-2xl",
    headerTitle: "text-white font-extrabold",
    headerSubtitle: "text-neutral-400",
    socialButtonsBlockButton:
      "border border-white/10 bg-white/5 hover:bg-white/10 text-neutral-200",
    socialButtonsBlockButtonText: "text-neutral-200 font-medium",
    socialButtonsProviderIcon: "text-neutral-200",
    dividerLine: "bg-white/10",
    dividerText: "text-neutral-500",
    formFieldLabel: "text-neutral-300 text-sm font-medium",
    formFieldInput:
      "bg-[#2a2a2a] border border-white/10 text-neutral-100 placeholder:text-neutral-500",
    formFieldInputShowPasswordButton: "text-neutral-400 hover:text-neutral-200",
    formButtonPrimary:
      "bg-[#fbbf24] text-[#121212] hover:bg-[#f59e0b] font-bold",
    identityPreviewText: "text-neutral-200",
    identityPreviewEditButton: "text-[#fbbf24] hover:text-[#f59e0b]",
    footer: "bg-transparent",
    footerAction: "bg-transparent",
    footerActionText: "text-neutral-400",
    footerActionLink: "text-[#fbbf24] hover:text-[#f59e0b] font-semibold",
    alertText: "text-neutral-200",
    formResendCodeLink: "text-[#fbbf24] hover:text-[#f59e0b]",
    otpCodeFieldInput:
      "bg-[#2a2a2a] border border-white/10 text-neutral-100",
  },
}
