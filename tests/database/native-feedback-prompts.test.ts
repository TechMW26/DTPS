import {getNativeDatabase} from '@/lib/db/database';
import {recordSelfReportedFeedback} from '@/lib/feedback/eligibility';
import {markFeedbackPopupShown, resolveFeedbackPrompts} from '@/lib/feedback/prompts';
process.env.FEEDBACK_TOKEN_SECRET ||= 'local-test-secret';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
const DAY=24*60*60*1000;
suite('onboarding / feedback popups',()=>{
 let db:ReturnType<typeof getNativeDatabase>;
 const now=new Date('2026-11-20T06:00:00Z');
 beforeAll(async()=>{
  db=getNativeDatabase();
  await db.collection('users').doc('prompt-client').set({role:'client',status:'active',firstName:'Prompt',createdAt:new Date(now.getTime()-30*DAY)});
  await db.collection('users').doc('prompt-new').set({role:'client',status:'active',firstName:'New',createdAt:new Date(now.getTime()-5*DAY)});
  await db.collection('clientmealplans').doc('prompt-plan').set({clientId:'prompt-client',status:'active',isDeleted:false,firstPublishedAt:new Date(now.getTime()-12*DAY),createdAt:new Date(now.getTime()-13*DAY)});
  await db.collection('clientmealplans').doc('prompt-draft').set({clientId:'prompt-new',status:'draft',isDeleted:false,createdAt:new Date(now.getTime()-20*DAY)});
  await db.collection('clientmealplans').doc('prompt-new-plan').set({clientId:'prompt-new',status:'active',isDeleted:false,firstPublishedAt:new Date(now.getTime()-3*DAY)});
 });
 afterAll(async()=>{for(const c of ['users','clientmealplans','user_feedback_prompts','user_feedback_submissions','user_feedback_pending']){const docs=await db.collection(c).get();for(const d of docs.docs)await d.ref.delete();}await db.terminate();});
 it('shows both forms on day 10+ and then waits 24 hours across all sections',async()=>{
  const first=await resolveFeedbackPrompts(db,'prompt-client',{now});
  expect(first).toMatchObject({onboardingDue:true,feedbackDue:true,showPopup:true});
  await markFeedbackPopupShown(db,'prompt-client',{now});
  expect((await resolveFeedbackPrompts(db,'prompt-client',{now:new Date(now.getTime()+60*1000)})).showPopup).toBe(false);
  // Showing again inside the window (refresh / another section) does not move the window.
  await markFeedbackPopupShown(db,'prompt-client',{now:new Date(now.getTime()+5*60*60*1000)});
  expect((await resolveFeedbackPrompts(db,'prompt-client',{now:new Date(now.getTime()+DAY-1000)})).showPopup).toBe(false);
  expect((await resolveFeedbackPrompts(db,'prompt-client',{now:new Date(now.getTime()+DAY)})).showPopup).toBe(true);
 });
 it('removes the feedback reminder once the form is submitted',async()=>{
  await recordSelfReportedFeedback(db,'prompt-client','recurring',{now});
  const after=await resolveFeedbackPrompts(db,'prompt-client',{now:new Date(now.getTime()+1000)});
  expect(after.feedbackDue).toBe(false);
  expect(after.onboardingDue).toBe(true);
 });
 it('counts from the published plan, not drafts or joining date',async()=>{
  const prompts=await resolveFeedbackPrompts(db,'prompt-new',{now});
  expect(prompts.feedbackDue).toBe(false);
  expect(prompts.onboardingDue).toBe(true);
  expect(prompts.showPopup).toBe(true);
  expect(new Date(prompts.feedbackDueFrom!).getTime()).toBeGreaterThan(now.getTime());
 });
});
