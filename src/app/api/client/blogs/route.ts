import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {nativePublicBlogs} from '@/lib/db/repository/native-content';
export async function GET(request:NextRequest){
 try{
  const params=request.nextUrl.searchParams,limit=Number(params.get('limit')||50);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)return nativeResponseJson({error:'Invalid limit'},{status:400});
  const db=getNativeDatabase();const [blogs,rows]=await Promise.all([nativePublicBlogs(db,{category:params.get('category'),featured:params.get('featured')==='true',search:params.get('search'),limit}),db.collection('blogs').where('isActive','==',true).select('category').get()]);
  const categories=[...new Set(rows.docs.map(doc=>doc.get('category')).filter(Boolean))];return nativeResponseJson({blogs,categories,total:blogs.length});
 }catch{return nativeResponseJson({error:'Failed to fetch blogs'},{status:500});}
}
