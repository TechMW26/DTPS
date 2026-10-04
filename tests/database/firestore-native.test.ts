import { nativeDatabaseSettings } from '@/lib/db/firestore-native';

it('uses a credential-free isolated local emulator', () => {
  expect(nativeDatabaseSettings({FIRESTORE_EMULATOR_HOST:'127.0.0.1:8185'})).toEqual({
    projectId:'demo-dtps-native', databaseId:'(default)', emulator:'127.0.0.1:8185',
  });
});
it.each([
  {VERCEL:'1'}, {NODE_ENV:'production'},
  {FIRESTORE_EMULATOR_HOST:'external.example:8185'},
  {FIRESTORE_EMULATOR_HOST:'localhost:8185',FIRESTORE_NATIVE_PROJECT_ID:'dtps-2cbac'},
  {FIREBASE_PROJECT_ID:'push-project',FIREBASE_PRIVATE_KEY:'push-key'},
])('fails closed for production, remote emulator hosts, or missing dedicated credentials: %o', env => {
  expect(() => nativeDatabaseSettings(env)).toThrow();
});

const nativeCredentials = {
  FIRESTORE_NATIVE_PROJECT_ID:'dtps-2cbac', FIRESTORE_NATIVE_DATABASE_ID:'dtps-native-staging',
  FIRESTORE_NATIVE_CLIENT_EMAIL:'database@example.test', FIRESTORE_NATIVE_PRIVATE_KEY:'test-key',
};
it('requires explicit cutover configuration and rejects deployed emulators', () => {
  expect(() => nativeDatabaseSettings({...nativeCredentials,NODE_ENV:'production'})).toThrow();
  const deployed = {...nativeCredentials,NODE_ENV:'production',FIRESTORE_NATIVE_PRODUCTION_ENABLED:'true'};
  expect(nativeDatabaseSettings(deployed).databaseId).toBe('dtps-native-staging');
  expect(() => nativeDatabaseSettings({...deployed,FIRESTORE_EMULATOR_HOST:'localhost:8485'})).toThrow();
  expect(() => nativeDatabaseSettings({...deployed,FIRESTORE_NATIVE_PROJECT_ID:'another-project'})).toThrow();
});
