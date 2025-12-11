import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
	return NextResponse.json({ message: 'Storage connector test endpoint' })
}

export async function POST(request: NextRequest) {
	return NextResponse.json({ message: 'Storage connector test endpoint' })
}
