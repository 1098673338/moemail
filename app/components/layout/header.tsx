import { SignButton } from "@/components/auth/sign-button"
import { FontSwitcher } from "@/components/theme/font-switcher"
import { Logo } from "@/components/ui/logo"

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 min-w-[1920px]">
      <div className="h-full w-full px-5">
        <div className="h-full flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-y-4 gap-x-4">
            <FontSwitcher />
            <SignButton />
          </div>
        </div>
      </div>
    </header>
  )
} 
