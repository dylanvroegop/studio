import type { SVGProps } from "react";
import { PlusCircle } from "lucide-react";

export type IconName = "wall" | "ceiling" | "floor" | "roof" | "frame" | "plus" | "fascia" | "door" | "siding" | "glass" | "finishing" | "window" | "fence" | "pergola";

export function WallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M12 3v18" />
      <path d="M3 8h18" />
      <path d="M3 16h18" />
    </svg>
  );
}

export function CeilingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M5 16h14" />
      <path d="M5 12h14" />
      <path d="M5 8h14" />
      <rect width="20" height="20" x="2" y="2" rx="2" />
    </svg>
  );
}

export function FloorIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            <path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5" />
            <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2" />
            <path d="M12 12 4 8" />
            <path d="M12 12 20 8" />
            <path d="m12 12 1-9" />
            <path d="m12 12 8 5" />
            <path d="m12 12-8 5" />
        </svg>
    );
}

export function RoofIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m12 2 10 9H2Z" />
      <path d="M4 21V11" />
      <path d="M10 21V11" />
      <path d="M16 21V11" />
      <path d="M20 21V11" />
    </svg>
  );
}

export function FrameIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
        <path d="M3 3h18v18H3z"/>
        <path d="M7 7h10v10H7z"/>
        <path d="M7 12h10"/>
        <path d="M12 7v10"/>
    </svg>
  );
}

export function FasciaIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M2 22h20"/><path d="M3 10h18v10H3z"/><path d="M2 10l9-7 9 7"/></svg>
    )
}

export function DoorIcon(props: SVGProps<SVGSVGElement>) {
    return (
       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><path d="M10 12h.01"/></svg>
    )
}

export function SidingIcon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M2 12h20"/><path d="M2 16h20"/><path d="M2 8h20"/><path d="M2 20h20"/><path d="M10 4.5 9 3"/><path d="M14 4.5 13 3"/><path d="M18 4.5 17 3"/></svg>
    )
}

export function GlassIcon(props: SVGProps<SVGSVGElement>) {
    return (
       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 21a9 9 0 0 0-9-9c0-4.97 4.03-9 9-9s9 4.03 9 9a9 9 0 0 0-9 9z"/><path d="M12 3v18"/><path d="M3 12h18"/></svg>
    )
}

export function FinishingIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 21h18"/><path d="M4 21V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13"/><path d="M8 12h8"/><path d="M8 16h8"/><path d="M8 21v-4"/></svg>
    )
}

export function WindowIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 3h18v18H3z"/><path d="M3 12h18"/><path d="M12 3v18"/></svg>
    )
}

export function FenceIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16"/><path d="M4 9h16"/><path d="M4 15h16"/><path d="m9 2-1 3"/><path d="m15 2-1 3"/></svg>
    )
}

export function PergolaIcon(props: SVGProps<SVGSVGElement>) {
    return (
       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16"/><path d="M4 9h16"/><path d="M12 9V3"/><path d="M12 21V9"/></svg>
    )
}


const icons: Record<IconName, React.ElementType> = {
  wall: WallIcon,
  ceiling: CeilingIcon,
  floor: FloorIcon,
  roof: RoofIcon,
  frame: FrameIcon,
  plus: PlusCircle,
  fascia: FasciaIcon,
  door: DoorIcon,
  siding: SidingIcon,
  glass: GlassIcon,
  finishing: FinishingIcon,
  window: WindowIcon,
  fence: FenceIcon,
  pergola: PergolaIcon,
};

export function JobIcon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const Icon = icons[name];
  if (!Icon) {
    return null;
  }
  return <Icon {...props} />;
}
