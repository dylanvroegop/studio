/**
 * Raveelwerk (Structural Reinforcement) Utility
 * 
 * This module calculates the geometry for structural reinforcement around openings
 * in wooden frame constructions. When an opening interrupts the beam grid, 
 * raveelwerk adds:
 * - Horizontal headers that span from the opening to the nearest existing vertical beams
 * - Vertical trimmers on the sides of the opening between the headers
 */

export interface RaveelwerkParams {
    /** Opening position from left edge (mm) */
    openingFromLeft: number;
    /** Opening width (mm) */
    openingWidth: number;
    /** Opening height (mm) */
    openingHeight: number;
    /** Opening position from bottom/top edge (mm) */
    openingFromBottom: number;
    /** Array of existing vertical beam center positions (mm from left) */
    existingBeamCenters: number[];
    /** Width of the beams (mm) - typically 70mm for wood frame */
    beamWidth?: number;
    /** Total height of the wall/ceiling (mm) */
    totalHeight: number;
}

export interface RaveelwerkBeam {
    /** Type of beam: 'header' (horizontal) or 'trimmer' (vertical) */
    type: 'header' | 'trimmer';
    /** Position: 'top', 'bottom', 'left', 'right' */
    position: 'top' | 'bottom' | 'left' | 'right';
    /** X coordinate of beam start (mm from left) */
    x: number;
    /** Y coordinate of beam start (mm from bottom) */
    y: number;
    /** Length of the beam (mm) */
    length: number;
    /** Width of the beam (mm) */
    width: number;
    /** Is the beam horizontal (true) or vertical (false) */
    isHorizontal: boolean;
}

export interface RaveelwerkGeometry {
    /** All beams needed for the raveelwerk */
    beams: RaveelwerkBeam[];
    /** The left beam center that the header extends to */
    leftBeamCenter: number;
    /** The right beam center that the header extends to */
    rightBeamCenter: number;
}

/**
 * Find the nearest beam center to the left of a given position
 */
function findNearestBeamLeft(position: number, beamCenters: number[], beamWidth: number): number {
    // Find the closest beam center to the left of the position
    const leftBeams = beamCenters.filter(c => c + beamWidth / 2 <= position);
    if (leftBeams.length === 0) {
        // If no beam to the left, use the edge (0)
        return beamWidth / 2; // First beam at edge
    }
    return Math.max(...leftBeams);
}

/**
 * Find the nearest beam center to the right of a given position
 */
function findNearestBeamRight(position: number, beamCenters: number[], beamWidth: number, totalLength: number): number {
    // Find the closest beam center to the right of the position
    const rightBeams = beamCenters.filter(c => c - beamWidth / 2 >= position);
    if (rightBeams.length === 0) {
        // If no beam to the right, use the far edge
        return totalLength - beamWidth / 2; // Last beam at edge
    }
    return Math.min(...rightBeams);
}

/**
 * Calculate the raveelwerk geometry for an opening
 * 
 * The structure looks like this (viewed from above for ceiling):
 * 
 *    |     |                          |     |
 *    |  V  |                          |  V  |   <- Existing vertical beams
 *    |     |                          |     |
 *    |     |==========================|     |   <- Top header (H)
 *    |     |  |                    |  |     |
 *    |     |  |                    |  |     |   <- Vertical trimmers (T)
 *    |     |  |      OPENING       |  |     |
 *    |     |  |                    |  |     |
 *    |     |  |                    |  |     |
 *    |     |==========================|     |   <- Bottom header (H)
 *    |     |                          |     |
 *    |  V  |                          |  V  |
 *    |     |                          |     |
 * 
 * Headers span from existing beam edge to existing beam edge.
 * Trimmers span from top header to bottom header (excluding header thickness).
 */
