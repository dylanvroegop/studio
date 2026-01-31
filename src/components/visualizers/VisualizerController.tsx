/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { WallDrawing } from './WallDrawing';
import { SimpleDrawing } from './SimpleDrawing';
import { CeilingWoodDrawing } from './CeilingWoodDrawing';
import { MetalStudCeilingDrawing } from './MetalStudCeilingDrawing';
import { RoofDrawing } from './RoofDrawing';
import { EPDMDrawing } from './EPDMDrawing';
import { GolfplaatDrawing } from './GolfplaatDrawing';
import { BoeiboordDrawing } from './BoeiboordDrawing';
import { GlasDrawing } from './GlasDrawing';

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
                    title={props.title}
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
                title={props.title}
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
                edgeLeft={item.edge_left || item.edgeLeft}
                edgeRight={item.edge_right || item.edgeRight}
                onEdgeChange={onEdgeChange}
                {...props}
            />
        );
    }

    // 3. WALL_MODE (Detailed Wall Structure)
    const wallSlugs = [
        'hsb-voorzetwand', 'metalstud-voorzetwand', 'hsb-buiten-wand',
        'hsb-tussenwand', 'metalstud-tussenwand', 'knieschotten',
        'cinewall-tv-wand', 'boeiboorden-vervangen'
    ];
    const isWallCategory =
        category === 'wanden' ||
        wallSlugs.some(s => slug.includes(s)) ||
        (fields && fields.some(f => f.key === 'balkafstand'));

    if (slug.includes('isolatieglas') || category === 'glas-zetten') {
        const toNum = (v: any, fb = 0) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || fb);
        return (
            <GlasDrawing
                breedte={toNum(item.breedte)}
                hoogte={toNum(item.hoogte)}
                fitContainer={fitContainer}
                className={className}
            />
        );
    }

    if (slug.includes('boeiboord')) {
        const toNum = (v: any, fb = 0) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || fb);
        const vzLengte = toNum(item.lengte);
        const vzHoogte = toNum(item.hoogte);
        const ozLengte = toNum(item.lengte_onderzijde) || vzLengte;
        const ozBreedte = toNum(item.breedte);
        const balkNum = toNum(item.balkafstand, 600);
        const latVz = toNum(item.latafstand, 300);
        const latOz = toNum(item.onderzijde_latafstand) || latVz;

        return (
            <div className="flex flex-col gap-4">
                <BoeiboordDrawing
                    lengte={vzLengte}
                    hoogte={vzHoogte}
                    balkafstand={balkNum}
                    latafstand={latVz}
                    title="Voorzijde"
                    startLattenFromBottom={item.startLattenFromBottom}
                    doubleEndBattens={item.doubleEndBattens}
                />
                <BoeiboordDrawing
                    lengte={ozLengte}
                    hoogte={ozBreedte}
                    balkafstand={balkNum}
                    latafstand={latOz}
                    title="Onderzijde"
                    startLattenFromBottom={item.startLattenFromBottom}
                    doubleEndBattens={item.doubleEndBattens}
                />
            </div>
        );
    }

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
