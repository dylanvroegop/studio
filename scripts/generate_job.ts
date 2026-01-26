
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

// --- CONFIGURATION ---
const USER_ID = 'Xo5AZwKFvQUqoauoNUeNxT5PkAg2';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAPPING_FILE_PATH = path.join(process.cwd(), 'src/lib/ai-agent-mapping.json');

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase credentials in environment');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- TYPES ---
interface Material {
    id: string;
    materiaalnaam: string;
    subsectie: string;
    categorie: string;
    prijs: number;
    eenheid: string;
}

interface AgentMapping {
    hoofdtitel: string;
    subcategorie_label: string;
    subsectie: string;
    Extra_info: string;
    slug: string;
}

interface JobComponent {
    label: string;
    targetSubsection: string;
    description: string;
}

// --- DATA LOADING ---
let AGENT_MAPPINGS: AgentMapping[] = [];
try {
    const raw = fs.readFileSync(MAPPING_FILE_PATH, 'utf-8');
    AGENT_MAPPINGS = JSON.parse(raw);
    console.error(`Loaded ${AGENT_MAPPINGS.length} mappings from ${MAPPING_FILE_PATH}`);
} catch (e) {
    console.error('Failed to load agent mappings:', e);
    process.exit(1);
}

// --- HELPERS ---

function getAvailableJobTitles(): string[] {
    return Array.from(new Set(AGENT_MAPPINGS.map(m => m.hoofdtitel)));
}

function getJobPlan(jobTitle: string): { slug: string, components: JobComponent[] } {
    const relevantMappings = AGENT_MAPPINGS.filter(m => m.hoofdtitel.toLowerCase() === jobTitle.toLowerCase());

    if (relevantMappings.length === 0) {
        throw new Error(`No mappings found for job title: ${jobTitle}`);
    }

    const slug = relevantMappings[0].slug;
    const components = relevantMappings.map(m => ({
        label: m.subcategorie_label,
        targetSubsection: m.subsectie,
        description: m.Extra_info
    }));

    return { slug, components };
}

function extractKeywords(description: string): { positive: string[], negative: string[] } {
    // Simple heuristic: Extract nouns/adjectives? 
    // For now, we manually look for quoted or capitalized terms if possible, or just common construction terms.
    // Actually, let's just use the description to drive "Smart" scoring.
    // But we can extract negative keywords like "Exclusief X" or "negeer X".

    const negative: string[] = [];
    const lower = description.toLowerCase();

    // Naively look for "negeer" or "exclusief"
    if (lower.includes('negeer') || lower.includes('exclusief') || lower.includes('geen')) {
        // e.g. "exclusief montagelijm" -> we blindly assume words following exclusief might be bad?
        // This is partial logic. For now, let's hardcode some common "bad" tool words globally.
        negative.push('mes', 'gereedschap', 'zaag', 'schroef', 'kit', 'lijm');
    }

    return { positive: [], negative };
}

function extractDimensions(name: string): { width: number, depth: number } | null {
    const normalize = name.toLowerCase().replace(/\s/g, '');
    const pairMatch = normalize.match(/(\d+)[x|×|X](\d+)/);
    if (pairMatch) {
        const nums = [parseInt(pairMatch[1]), parseInt(pairMatch[2])].sort((a, b) => a - b);
        return { width: nums[0], depth: nums[1] };
    }
    const singleMatch = normalize.match(/(\d+)mm/);
    if (singleMatch) {
        return { width: 0, depth: parseInt(singleMatch[1]) };
    }
    return null;
}

/**
 * The "Brain" of the operation.
 * Finds a material that matches the Component definition.
 */
