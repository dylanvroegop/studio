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
import { GevelbekledingDrawing } from './GevelbekledingDrawing';
import { GlasDrawing } from './GlasDrawing';
import { KozijnMaatwerkDrawing } from './KozijnMaatwerkDrawing';
import { SchuttingDrawing } from './SchuttingDrawing';

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
    onKoofChange?: (updated: any[]) => void;
    doorEnabled?: boolean;
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
    onKoofChange,
    onDataGenerated,
    ...props
}: VisualizerControllerProps) {
    const normalizedItem = {
        ...item,
        koven: item?.koven ?? []
    };

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
                    item={normalizedItem}
                    className={className}
                    fitContainer={fitContainer}
                    startFromRight={item.startFromRight}
                    startLattenFromBottom={item.startLattenFromBottom}
                    onOpeningsChange={onOpeningsChange}
                    onKoofChange={onKoofChange}
                    title={props.title}
                />
            );
        }
        return (
            <CeilingWoodDrawing
                item={normalizedItem}
                className={className}
                fitContainer={fitContainer}
                startFromRight={item.startFromRight}
                startLattenFromBottom={item.startLattenFromBottom}
                onOpeningsChange={onOpeningsChange}
                onKoofChange={onKoofChange}
                onEdgeChange={onEdgeChange}
                onDataGenerated={onDataGenerated}
                showEdgeControls={slug.includes('vliering')}
                gridLabel={props.gridLabel !== undefined ? props.gridLabel : ((slug.includes('vloer') || slug.includes('vlonder') || slug.includes('balklaag')) ? null : undefined)}
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
        const toPositiveNum = (value: any): number | undefined => {
            const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
            return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
        };
        const roofLatafstand =
            toPositiveNum(item.latafstand) ??
            toPositiveNum(item.rachelafstand) ??
            toPositiveNum(item.werkende_hoogte_mm);
        const halfLatafstandFromBottom =
            item.halfLatafstandFromBottom ?? slug.includes('hellend-dak');
        const mirrorBadgeText =
            slug.includes('hellend-dak') && item.hellend_dak_mirror
                ? '2x calculatie'
                : undefined;

        if (slug.includes('epdm-dakbedekking')) {
            return (
                <EPDMDrawing
                    {...normalizedItem}
                    openings={item.openings}
                    dakrandWidth={50}
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
                    lengte={item.hoogte ?? item.breedte}
                    hoogte={item.lengte}
                    balkafstand={item.balkafstand}
                    startFromRight={item.startFromRight}
                    includeTopBottomGording={item.includeTopBottomGording}
                    aantalDaken={item.aantal_daken}
                    tussenmuur={item.tussenmuur}
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
                {...normalizedItem}
                balkafstand={item.balkafstand}
                latafstand={roofLatafstand}
                openings={item.openings}
                variant={item.variant}
                isMagnifier={isMagnifier}
                fitContainer={fitContainer}
                className={className}
                onOpeningsChange={onOpeningsChange}
                includeOuterBattens={slug.includes('hellend-dak')}
                halfLatafstandFromBottom={halfLatafstandFromBottom}
                mirrorBadgeText={mirrorBadgeText}
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
        const balkNum = toNum(item.balkafstand, 0);
        const latVz = toNum(item.latafstand, 300);
        const latOz = toNum(item.onderzijde_latafstand) || latVz;
        const boeiOrientation = item.boeiboord_orientation === 'slope' ? 'slope' : 'horizontal';
        const boeiAngle = toNum(item.boeiboord_angle, 45);
        const boeiMirror = !!item.boeiboord_mirror;

        // Internal handler to merge emissions from two drawings
        const handleBoeiData = (side: 'voorzijde' | 'onderzijde', data: any) => {
            // We use a functional update approach if we had local state, 
            // but here we just pass a combined object to the parent's onDataGenerated.
            // Note: Since this controller is re-rendered on setiap change, we can't easily
            // keep a persistent 'merged' object without local state.
            // However, the parent updateItem will overwrite the whole 'calculatedData' field.
            // To properly merge, we might need a local state in this component.
            onDataGenerated?.({
                ...item.calculatedData,
                [side]: data
            });
        };

        return (
            <div className="flex flex-col gap-4">
                <BoeiboordDrawing
                    lengte={vzLengte}
                    hoogte={vzHoogte}
                    balkafstand={balkNum}
                    latafstand={latVz}
                    surroundingBeams={item.surroundingBeams}
                    lattenOrientation={item.latten_orientation}
                    title="Voorzijde"
                    startLattenFromBottom={item.startLattenFromBottom}
                    startFromRight={item.startFromRight}
                    doubleEndBattens={item.doubleEndBattens}
                    boeiboordOrientation={boeiOrientation}
                    boeiboordAngle={boeiAngle}
                    boeiboordMirror={boeiMirror}
                    shape={item.shape as 'rectangle' | 'slope' | 'gable' | undefined}
                    onDataGenerated={(data) => handleBoeiData('voorzijde', data)}
                />
                <BoeiboordDrawing
                    lengte={ozLengte}
                    hoogte={ozBreedte}
                    balkafstand={balkNum}
                    latafstand={latOz}
                    surroundingBeams={item.surroundingBeams}
                    lattenOrientation={item.latten_orientation}
                    title="Onderzijde"
                    startLattenFromBottom={item.startLattenFromBottom}
                    startFromRight={item.startFromRight}
                    doubleEndBattens={item.doubleEndBattens}
                    boeiboordMirror={boeiMirror}
                    mirrorBadgeText={boeiMirror ? '2x calculatie' : undefined}
                    onDataGenerated={(data) => handleBoeiData('onderzijde', data)}
                />
            </div>
        );
    }

    if (slug.includes('gevelbekleding')) {
        const toNum = (v: any, fb = 0) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || fb);
        const lengte = toNum(item.lengte);
        const hoogte = toNum(item.hoogte || item.breedte);
        const balkNum = toNum(item.balkafstand, 0);
        return (
            <GevelbekledingDrawing
                lengte={lengte}
                hoogte={hoogte}
                shape={item.shape as 'rectangle' | 'slope' | 'gable' | 'l-shape' | 'u-shape' | undefined}
                hoogteLinks={item.hoogteLinks}
                hoogteRechts={item.hoogteRechts}
                hoogteNok={item.hoogteNok}
                lengte1={item.lengte1}
                hoogte1={item.hoogte1}
                lengte2={item.lengte2}
                hoogte2={item.hoogte2}
                lengte3={item.lengte3}
                hoogte3={item.hoogte3}
                variant={item.variant}
                balkafstand={balkNum}
                latafstand={item.latafstand}
                tengelafstand={item.tengelafstand}
                startLattenFromBottom={item.startLattenFromBottom}
                latten_orientation={item.latten_orientation}
                doubleEndBattens={item.doubleEndBattens}
                startTengelFromBottom={item.startTengelFromBottom}
                tengel_orientation={item.tengel_orientation}
                doubleEndTengels={item.doubleEndTengels}
                gevelProfielLinks={item.gevel_profiel_links}
                gevelProfielRechts={item.gevel_profiel_rechts}
                openings={item.openings}
                dagkanten={item.dagkanten}
                vensterbanken={item.vensterbanken}
                koven={normalizedItem.koven}
                onKoofChange={onKoofChange}
                onOpeningsChange={onOpeningsChange}
                className={className}
                fitContainer={fitContainer}
                isMagnifier={isMagnifier}
                startFromRight={item.startFromRight}
                title={item.subtitle || item.title}
                doubleEndBeams={item.doubleEndBeams}
                // Plates
                doubleTopPlate={item.doubleTopPlate}
                doubleBottomPlate={item.doubleBottomPlate}
                onDataGenerated={onDataGenerated}
            />
        );
    }

    if (isWallCategory) {
        return (
            <WallDrawing
                {...normalizedItem}
                balkafstand={item.balkafstand}
                openings={item.openings}
                variant={item.variant}
                isMagnifier={isMagnifier}
                fitContainer={fitContainer}
                className={className}
                onOpeningsChange={onOpeningsChange}
                onKoofChange={onKoofChange}
                onDataGenerated={onDataGenerated}
                {...props}
            />
        );
    }

    // 3b. KOZIJN MAATWERK
    if (slug.includes('maatwerk-kozijnen')) {
        const doorVak = Array.isArray(item?.vakken)
            ? item.vakken.find((v: any) => String(v?.type || '').toLowerCase() === 'deur')
            : null;
        const num = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0);
        const doorWidth = num(doorVak?.breedte ?? doorVak?.width);
        const doorHeight = num(doorVak?.hoogte ?? doorVak?.height);
        return (
            <KozijnMaatwerkDrawing
                breedte={item.breedte}
                hoogte={item.hoogte}
                frameThickness={props.frameThickness}
                tussenstijlThickness={props.tussenstijlThickness}
                tussenstijlOffset={props.tussenstijlOffset}
                tussenstijlen={item.tussenstijlen}
                vakken={item.vakken}
                doorWidth={doorWidth}
                doorHeight={doorHeight}
                glasWidth={item.glas_breedte}
                glasHeight={item.glas_hoogte}
                paneelWidth={item.paneel_breedte}
                paneelHeight={item.paneel_hoogte}
                openWidth={item.open_breedte}
                openHeight={item.open_hoogte}
                fitContainer={fitContainer}
                className={className}
                title={props.title}
                doorPosition={item.doorPosition}
                doorSwing={item.doorSwing || 'left'}
            />
        );
    }

    // 3c. SCHUTTING (Fences)
    if (slug.includes('schutting')) {
        const toNum = (v: any, fb = 0) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || fb);
        return (
            <SchuttingDrawing
                lengte={toNum(item.lengte)}
                hoogte={toNum(item.hoogte)}
                paalafstand={toNum(item.paalafstand, 1500)}
                plank_richting={item.plank_richting}
                type_schutting={item.type_schutting}
                betonband_hoogte={toNum(item.betonband_hoogte)}
                fitContainer={fitContainer}
                className={className}
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
