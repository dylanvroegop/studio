import * as React from "react"

import { cn } from "@/lib/utils"

const DISALLOWED_NUMBER_KEYS = new Set(["e", "E", "+", "-"])
const DISALLOWED_NUMBER_PASTE = /[eE+-]/

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onKeyDown, onPaste, ...props }, ref) => {
    const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
      if (type === "number" && DISALLOWED_NUMBER_KEYS.has(event.key)) {
        event.preventDefault()
      }

      onKeyDown?.(event)
    }

    const handlePaste: React.ClipboardEventHandler<HTMLInputElement> = (event) => {
      if (type === "number") {
        const pastedText = event.clipboardData.getData("text")
        if (DISALLOWED_NUMBER_PASTE.test(pastedText)) {
          event.preventDefault()
        }
      }

      onPaste?.(event)
    }

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-all duration-200",
          className
        )}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