export function calculateRaveelwerk(params: RaveelwerkParams): RaveelwerkGeometry {
    const {
        openingFromLeft,
        openingWidth,
        openingHeight,
        openingFromBottom,
        existingBeamCenters,
        beamWidth = 70
    } = params;

    const beams: RaveelwerkBeam[] = [];
    const halfBeam = beamWidth / 2;

    // Calculate opening boundaries
    const openingLeft = openingFromLeft;
    const openingRight = openingFromLeft + openingWidth;
    const openingBottom = openingFromBottom;
    const openingTop = openingFromBottom + openingHeight;

    // Find the nearest existing beams on either side
    // The total length can be derived from the rightmost beam position, but we need it passed
    // For now, assume the last beam center + halfBeam gives us a good estimate
    const maxBeamPos = Math.max(...existingBeamCenters) + halfBeam * 2;

    const leftBeamCenter = findNearestBeamLeft(openingLeft, existingBeamCenters, beamWidth);
    const rightBeamCenter = findNearestBeamRight(openingRight, existingBeamCenters, beamWidth, maxBeamPos);

    // Header positions (where headers start and end)
    // Headers go from the inner edge of left beam to inner edge of right beam
    const headerStartX = leftBeamCenter + halfBeam; // Right edge of left beam
    const headerEndX = rightBeamCenter - halfBeam;   // Left edge of right beam
    const headerLength = headerEndX - headerStartX;

    // Only add beams if there's actually space for them
    if (headerLength > 0) {
        // === TOP HEADER ===
        // Positioned just above the opening
        beams.push({
            type: 'header',
            position: 'top',
            x: headerStartX,
            y: openingTop, // Top of opening, header starts here going up
            length: headerLength,
            width: beamWidth,
            isHorizontal: true
        });

        // === BOTTOM HEADER ===
        // Positioned just below the opening
        beams.push({
            type: 'header',
            position: 'bottom',
            x: headerStartX,
            y: openingBottom - beamWidth, // Header is below the opening
            length: headerLength,
            width: beamWidth,
            isHorizontal: true
        });
    }

    // === VERTICAL TRIMMERS ===
    // These go on the sides of the opening, spanning between the headers
    // They abut the headers (don't overlap)

    const trimmerHeight = openingHeight; // Same as opening height
    const trimmerY = openingBottom; // Same Y as opening starts

    // Left Trimmer (just to the left of the opening)
    if (openingLeft > headerStartX + beamWidth) {
        // There's space for a trimmer
        beams.push({
            type: 'trimmer',
            position: 'left',
            x: openingLeft - beamWidth, // Trimmer is to the left of opening
            y: trimmerY,
            length: trimmerHeight,
            width: beamWidth,
            isHorizontal: false
        });
    }

    // Right Trimmer (just to the right of the opening)
    if (openingRight < headerEndX - beamWidth) {
        // There's space for a trimmer
        beams.push({
            type: 'trimmer',
            position: 'right',
            x: openingRight, // Trimmer starts at right edge of opening
            y: trimmerY,
            length: trimmerHeight,
            width: beamWidth,
            isHorizontal: false
        });
    }

    return {
        beams,
        leftBeamCenter,
        rightBeamCenter
    };
}

/**
 * Convert raveelwerk geometry to SVG coordinates
 * 
 * @param geometry - The calculated raveelwerk geometry
 * @param startX - SVG X offset for the drawing area
 * @param startY - SVG Y offset for the drawing area  
 * @param rectH - Height of the rectangle in SVG pixels
 * @param pxPerMm - Pixels per millimeter conversion factor
 */
export interface RaveelwerkSVGBeam {
    type: 'header' | 'trimmer';
    position: 'top' | 'bottom' | 'left' | 'right';
    /** SVG X coordinate */
    svgX: number;
    /** SVG Y coordinate */
    svgY: number;
    /** SVG width (px) */
    svgWidth: number;
    /** SVG height (px) */
    svgHeight: number;
}

export function raveelwerkToSVG(
    geometry: RaveelwerkGeometry,
    startX: number,
    startY: number,
    rectH: number,
    pxPerMm: number
): RaveelwerkSVGBeam[] {
    return geometry.beams.map(beam => {
        if (beam.isHorizontal) {
            // Horizontal beam (header)
            const svgX = startX + beam.x * pxPerMm;
            // Y coordinate: SVG Y increases downward, our Y is from bottom
            const svgY = (startY + rectH) - (beam.y + beam.width) * pxPerMm;
            const svgWidth = beam.length * pxPerMm;
            const svgHeight = beam.width * pxPerMm;

            return {
                type: beam.type,
                position: beam.position,
                svgX,
                svgY,
                svgWidth,
                svgHeight
            };
        } else {
            // Vertical beam (trimmer)
            const svgX = startX + beam.x * pxPerMm;
            // For vertical beams, Y is from bottom, length goes upward
            const svgY = (startY + rectH) - (beam.y + beam.length) * pxPerMm;
            const svgWidth = beam.width * pxPerMm;
            const svgHeight = beam.length * pxPerMm;

            return {
                type: beam.type,
                position: beam.position,
                svgX,
                svgY,
                svgWidth,
                svgHeight
            };
        }
    });
}
