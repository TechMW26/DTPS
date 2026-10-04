import {getServerSession} from 'next-auth';
import '@testing-library/jest-dom';

// Unit/route tests provide explicit provider mocks. Firestore suites use their own
// emulator-only configuration and scoped fixtures, never a shared live database.
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
process.env.NEXTAUTH_SECRET=process.env.NEXTAUTH_SECRET||'synthetic-unit-test-secret';
afterEach(()=>{jest.mocked(getServerSession).mockReset();});
