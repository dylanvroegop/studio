---
name: Component Generator
description: Expert instructions for generating premium, responsive Next.js components using Tailwind CSS and Radix UI.
---

# Component Generator Skill

When the user asks to create a new UI component, follow these strict guidelines to ensure consistency with the existing premium design system.

## 1. Technology Stack
- **Framework:** React / Next.js (App Router)
- **Styling:** Tailwind CSS (Vanilla utilities, avoid arbitrary values like `w-[50px]`)
- **Icons:** `lucide-react` (Import as `import { IconName } from 'lucide-react'`)
- **Structure:** Functional components with TypeScript interfaces for props.
- **Utils:** Use `cn()` (clsx + tailwind-merge) for conditional class merging.

## 2. Design Requirements (Premium Aesthetic)
- **Visuals:** Use glassmorphism (`backdrop-blur`), subtle borders (`border-white/10`), and smooth gradients.
- **Dark Mode:** FIRST priority. Ensure `dark:` variants are defined for backgrounds and text.
- **Typography:** Use semantic HTML (`h1`-`h6`, `p`) with specific text colors (e.g., `text-muted-foreground` for secondary text).
- **Interactivity:** Add `hover:` states, `active:` scale effects, and `focus-visible:` rings for accessibility.

## 3. File Structure
- **Location:** Place reusable components in `src/components/` or `src/components/ui/`.
- **Naming:** PascalCase for filenames and updates (e.g., `feature-card.tsx` -> `FeatureCard`).

## 4. Code Template
```tsx
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface MyComponentProps {
  className?: string;
  title: string;
  icon?: LucideIcon;
}

export function MyComponent({ className, title, icon: Icon }: MyComponentProps) {
  return (
    <div className={cn(
      "group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition-all hover:bg-white/10",
      className
    )}>
      <div className="flex items-center gap-4">
        {Icon && <Icon className="h-6 w-6 text-primary" />}
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      </div>
    </div>
  );
}
```

## 5. Verification
- After creating the component, ensure it is exported (if using an index file) or imported correctly in the target page.
- Check for `use client` directive if the component uses hooks (useState, useEffect) or event handlers.
