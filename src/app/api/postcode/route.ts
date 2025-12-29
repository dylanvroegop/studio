import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postcode = searchParams.get('postcode');
  const number = searchParams.get('number');

  if (!postcode || !number) return NextResponse.json({ error: 'Missing data' }, { status: 400 });

  try {
    const res = await fetch(`https://api.postcodeapi.nu/v3/lookup/${postcode}/${number}`, {
      headers: { 'X-Api-Key': process.env.POSTCODE_API_KEY || '' }
    });

    const data = await res.json();

    // Mapping the specific postcodeapi.nu structure to your form fields
    return NextResponse.json({
      street: data.street || '',
      city: data.city?.label || data.city || ''
    });
  } catch (error) {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}