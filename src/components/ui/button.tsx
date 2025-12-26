import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    // Basis: premium / rustig / consistent
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-lg text-sm font-medium",
    "transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        // Hoofdactie (premium, niet schreeuwerig)
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",

// volgende / opslaan
success:
  "border border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 hover:border-emerald-500/65 focus-visible:ring-emerald-500 focus-visible:ring-offset-0",

  successGhost:
  "border border-input bg-transparent text-foreground " +
  "hover:bg-emerald-500/14 hover:border-emerald-500/55 hover:text-emerald-100 " +
  "focus-visible:ring-emerald-500 focus-visible:ring-offset-0",


        // “Sluiten / Annuleren / Verwijderen”
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",

        // Neutraal secundair
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",

        // Outline mag NOOIT groen worden op hover (dit was jouw bug/irritatie)
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",

        // Subtiele hover, ideaal voor icon-buttons / settings
        ghost:
          "bg-transparent hover:bg-accent hover:text-accent-foreground",

        link:
          "text-primary underline-offset-4 hover:underline",
      },

      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3",
        lg: "h-11 px-6",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
