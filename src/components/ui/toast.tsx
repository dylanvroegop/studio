"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

// Mobile-first viewport: bottom-center, klein, en NIET click-blocking.
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      // pointer-events-none => buttons eronder blijven klikbaar
      "pointer-events-none fixed bottom-3 left-1/2 z-[100] w-[calc(100vw-1.5rem)] max-w-sm -translate-x-1/2",
      "flex flex-col gap-2 p-0",
      "md:bottom-4 md:right-4 md:left-auto md:translate-x-0 md:w-auto md:max-w-md",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  cn(
    // snackbar look: klein, subtiel, snelle animatie
    "pointer-events-none relative flex w-full items-start gap-2 overflow-hidden rounded-lg border px-3 py-2 shadow-lg",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2"
  ),
  {
    variants: {
      variant: {
        // Default = “succes/reassurance” vibe (groen accent links)
        default:
          "bg-zinc-950/95 text-zinc-50 border-zinc-800 before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-emerald-500",
        destructive:
          "bg-zinc-950/95 text-zinc-50 border-zinc-800 before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-red-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "pointer-events-auto inline-flex h-7 items-center justify-center rounded-md border border-zinc-700 px-2 text-xs font-medium text-zinc-50",
      "hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-600",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

// Close knop: klein. Pointer-events-auto zodat je hem kan klikken, maar rest blokkeert niet.
const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "pointer-events-auto absolute right-1.5 top-1.5 rounded-md p-1 text-zinc-400 hover:text-zinc-50",
      "focus:outline-none focus:ring-2 focus:ring-zinc-600",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-3.5 w-3.5" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-xs font-semibold leading-4", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-[11px] leading-4 text-zinc-300", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
