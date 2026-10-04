import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeInvoicePayment,NativeInvoiceError} from '@/lib/db/repository/native-invoices';
import {generatePrintableInvoiceHTML,generateEmailInvoiceHTML,buildInvoiceDataFromPayment} from '@/lib/services/invoiceTemplate';
import {sendEmail} from '@/lib/services/email';
type Context={params:Promise<{paymentId:string}>};
function failure(error:unknown){return nativeResponseJson({error:error instanceof NativeInvoiceError?error.message:'Unable to process invoice'},{status:error instanceof NativeInvoiceError?error.status:503});}
async function payment(context:Context,send=false){const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeInvoiceError('Unauthorized',401);return nativeInvoicePayment(getNativeDatabase(),(await context.params).paymentId,session.user.id,send);}
export async function GET(_request:Request,context:Context){try{return new NextResponse(generatePrintableInvoiceHTML(buildInvoiceDataFromPayment(await payment(context))),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch(error){return failure(error);}}
export async function POST(_request:Request,context:Context){try{const row=await payment(context,true),email=row.client?.email||row.payerEmail;if(!email)throw new NativeInvoiceError('Client email not found',400);
 // Staging must never send real customer mail. Preview remains available through GET.
 if(process.env.NODE_ENV!=='production')return nativeResponseJson({error:'Invoice delivery is disabled during local migration testing'},{status:409});
 const data=buildInvoiceDataFromPayment(row),message=generateEmailInvoiceHTML(data),sent=await sendEmail({to:email,subject:message.subject,html:message.html,text:message.text});
 if(!sent)throw new NativeInvoiceError('Invoice delivery failed',502);return nativeResponseJson({success:true,message:'Invoice sent',invoiceNumber:data.invoiceNumber,sentTo:email});
 }catch(error){return failure(error);}}
