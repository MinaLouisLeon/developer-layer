// A Developer Layer addition, loaded alongside upstream's own setup. See
// ../VENDOR.md.
//
// Testing Library gives every `findBy*` one second to succeed. That is ample
// on a developer's machine and too tight on a CI runner already running
// forty-nine test files in parallel: the suite went green here three times in
// a row and then failed once on GitHub, on an assertion that was correct and
// simply had not happened yet.
//
// Raising the ceiling weakens nothing. A `findBy*` returns the moment its
// element appears, so a passing test is no slower; the only thing that changes
// is how long a genuinely failing one takes to say so.
import { configure } from "@testing-library/dom";

configure({ asyncUtilTimeout: 5_000 });
