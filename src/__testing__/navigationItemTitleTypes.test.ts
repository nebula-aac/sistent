import { execFileSync } from 'child_process';
import path from 'path';

// Type-level regression guard for https://github.com/layer5io/sistent/issues/1746.
//
// `NavigationNavbar` renders `NavigationItem['title']` into MUI's `ListItemText`
// `primary` slot, which is typed `React.ReactNode`. While `title` was declared
// `string`, composed labels rendered correctly but did not type-check, and
// consumers reached for `as unknown as string`.
//
// jest transforms with @swc/jest, which strips types without checking them, so a
// plain type-only assertion file would pass no matter what `title` is declared
// as. This test therefore shells out to `tsc` over a fixture that exercises both
// a plain string and a composed `ReactNode` title.
//
// Diagnostics are filtered to the fixture itself: type-checking it pulls in the
// component's transitive dependencies, which carry pre-existing errors unrelated
// to this contract (see CLAUDE.md, "Repo state that looks broken but is
// pre-existing"). The fixture's own `@ts-expect-error` self-check fails loudly if
// the compiler ever stops checking it, so filtering cannot make this vacuous.

const FIXTURE = 'src/__testing__/fixtures/navigationItemTitle.tsx';
const PROJECT = 'src/__testing__/fixtures/tsconfig.navigationItemTitle.json';
const repoRoot = path.resolve(__dirname, '..', '..');

const typeCheckFixture = (): string[] => {
  let output: string;
  try {
    output = execFileSync('npx', ['tsc', '-p', PROJECT], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    // tsc exits non-zero whenever any file in the program has an error, including
    // the pre-existing ones outside the fixture. Read its stdout rather than
    // treating the exit code as the verdict.
    const spawned = error as { stdout?: string; stderr?: string; message?: string };
    output = spawned.stdout ?? spawned.stderr ?? spawned.message ?? '';
  }

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(FIXTURE));
};

describe('NavigationItem title type contract', () => {
  it('accepts both a plain string and a composed ReactNode title', () => {
    expect(typeCheckFixture()).toEqual([]);
  }, 180_000);
});
