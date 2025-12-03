'use client';

import React, { type ReactNode } from 'react';

// This provider is now just a pass-through to ensure its children are client components.
export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
