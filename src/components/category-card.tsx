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
    <form action={createJobWithCategory}>
      <Card
        className={cn(
          "group cursor-pointer border border-primary/20 bg-card text-left transition-all duration-200 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10",
          className
        )}
      >
        <button type="submit" className="w-full h-full text-left">
          <CardContent className="p-4 flex items-center gap-4 h-full">
            <JobIcon name={category.iconName} className="w-8 h-8 text-primary flex-shrink-0" />
            <div className="flex flex-col">
              <h3 className="font-semibold text-base text-card-foreground">{category.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
            </div>
          </CardContent>
        </button>
      </Card>
    </form>
  );
}
