import {NextResponse} from 'next/server';import {session} from '@/lib/auth';export async function GET(){return NextResponse.json({user:await session()})}
