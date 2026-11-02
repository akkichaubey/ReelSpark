import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Input } from '../src/components/ui/input';
import { Textarea } from '../src/components/ui/textarea';

for (const type of ['text', 'email', 'password', 'number', 'hidden'] as const) {
  const props = { type, name: 'field', defaultValue: 'sample', required: true,
    disabled: true, className: 'w-full px-3 md:px-4', 'aria-describedby': 'hint' };
  assert.equal(renderToStaticMarkup(<Input {...props} />).replace(' data-slot="input"', ''),
    renderToStaticMarkup(<input {...props} />));
}
const props = { name: 'caption', rows: 4, maxLength: 100, defaultValue: 'First\nSecond',
  className: 'resize-y', 'aria-invalid': true as const };
assert.equal(renderToStaticMarkup(<Textarea {...props} />).replace(' data-slot="textarea"', ''),
  renderToStaticMarkup(<textarea {...props} />));
console.log('PASS: shared fields preserve native form values, validation, disabled state, attributes and multiline text');
