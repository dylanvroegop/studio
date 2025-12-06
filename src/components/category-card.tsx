'use client';

import { Card, CardContent } from '@/components/ui/card';
import { createJobAction } from '@/lib/actions';
import type { JobCategory } from '@/lib/types';
import { cn } from '@/lib/utils';
import { JobIcon, type IconName } from '@/components/icons';
import { useState } from 'react';
import { useRouter } from 'next/navigation';


interface CategoryCardProps {
  quoteId: string;
  category: {
    name: JobCategory;
    description: string;
    iconName: IconName;
  };
  className?: string;
}

export function CategoryCard({ quoteId, category, className }: CategoryCardProps) {
  const [isSelected, setIsSelected] = useState(false);
  const router = useRouter();
  
  const createJobWithCategory = createJobAction.bind(
    null,
    quoteId,
    category.name,
    `Nieuwe klus: ${category.name}`
  );

  const handleClick = (e: React.MouseEvent<HTMLFormElement>) => {
    if (category.name === 'Afwerkingen') {
      e.preventDefault();
      setIsSelected(true);
      router.push(`/offertes/${quoteId}/klus/afwerkingen`);
      return;
    }
    if (category.name === 'Dakrenovatie') {
      e.preventDefault();
      setIsSelected(true);
      router.push(`/offertes/${quoteId}/klus/dakrenovatie`);
      return;
    }
    if (category.name === 'Plafonds') {
      e.preventDefault();
      setIsSelected(true);
      router.push(`/offertes/${quoteId}/klus/plafonds`);
      return;
    }
    if (category.name === 'Wanden') {
      e.preventDefault();
      setIsSelected(true);
      router.push(`/offertes/${quoteId}/klus/wanden`);
      return;
    }
    if (category.name === 'Vloeren') {
      e.preventDefault();
      setIsSelected(true);
      router.push(`/offertes/${quoteId}/klus/vloeren`);
      return;
    }
    if (category.name === 'Kozijnen') {
      e.preventDefault();
      setIsSelected(true);
      router.push(`/offertes/${quoteId}/klus/kozijnen`);
      return;
    }
    if (category.name === 'Gevelbekleding') {
      e.preventDefault();
      setIsSelected(true);
      router.push(`/offertes/${quoteId}/klus/gevelbekleding`);
      return;
    }
    if (category.name === 'Deuren') {
      e.preventDefault();
      setIsSelected(true);
      router.push(`/offertes/${quoteId}/klus/deuren`);
      return;
    }
    if (category.name === 'Boeiboorden') {
      e.preventDefault();
      setIsSelected(true);
      router.push(`/offertes/${quoteId}/klus/boeiboorden`);
      return;
    }
    if (category.name === 'Glas zetten') {
      e.preventDefault();
      setIsSelected(true);
      router.push(`/offertes/${quoteId}/klus/glas-zetten`);
      return;
    }
    setIsSelected(true);
  }

  return (
    <form action={createJobWithCategory} className="h-full" onClick={handleClick}>
      <Card
        className={cn(
          "group h-[110px] cursor-pointer text-left transition-all duration-200 rounded-xl bg-[#131313] border shadow-soft-sm hover:scale-[1.02] active:scale-[0.98]",
          isSelected ? "border-primary/80 bg-[#1c1c1c]" : "border-[rgba(255,0,0,0.2)]",
          "hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10",
          className
        )}
      >
        <button type="submit" className="w-full h-full text-left">
          <CardContent className="p-4 flex items-center gap-4 h-full">
            <JobIcon name={category.iconName} className="w-6 h-6 text-primary flex-shrink-0" />
            <div className="flex flex-col">
              <h3 className="font-semibold text-base text-white">{category.name}</h3>
              <p className="text-sm text-[#A3A3A3] mt-1 font-normal">{category.description}</p>
            </div>
          </CardContent>
        </button>
      </Card>
    </form>
  );
}

declare module 'react' {
    interface CSSProperties {
        [key: `--${string}`]: string | number;
    }
}
