import dotenv from 'dotenv';
import {createHash} from 'node:crypto';
import {getNativeDatabase} from '../src/lib/db/database';

/**
 * Read-only diagnosis for the "Phone number or email is already registered" toast
 * raised by createNativeStaffUser (POST /api/users).
 *
 * It reproduces, without writing anything, the three conditions that gate that error:
 *   1. _nativeUserKeys claims exist for the contact
 *   2. a user row matches any nativePhoneVariations(phone) form
 *   3. a user row matches the exact lowercased email
 */

dotenv.config({path: '.env', quiet: true});
dotenv.config({path: '.env.local', override: true, quiet: true});

const PHONE = process.argv[2] || '+919039620922';
const EMAIL = process.argv[3] || 'rakesh17191z@gmail.com';

function nativePhoneVariations(phone: string) {
  const digits = phone.replace(/^\+/, '');
  return [...new Set([phone, digits, ...(phone.startsWith('+91') && digits.length === 12 ? [digits.slice(2)] : [])])];
}

function claimId(kind: string, value: string) {
  return createHash('sha256').update(kind + '\0' + value).digest('hex');
}

const db = getNativeDatabase();
const users = db.collection('users');

async function main() {
  const variations = nativePhoneVariations(PHONE);
  const email = EMAIL.trim().toLowerCase();

  // 1. Claim-table conditions (what createNativeStaffUser checks first).
  const phoneClaim = claimId('phone', PHONE);
  const emailClaim = claimId('email', email);
  const [phoneClaimDoc, emailClaimDoc] = await Promise.all([
    db.collection('_nativeUserKeys').doc(phoneClaim).get(),
    db.collection('_nativeUserKeys').doc(emailClaim).get(),
  ]);

  // 2. Raw phone scan using the exact same operator as the route.
  const phoneMatches = await users.where('phone', 'in', variations).get();

  // 3. Raw email scan using the exact same operator as the route.
  const emailMatches = await users.where('email', '==', email).get();

  // Extra: which of the three stored shapes actually collide.
  const shapeCounts: Record<string, number> = {};
  for (const shape of variations) {
    shapeCounts[shape] = (await users.where('phone', '==', shape).get()).size;
  }

  const matchedDocs = [...phoneMatches.docs, ...emailMatches.docs];
  const phoneClaims = await Promise.all(matchedDocs.map(doc => {
    const phone = doc.get('phone');
    return phone ? db.collection('_nativeUserKeys').doc(claimId('phone', phone)).get() : null;
  }));

  const rows = matchedDocs.map((doc, index) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      phone: data.phone ?? null,
      phoneMatched: variations.includes(data.phone),
      email: data.email ?? null,
      emailMatched: data.email === email,
      role: data.role ?? null,
      status: data.status ?? null,
      clientStatus: data.clientStatus ?? null,
      onboardingCompleted: data.onboardingCompleted ?? null,
      clientId: data.clientId ?? null,
      createdBy: data.createdBy ?? null,
      createdAt: data.createdAt ?? null,
      hasPhoneClaim: phoneClaims[index]?.exists ?? false,
    };
  });

  const claimsExist = phoneClaimDoc.exists || emailClaimDoc.exists;
  const phoneCollision = phoneMatches.size > 0;
  const emailCollision = emailMatches.size > 0;

  console.log(JSON.stringify({
    input: {phone: PHONE, email},
    variations,
    firingConditions: {
      '1_claim_table_hit': claimsExist,
      '2_phone_scan_hit': phoneCollision,
      '3_email_scan_hit': emailCollision,
      wouldThrowToast: claimsExist || phoneCollision || emailCollision,
    },
    claimDetails: {
      phoneClaimId: phoneClaim,
      phoneClaimExists: phoneClaimDoc.exists,
      phoneClaimUserId: phoneClaimDoc.exists ? phoneClaimDoc.get('userId') : null,
      emailClaimId: emailClaim,
      emailClaimExists: emailClaimDoc.exists,
      emailClaimUserId: emailClaimDoc.exists ? emailClaimDoc.get('userId') : null,
    },
    storedPhoneShapeCounts: shapeCounts,
    matchingUserRows: rows,
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.terminate();
  });
