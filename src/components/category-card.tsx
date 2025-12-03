'use client';

import { Card, CardContent } from '@/components/ui/card';
import { createJobAction } from '@/lib/actions';
import type { JobCategory } from '@/lib/types';
import { cn } from '@/lib/utils';
import { JobIcon, type IconName } from '@/components/icons';


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
  const createJobWithCategory = createJobAction.bind(
    null,
    quoteId,
    category.name,
    `Nieuwe klus: ${category.name}`
  );

  return (
    <form action={createJobWithCategory} className="h-full">
      <Card
        className={cn(
          "group h-[120px] cursor-pointer text-left transition-all duration-200 rounded-xl bg-[#131313] border border-[rgba(255,0,0,0.2)] hover:border-[#C40000]/50 hover:shadow-lg hover:shadow-[#C40000]/10",
          className
        )}
      >
        <button type="submit" className="w-full h-full text-left">
          <CardContent className="p-4 flex items-center gap-4 h-full">
            <JobIcon name={category.iconName} className="w-8 h-8 text-[#C40000] flex-shrink-0" />
            <div className="flex flex-col">
              <h3 className="font-semibold text-base text-white">{category.name}</h3>
              <p className="text-sm text-[#A3A3A3] mt-1">{category.description}</p>
            </div>
          </CardContent>
        </button>
      </Card>
    </form>
  );
}
