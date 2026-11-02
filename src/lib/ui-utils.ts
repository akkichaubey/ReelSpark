import { cx } from 'class-variance-authority';

// Preserve legacy class strings/order. Automatic Tailwind conflict removal can
// silently change the existing editor's responsive and state-specific styles.
export const cn = cx;
