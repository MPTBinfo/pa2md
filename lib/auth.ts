import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { timingSafeEqual } from 'crypto';
export type Account = { email:string; role:'Super Admin'|'MD'|'MD Office'|'Officer'|'Viewer'; name:string };
const key = () => { const v=process.env.SESSION_SECRET; if(!v || v.length<32) throw new Error('SESSION_SECRET must be at least 32 characters'); return new TextEncoder().encode(v); };
export async function createSession(account:Account){const jwt=await new SignJWT(account).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('8h').sign(key());(await cookies()).set('mptb_session',jwt,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:28800});}
export async function session():Promise<Account|null>{const jwt=(await cookies()).get('mptb_session')?.value;if(!jwt)return null;try{const {payload}=await jwtVerify(jwt,key());if(typeof payload.email!=='string'||typeof payload.role!=='string')return null;return {email:payload.email,role:payload.role as Account['role'],name:String(payload.name||payload.email)}}catch{return null}}
export async function clearSession(){(await cookies()).delete('mptb_session')}
export function matchCredential(input:string, expected:string){const a=Buffer.from(input),b=Buffer.from(expected);return a.length===b.length && timingSafeEqual(a,b)}
export function canRead(account:Account,table:string,record:Record<string,string>){if(['Users','Settings','Audit_Log'].includes(table))return account.role==='Super Admin';const conf=record.confidentiality||record.classification||'Internal';if(conf==='Personal')return account.role==='Super Admin'||record.owner_email===account.email||record.created_by===account.email;if(['Confidential','Restricted'].includes(conf))return ['Super Admin','MD','MD Office'].includes(account.role);return true}
export function canWrite(account:Account,table:string,record:Record<string,string>){if(!canRead(account,table,record))return false;if(account.role==='Viewer')return false;if(['Users','Settings','Audit_Log','MD_Profiles','MD_Tenures'].includes(table))return account.role==='Super Admin';if(['People','Organizations','Departments','MD_Team','Affiliations'].includes(table))return ['Super Admin','MD Office'].includes(account.role);if(table==='Visitors')return ['Super Admin','MD Office'].includes(account.role);return true}
