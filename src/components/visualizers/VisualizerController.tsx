import React from 'react';
import { WallDrawing } from './WallDrawing';
import { SimpleDrawing } from './SimpleDrawing';
import { CeilingWoodDrawing } from './CeilingWoodDrawing';
import { MetalStudCeilingDrawing } from './MetalStudCeilingDrawing';
import { RoofDrawing } from './RoofDrawing';
import { EPDMDrawing } from './EPDMDrawing';
import { GolfplaatDrawing } from './GolfplaatDrawing';

interface VisualizerControllerProps {
    category: string;
    slug: string;
    item: any; // Using any for flexibility with the 'item' structure which varies
    fields: any[]; // Array of field definitions
    isMagnifier?: boolean;
    fitContainer?: boolean;
    className?: string;
    // Pass-through handlers
    onOpeningsChange?: (newOpenings: any[]) => void;
    onEdgeChange?: (side: string, value: string) => void;
    onDataGenerated?: (data: any) => void;
    // ... allow other props
    [key: string]: any;
}

export function VisualizerController({
    category,
    slug,
    item,
    fields,
    isMagnifier,
    fitContainer,
    className,
    onOpeningsChange,
    onEdgeChange,
    ...props
}: VisualizerControllerProps) {

    // 1. CEILING / SURFACE MODE (Use strict CeilingDrawing)
    // Priority: HIGH (Must be checked before walls to prevent 'balkafstand' confusion)
    const surfaceSlugs = [
        'plafond-houten-framework', 'plafond-metalstud',
        'massief-houten-vloer', 'laminaat-pvc',
        'vlonder-terras', 'balklaag-constructievloer', 'vliering-maken'
    ];
    const isSurface = surfaceSlugs.some(s => slug.includes(s)) || category === 'vloeren' || category === 'plafonds';

    if (isSurface) {
        if (slug.includes('plafond-metalstud')) {
            return (
                <MetalStudCeilingDrawing
                    item={item}
                    className={className}
                    fitContainer={fitContainer}
                    startFromRight={item.startFromRight}
                    startLattenFromBottom={item.startLattenFromBottom}
                    onOpeningsChange={onOpeningsChange}
                />
            );
        }
        return (
            <CeilingWoodDrawing
                item={item}
                className={className}
                fitContainer={fitContainer}
                startFromRight={item.startFromRight}
                startLattenFromBottom={item.startLattenFromBottom}
                onOpeningsChange={onOpeningsChange}
                gridLabel={props.gridLabel !== undefined ? props.gridLabel : ((slug.includes('vloer') || slug.includes('vlonder') || slug.includes('balklaag') || slug.includes('vliering')) ? 'Vloer Vlak' : undefined)}
            />
        );
    }

    // 2. ROOF_MODE (Sloped/Angled Shapes)
    // Priority: HIGH (Must be checked before walls because roofs also have 'balkafstand')
    const roofSlugs = [
        'hellend-dak', 'epdm-dakbedekking', 'golfplaat-dak',
        'dakkapel-nieuw', 'dakkapel-renovatie'
    ];
    const isRoof = roofSlugs.some(s => slug.includes(s)) || category === 'dakwerken' || category === 'dakrenovatie';

    if (isRoof) {
        if (slug.includes('epdm-dakbedekking')) {
            return (
                <EPDMDrawing
                    {...item}
                    openings={item.openings}
                    dakrandWidth={item.dakrand_breedte}
                    edgeTop={item.edge_top}
                    edgeBottom={item.edge_bottom}
                    edgeLeft={item.edge_left}
                    edgeRight={item.edge_right}
                    isMagnifier={isMagnifier}
                    fitContainer={fitContainer}
                    className={className}
                    onOpeningsChange={onOpeningsChange}
                    onEdgeChange={onEdgeChange}
                    {...props}
                />
            );
        }

        if (slug.includes('golfplaat-dak')) {
            return (
                <GolfplaatDrawing
                    lengte={item.lengte}
                    hoogte={item.breedte}
                    openings={item.openings}
                    fitContainer={fitContainer}
                    className={className}
                    onOpeningsChange={onOpeningsChange}
                    {...props}
                />
            );
        }

        return (
            <RoofDrawing
                {...item}
                balkafstand={item.balkafstand}
                latafstand={item.latafstand || item.rachelafstand}
                openings={item.openings}
                variant={item.variant}
                isMagnifier={isMagnifier}
                fitContainer={fitContainer}
                className={className}
                onOpeningsChange={onOpeningsChange}
                includeOuterBattens={slug.includes('hellend-dak')}
                {...props}
            />
        );
    }

    // 3. WALL_MODE (Detailed Wall Structure)
    const wallSlugs = [
        'hsb-voorzetwand', 'metalstud-voorzetwand', 'hsb-buiten-wand',
        'hsb-tussenwand', 'metalstud-tussenwand', 'knieschotten',
        'cinewall-tv-wand'
    ];
    const isWallCategory =
        category === 'wanden' ||
        wallSlugs.some(s => slug.includes(s)) ||
        (fields && fields.some(f => f.key === 'balkafstand'));

    if (isWallCategory) {
        return (
            <WallDrawing
                {...item}
                balkafstand={item.balkafstand}
                openings={item.openings}
                variant={item.variant}
                isMagnifier={isMagnifier}
                fitContainer={fitContainer}
                className={className}
                onOpeningsChange={onOpeningsChange}
                onDataGenerated={props.onDataGenerated}
                {...props}
            />
        );
    }

    // 4. LINEAR_MODE (Strips/Profiles)
    const linearSlugs = [
        'boeiboorden-vervangen', 'windveren-vervangen',
        'plinten-afwerklatten', 'dagkanten',
        'vensterbanken', 'waterslagen-dorpels'
    ];
    const isLinear = linearSlugs.some(s => slug.includes(s));

    if (isLinear) {
        return <SimpleDrawing item={item} mode="linear" className={className} fitContainer={fitContainer} />;
    }

    // 5. OBJECT_MODE (Cabinets, Doors)
    const objectSlugs = [
        'inbouwkasten', 'meubel-op-maat',
        'binnendeur-afhangen', 'buitendeur-afhangen',
        'kozijnen'
    ];
    const isObject = objectSlugs.some(s => slug.includes(s)) || category === 'kozijnen';

    if (isObject) {
        return <SimpleDrawing item={item} mode="object" className={className} fitContainer={fitContainer} />;
    }

    // 6. GENERIC FALLBACK
    return (
        <SimpleDrawing
            item={item}
            mode="box" // Default to box
            className={className}
            fitContainer={fitContainer}
        />
    );
}
