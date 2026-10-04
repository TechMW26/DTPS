import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {saveNativeBlog,readNativeBlog,deleteNativeBlog,listNativeBlogs} from '@/lib/db/repository/native-blogs';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native blog publication',()=>{
 let db:ReturnType<typeof getNativeDatabase>;beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{await db.terminate();});
 it('keeps slug and first publication date stable during edits and excludes removed posts',async()=>{
  const actor=randomBytes(12).toString('hex'),input={title:'Synthetic article',description:'Test only',content:'<p>Test only</p>',category:'wellness',author:'Synthetic author',readTime:5,tags:[],isActive:false,isFeatured:false,displayOrder:0,featuredImage:'https://example.com/image.jpg'};
  const draft=await saveNativeBlog(db,actor,input);expect(draft.publishedAt).toBeUndefined();
  const published=await saveNativeBlog(db,actor,{isActive:true},draft._id);expect(published.publishedAt).toBeInstanceOf(Date);
  const edited=await saveNativeBlog(db,actor,{title:'New title'},draft._id);expect(edited.slug).toBe(draft.slug);expect(edited.publishedAt).toEqual(published.publishedAt);expect(edited.content).toBe(input.content);
  const found=await listNativeBlogs(db,new URLSearchParams({search:'New title'}));expect(found.some(row=>row._id===draft._id)).toBe(true);
  await saveNativeBlog(db,actor,{isActive:false},draft._id);expect((await listNativeBlogs(db,new URLSearchParams())).some(row=>row._id===draft._id)).toBe(false);
  await deleteNativeBlog(db,draft._id);await expect(readNativeBlog(db,draft._id)).rejects.toMatchObject({status:404});
 });
 it('rejects malformed content before any persistence',async()=>{await expect(saveNativeBlog(db,'synthetic',{title:''})).rejects.toMatchObject({status:400});});
});
