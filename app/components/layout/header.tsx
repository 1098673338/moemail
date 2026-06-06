import { SignButton } from "@/components/auth/sign-button"
import { Logo } from "@/components/ui/logo"

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 min-w-[1920px]">
      <div className="h-full w-full pl-8 pr-5">
        <div className="h-full flex items-center justify-between">
          <Logo />
          <SignButton />
        </div>
      </div>
    </header>
  )
} 
