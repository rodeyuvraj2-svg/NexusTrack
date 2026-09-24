import { redirect } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/discover-redirect')({
  beforeLoad: () => {
    throw redirect({ to: '/discover' });
  },
});