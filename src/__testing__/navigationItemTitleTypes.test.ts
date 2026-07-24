import { spawnSync } from 'child_process';
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
//
// Everything below the filter exists so that the guard fails closed. Filtering
// is the one place a compiler check can quietly turn into a no-op: every outcome
// that is not "tsc ran, compiled the fixture, and reported on it" has to be made
// to fail rather than collapse into an empty, green list of diagnostics.

const FIXTURE = 'src/__testing__/fixtures/navigationItemTitle.tsx';
const PROJECT = 'src/__testing__/fixtures/tsconfig.navigationItemTitle.json';
const repoRoot = path.resolve(__dirname, '..', '..');

// `<file>(<line>,<col>): error TS….` The file part is what scopes a diagnostic,
// so it is parsed rather than prefix-matched: tsc prints paths relative to its
// cwd only while the fixture stays under it, and a bare `startsWith` would read
// any other emission as "the fixture is clean".
const FILE_SCOPED_DIAGNOSTIC = /^(.+?)\(\d+,\d+\): error TS\d+/;

// `error TS…` with no file part is a config-level failure - TS18003 "No inputs
// were found in config file", TS5083 "Cannot read file" - and means the fixture
// was never compiled at all. The fixture filter drops these on the floor, and
// the fixture's `@ts-expect-error` self-check cannot see them either, because
// neither fires unless the compiler had the fixture in its program.
const CONFIG_SCOPED_DIAGNOSTIC = /^error TS\d+/;

type Diagnostics = { fixture: string[]; config: string[] };

const typeCheckFixture = (): Diagnostics => {
  // Spawned through `process.execPath` rather than `npx`: no shell, no PATH
  // lookup, and no `npx` vs `npx.cmd` divergence on Windows, where an ENOENT
  // would otherwise be caught and laundered into the diagnostic output.
  const tsc = spawnSync(
    process.execPath,
    [require.resolve('typescript/bin/tsc'), '-p', PROJECT, '--pretty', 'false'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      // tsc reports on every file in the program, and the fixture's transitive
      // dependencies are a large share of `src/`. The 1 MB default would kill
      // the child mid-stream and truncate stdout - and the fixture is a root
      // file, so its diagnostics are emitted last and lost first.
      maxBuffer: 32 * 1024 * 1024
    }
  );

  // A compiler that never ran is not a compiler that found nothing.
  if (tsc.error) throw tsc.error;
  if (tsc.status === null) {
    throw new Error(`tsc was killed by ${tsc.signal ?? 'an unknown signal'} before reporting`);
  }

  // tsc exits non-zero whenever any file in the program has an error, including
  // the pre-existing ones outside the fixture, so the exit code is not the
  // verdict here - the diagnostics are.
  const lines = `${tsc.stdout}\n${tsc.stderr}`.split('\n').map((line) => line.trim());

  const belongsToFixture = (line: string): boolean => {
    const file = FILE_SCOPED_DIAGNOSTIC.exec(line)?.[1];
    return file !== undefined && file.replace(/\\/g, '/').endsWith(FIXTURE);
  };

  return {
    fixture: lines.filter(belongsToFixture),
    config: lines.filter((line) => CONFIG_SCOPED_DIAGNOSTIC.test(line))
  };
};

describe('NavigationItem title type contract', () => {
  let diagnostics: Diagnostics;

  beforeAll(() => {
    diagnostics = typeCheckFixture();
  }, 180_000);

  it('compiles the fixture at all', () => {
    expect(diagnostics.config).toEqual([]);
  });

  it('accepts both a plain string and a composed ReactNode title', () => {
    expect(diagnostics.fixture).toEqual([]);
  });
});
