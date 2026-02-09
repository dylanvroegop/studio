import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log('=== Generate Email Debug ===');
        console.log('N8N_HEADER_SECRET exists:', !!process.env.N8N_HEADER_SECRET);
        console.log('Request body:', JSON.stringify(body, null, 2));

        const webhookUrl = process.env.NEXT_PUBLIC_N8N_GENERATE_EMAIL_WEBHOOK || 'https://n8n.dylan8n.org/webhook/025e690d-bca9-44a2-8359-9c724ce9d426';

        let data;
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-offertehulp-secret': process.env.N8N_HEADER_SECRET || ''
                },
                body: JSON.stringify(body)
            });

            console.log('n8n response status:', response.status);

            const responseText = await response.text();
            console.log('Raw n8n response:', responseText);

            try {
                const parsedData = JSON.parse(responseText);
                console.log('Parsed data:', parsedData);

                // n8n sends an array, take the first item
                const result = Array.isArray(parsedData) ? parsedData[0] : parsedData;
                const aiOutput = result.output;

                if (!aiOutput) {
                    console.log('No output field found in result:', result);
                    throw new Error('No output in response');
                }

                // AI output is JSON string, parse it
                let onderwerp, body;
                try {
                    const parsed = JSON.parse(aiOutput);
                    onderwerp = parsed.onderwerp || '';
                    body = parsed.body || aiOutput; // fallback to raw output if body missing
                } catch {
                    // Fallback if it's not JSON
                    onderwerp = '';
                    body = aiOutput;
                }

                data = { onderwerp, body };
                console.log('Final formatted data:', data);
            } catch (e: any) {
                console.log('Parse or Extract error:', e.message);
                throw e;
            }

            if (!response.ok) {
                throw new Error(`n8n responded with status: ${response.status}`);
            }
        } catch (error) {
            console.error('Core fetch/process error:', error);
            throw error;
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error generating email text:', error);
        return NextResponse.json(
            { error: 'Failed to generate email text' },
            { status: 500 }
        );
    }
}
