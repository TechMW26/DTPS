import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {nativePublicPaymentLink,NativeInvoiceError} from '@/lib/db/repository/native-invoices';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const paymentLink=await nativePublicPaymentLink(getNativeDatabase(),(await params).id);return paymentLink?nativeResponseJson({success:true,paymentLink}):nativeResponseJson({error:'Payment link not found'},{status:404});}catch(error){return nativeResponseJson({error:error instanceof NativeInvoiceError?error.message:'Unable to load payment link'},{status:error instanceof NativeInvoiceError?error.status:503});}}