function findMaterialForComponent(
    materials: Material[],
    component: JobComponent
): Material | null {

    const targetSub = component.targetSubsection.toLowerCase();
    const description = component.description.toLowerCase();
    const { negative } = extractKeywords(component.description);

    // 1. Filter: Scope (Subsection) w/ Fuzzy Match
    let candidates = materials.filter(m => {
        const dbSub = (m.subsectie || '').toLowerCase();
        const dbCat = (m.categorie || '').toLowerCase();
        return dbSub.includes(targetSub) || targetSub.includes(dbSub) ||
            dbCat.includes(targetSub) || targetSub.includes(dbCat);
    });

    if (candidates.length === 0) {
        // Fallback: If strict scope fails, purely use description matching on the ENTIRE DB?
        // Too risky. Let's log warning.
        // console.warn(`[Brain] No exact scope match for '${component.targetSubsection}'.`);
        return null;
    }

    // 2. Filter: Negative constraints
    candidates = candidates.filter(m => {
        const name = m.materiaalnaam.toLowerCase();
        // Global exclusion for tools in "material" slots unless explicitly requested?
        if (negative.some(neg => name.includes(neg))) return false;

        // Contextual exclusion from description?
        // E.g. description says "Exclusief schroeven". If material is "Schroeven", skip.
        if (description.includes('exclusief') && description.includes('schroef') && name.includes('schroef')) return false;

        return true;
    });

    // 3. Score: Contextual Relevance
    let bestMatch: Material | null = null;
    let highestScore = -Infinity;

    for (const m of candidates) {
        let score = 0;
        const name = m.materiaalnaam.toLowerCase();
        const dims = extractDimensions(m.materiaalnaam);

        // a. Keyword matching from description
        // If description says "Vuren", verify material has "vuren"
        if (description.includes('vuren') && name.includes('vuren')) score += 20;
        if (description.includes('sls') && name.includes('sls')) score += 20;
        if (description.includes('gips') && name.includes('gips')) score += 20;
        if (description.includes('osb') && name.includes('osb')) score += 20;
        if (description.includes('isolatie') && (name.includes('knauf') || name.includes('rockwool'))) score += 10;

        // b. Heuristics based on Component Label (The "Smart" part)
        if (component.label.toLowerCase().includes('staanders')) {
            if (dims && dims.depth >= 60 && dims.depth <= 140) score += 30; // Wall studs
            else if (dims && dims.depth > 160) score -= 50; // Too big
        }

        if (component.label.toLowerCase().includes('isolatie')) {
            // Prefer plates/rolls over tools (double check)
            if (name.includes('mes')) score -= 1000;
        }

        // Random tie-breaker
        score += Math.random() * 5;

        if (score > highestScore) {
            highestScore = score;
            bestMatch = m;
        }
    }

    return bestMatch;
}

function randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function mapMaterial(m: Material) {
    return {
        id: m.id,
        naam: m.materiaalnaam,
        prijs: m.prijs,
        eenheid: m.eenheid
    };
}

// --- LOGIC ---

async function main() {
    console.error('--- AI Agent: Dynamic Job Generator ---');
    console.error(`User ID: ${USER_ID}`);

    // 1. Fetch Materials
    console.error('Fetching database materials...');
    const { data: materials, error } = await supabase
        .from('materialen')
        .select('*')
        .eq('gebruikerid', USER_ID);

    if (error) {
        console.error('Error fetching materials:', error);
        process.exit(1);
    }
    console.error(`Found ${materials.length} total materials.`);

    // 2. Select a Job Goal
    const availableJobs = getAvailableJobTitles();
    // Randomly pick one, OR pick one specific for testing if needed
    // let targetJob = availableJobs[randomInt(0, availableJobs.length - 1)];

    // For DEMO purposes, let's prefer non-HSB to prove it works, or random.
    let targetJob = availableJobs[randomInt(0, availableJobs.length - 1)];

    // Override for testing "Vlizotrap" if it exists, or just let it be random
    if (availableJobs.includes('Vlizotrap')) {
        // targetJob = 'Vlizotrap'; // Uncomment to force Vlizotrap
    }

    console.error(`\n🎯 AGENT GOAL: Building a '${targetJob}'...`);

    // 3. Plan the Job
    const { slug, components } = getJobPlan(targetJob);
    console.error(`📋 PLAN: Found ${components.length} required components.`);
    components.forEach(c => console.error(`   - [${c.label}] (Source: ${c.targetSubsection})`));

    // 4. Execute the Plan (Find Materials)
    const materialSelections: Record<string, any> = {};

    console.error(`\n🔍 EXECUTING SEARCH...`);
    for (const comp of components) {
        // Map label to a key-friendly string (e.g. "Staanders & Liggers" -> "staanders_en_liggers")
        const key = comp.label.toLowerCase().replace(/ & /g, '_en_').replace(/\s/g, '_').replace(/\//g, '_');

        const match = findMaterialForComponent(materials, comp);
        if (match) {
            console.error(`   ✅ Found for '${comp.label}': ${match.materiaalnaam}`);
            materialSelections[key] = mapMaterial(match);
        } else {
            console.error(`   ❌ No match for '${comp.label}' (Criteria: ${comp.targetSubsection})`);
            // Optional: fallback?
        }
    }

    // 5. Build Result
    const width = randomInt(2000, 5000);
    const height = randomInt(2400, 3000);

    const job = {
        id: randomUUID(),
        volgorde: 1,
        type: slug,
        slug: slug,
        titel: `AI Generated: ${targetJob}`,
        omschrijving: `Automatisch gegenereerde '${targetJob}' (${width}x${height}mm)`,
        maatwerk: [
            {
                label: 'Basis',
                shape: 'rectangle',
                lengte: width,
                hoogte: height,
                diepte: 120,
                openings: []
            }
        ],
        materialen: {
            selections: materialSelections,
            custommateriaal: {}
        },
        kleinMateriaal: {
            mode: 'percentage',
            percentage: 5
        }
    };

    console.log(JSON.stringify([job], null, 2));
}

main().catch(console.error);
