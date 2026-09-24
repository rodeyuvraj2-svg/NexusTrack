import { createFileRoute } from '@tanstack/react-router';
import { redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/discover-redirect')({
  beforeLoad: () => {
    throw redirect({ to: '/_authenticated/discover' });
  },
});