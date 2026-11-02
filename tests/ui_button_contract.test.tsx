import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '../src/components/ui/button';

// A legacy migration must behave like the native element, including the
// absence of a type attribute (forms depend on the browser's submit default).
for (const props of [
  { className: 'p-2 px-3 md:px-4 hover:bg-zinc-800', name: 'intent', value: 'save' },
  { className: '  text-xs  bg-[#141416]  ', disabled: true, type: 'submit' as const, 'aria-describedby': 'error' },
  { className: 'focus-visible:outline data-[state=active]:text-white', type: 'button' as const, title: 'Preview', tabIndex: 0 },
]) {
  const children = <><svg aria-hidden="true" width="12" height="12"><path d="M0 0h1" /></svg><span>Action</span></>;
  const native = renderToStaticMarkup(<button {...props}>{children}</button>);
  const migrated = renderToStaticMarkup(<Button {...props}>{children}</Button>).replace(' data-slot="button"', '');
  assert.equal(migrated, native, 'Native classes, attributes, disabled/type semantics and icon dimensions must be preserved');
}
const anchor = renderToStaticMarkup(<Button asChild className="px-3"><a href="/saved-reels" aria-label="Saved reels">Open</a></Button>);
assert.equal((anchor.match(/<a /g) || []).length, 1);
assert.ok(!anchor.includes('<button'), 'asChild must not nest a button inside a link');
assert.ok(anchor.includes('href="/saved-reels"') && anchor.includes('aria-label="Saved reels"'));
const action = renderToStaticMarkup(<Button variant="secondary" size="sm" type="button" disabled aria-label="Close">Close</Button>);
assert.ok(action.includes('bg-zinc-800') && action.includes('h-8'));
assert.ok(action.includes('focus-visible:ring-2') && action.includes('disabled:pointer-events-none'));
assert.ok(!action.includes('variant=') && !action.includes('size='), 'Styling props must not leak into native DOM attributes');
assert.ok(action.includes('type="button"') && action.includes('disabled=""') && action.includes('aria-label="Close"'));
console.log('PASS: shared Button preserves native form/disabled/attribute/class/icon contracts and single-element link composition');
