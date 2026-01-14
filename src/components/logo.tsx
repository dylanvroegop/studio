import { FileText, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
    className?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Logo({ className, size = 'md' }: LogoProps) {
    // Size mapping for the container and sub-elements
    const sizeClasses = {
        sm: {
            text: 'text-lg',
            iconContainer: 'h-6 w-6',
            icon: 'h-6 w-6',
            check: 'h-3.5 w-3.5 -right-0.5 -bottom-0.5',
            lines: 'h-4 w-4 -left-3',
            gap: 'gap-1.5'
        },
        md: {
            text: 'text-xl',
            iconContainer: 'h-8 w-8',
            icon: 'h-8 w-8',
            check: 'h-5 w-5 -right-1 -bottom-1',
            lines: 'h-6 w-6 -left-5',
            gap: 'gap-2'
        },
        lg: {
            text: 'text-3xl',
            iconContainer: 'h-12 w-12',
            icon: 'h-12 w-12',
            check: 'h-7 w-7 -right-1.5 -bottom-1.5',
            lines: 'h-8 w-8 -left-7',
            gap: 'gap-3'
        },
        xl: {
            text: 'text-4xl',
            iconContainer: 'h-16 w-16',
            icon: 'h-16 w-16',
            check: 'h-9 w-9 -right-2 -bottom-2',
            lines: 'h-10 w-10 -left-9',
            gap: 'gap-4'
        }
    };

    const s = sizeClasses[size];

    return (
        <div className={cn("flex items-center select-none", s.gap, className)}>
            <div className={cn("relative flex items-center justify-center", s.iconContainer)}>
                {/* Speed Lines */}
                <svg
                    className={cn("absolute text-white/50", s.lines)}
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path d="M20 12H4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-100" />
                    <path d="M18 6H8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-80" />
                    <path d="M22 18H6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-80" />
                </svg>

                {/* Paper Icon */}
                <FileText className={cn("text-white fill-white/10 z-10", s.icon)} />

                {/* Checkmark Overlay */}
                <Check className={cn("absolute z-20 text-red-600 font-bold stroke-[4]", s.check)} />
            </div>

            <span className={cn("font-bold tracking-tight", s.text)}>
                <span className="text-white">Offerte</span>
                <span className="text-red-600">Hulp</span>
            </span>
        </div>
    );
}
