'use client';

import React, { type ReactNode } from 'react';

// This provider is now just a pass-through to ensure its children are client components.
// The actual context logic is in client-provider.tsx
export function FirebaseProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
