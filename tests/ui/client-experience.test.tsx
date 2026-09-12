/** @jest-environment jsdom */
import React, { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  cleanup,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { ClientRouteSurface } from "@/components/client/ClientMotion";
import PageTransition from "@/components/animations/PageTransition";
import { ClientScreenSkeleton } from "@/components/client/ClientScreenSkeleton";
import RecipesPage from "@/app/user/recipes/page";
import { useAnimatedProgress } from "@/hooks/useAnimatedProgress";

import OnboardingPage from '@/app/user/onboarding/page';
jest.mock('next-auth/react', () => { const session = { data: { user: { id: 'synthetic', onboardingCompleted: false } }, status: 'authenticated', update: jest.fn() }; return {useSession: () => session}; });

let mockPath = "/user/recipes";
let mockReduced = false;
jest.mock("next/navigation", () => { const router = {push: jest.fn(), replace: jest.fn()}; return {usePathname: () => mockPath, useRouter: () => router}; });
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));
jest.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
jest.mock("@/hooks/useDebounce", () => ({
  useDebounce: (value: string) => value,
}));
const animate = jest.fn(() => ({ cancel: jest.fn() }));
beforeEach(() => {
  mockPath = "/user/recipes";
  mockReduced = false;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn(() => ({
      matches: mockReduced,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  });
  Element.prototype.animate =
    animate as unknown as typeof Element.prototype.animate;
  animate.mockClear();
});
afterEach(cleanup);

test("route changes animate once, preserve entered values, and never require hidden initial content", () => {
  function Form() {
    const [value, setValue] = useState("");
    return (
      <input
        aria-label="Draft"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  }
  const tree = () => (
    <ClientRouteSurface>
      <PageTransition>
        <Form />
      </PageTransition>
    </ClientRouteSurface>
  );
  const { rerender, container } = render(tree());
  fireEvent.change(screen.getByLabelText("Draft"), {
    target: { value: "Keep this draft" },
  });
  expect(animate).toHaveBeenCalledTimes(1);
  mockPath = "/user/profile";
  rerender(tree());
  expect(screen.getByLabelText("Draft")).toHaveValue("Keep this draft");
  expect(animate).toHaveBeenCalledTimes(2);
  expect(container.querySelector(".opacity-0")).toBeNull();
});

test("reduced motion skips route fades and applies tracker values immediately", () => {
  mockReduced = true;
  function Tracker() {
    const [value, setValue] = useState(0);
    const [, setAnimating] = useState(false);
    const flag = React.useRef(false);
    const update = useAnimatedProgress(setValue, setAnimating, flag);
    return <button onClick={() => update(0, 500, 1000)}>{value}%</button>;
  }
  render(
    <ClientRouteSurface>
      <Tracker />
    </ClientRouteSurface>,
  );
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("button")).toHaveTextContent("50%");
  expect(animate).not.toHaveBeenCalled();
});

test.each([
  ["/user/hydration", "tracker", "Loading water tracker"],
  ["/user/messages", "messages", "Loading messages"],
  ["/user/recipes/123", "detail", "Loading recipes"],
  ["/user/appointments/book", "form", "Loading appointment booking"],
])(
  "gives %s the right accessible loading structure",
  (route, variant, label) => {
    mockPath = route;
    render(<ClientScreenSkeleton />);
    expect(screen.getByRole("status", { name: label })).toHaveAttribute(
      "data-client-skeleton",
      variant,
    );
    expect(screen.queryByRole("button")).toBeNull();
  },
);

test("search retains results, ignores late responses, and exposes a retry on failure", async () => {
  const pending: Array<(r: unknown) => void> = [];
  global.fetch = jest.fn(
    () => new Promise((resolve) => pending.push(resolve)),
  ) as jest.Mock;
  const response = (name: string) => ({
    ok: true,
    json: async () => ({
      recipes: [{ _id: name, name }],
      pagination: { total: 1, pages: 1 },
    }),
  });
  render(<RecipesPage />);
  await act(async () => pending.shift()!(response("Original recipe")));
  const input = screen.getByRole("searchbox", { name: "Search recipes" });
  fireEvent.change(input, { target: { value: "older" } });
  expect(screen.getByText("Original recipe")).toBeVisible();
  const older = pending.shift()!;
  fireEvent.change(input, { target: { value: "newer" } });
  await act(async () => pending.shift()!(response("Newest recipe")));
  await act(async () => older(response("Outdated recipe")));
  expect(screen.getByText("Newest recipe")).toBeVisible();
  expect(screen.queryByText("Outdated recipe")).toBeNull();
  fireEvent.change(input, { target: { value: "failure" } });
  await act(async () => pending.shift()!({ ok: false }));
  expect(screen.getByRole("alert")).toHaveTextContent("Could not load recipes");
  expect(screen.getByText("Newest recipe")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await act(async () => pending.shift()!(response("Recovered recipe")));
  await waitFor(() =>
    expect(screen.getByText("Recovered recipe")).toBeVisible(),
  );
});


test('onboarding preserves the review while saving and prevents duplicate submission', async () => {
  mockPath = '/user/onboarding';
  window.scrollTo = jest.fn();
  let finishSave: (response: unknown) => void;
  global.fetch = jest.fn((_url, init) => init?.method === 'POST'
    ? new Promise(resolve => { finishSave = resolve; })
    : Promise.resolve({ ok: true, json: async () => ({ onboardingCompleted: false }) })) as jest.Mock;
  render(<OnboardingPage />);
  await screen.findByLabelText('Date of birth');
  fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1990-01-15' } });
  fireEvent.change(screen.getByLabelText('Height in centimeters'), { target: { value: '170' } });
  fireEvent.change(screen.getByLabelText('Weight in kilograms'), { target: { value: '70' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: /^Vegetarian No meat/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  const submit = screen.getByRole('button', { name: /Confirm & start/i });
  fireEvent.click(submit);
  expect(screen.getByRole('button', { name: 'Saving your profile…' })).toBeDisabled();
  expect(document.querySelector('[data-client-skeleton]')).toBeNull();
  expect(screen.getByText(/Step 5 of 5/)).toBeVisible();
  fireEvent.click(submit);
  expect((global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  await act(async () => finishSave!({ ok: false, json: async () => ({ error: 'Synthetic failure' }) }));
  expect(screen.getByRole('button', { name: /Confirm & start/i })).toBeEnabled();
});
